/**
 * Pure simulation helpers (no database, no session): used by the server actions, the pages and the player in the
 * browser, and unit-tested in engine.test.ts. Scoring itself lives in @/lib/scoring and is only composed here.
 */
import {
  isStageAnswerCorrect,
  type RiskLevel,
  type ScoreResult,
  scoreSimulation,
  type SimAnswer,
  type SimOption,
  simulationStepOutcomes,
  type StepMeta,
} from "@/lib/scoring";

export type StageKindValue = "single" | "multi";
export type DifficultyValue = "beginner" | "intermediate" | "advanced";
export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const satisfies readonly DifficultyValue[];

export function isDifficulty(value: unknown): value is DifficultyValue {
  return typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------------------------------
// Stage order and answers
// ---------------------------------------------------------------------------------------------------

/** Index of the first stage (in order) without an answer; `stages.length` when every stage is answered. */
export function nextStageIndex(stages: ReadonlyArray<{ id: string }>, answeredStageIds: Iterable<string>): number {
  const answered = new Set(answeredStageIds);
  const index = stages.findIndex((stage) => !answered.has(stage.id));
  return index === -1 ? stages.length : index;
}

export type ChoiceError = "empty" | "too_many" | "unknown_option";

/**
 * Checks a submitted choice against the stage: a single stage takes exactly one option, a multi stage at least
 * one; every id must belong to the stage. Duplicates are dropped. Correctness is not judged here.
 */
export function validateChoice(
  kind: StageKindValue,
  optionIds: readonly string[],
  stageOptionIds: readonly string[],
): { ok: true; optionIds: string[] } | { ok: false; error: ChoiceError } {
  const unique = [...new Set(optionIds)];
  if (unique.length === 0) return { ok: false, error: "empty" };
  if (kind === "single" && unique.length > 1) return { ok: false, error: "too_many" };
  const known = new Set(stageOptionIds);
  if (unique.some((id) => !known.has(id))) return { ok: false, error: "unknown_option" };
  return { ok: true, optionIds: unique };
}

// ---------------------------------------------------------------------------------------------------
// Option order: the same shuffled order on the server and in the browser for one attempt and stage
// ---------------------------------------------------------------------------------------------------

/** 32-bit FNV-1a hash of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small deterministic PRNG in [0, 1). */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates shuffle keyed by `seed` (the attempt id + stage id), so the right answer is not always
 * in the same place, a refresh shows the same order, and a new attempt gets a new one.
 */
export function shuffleOptions<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  const next = random(hash(seed));
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function optionSeed(attemptId: string, stageId: string): string {
  return `${attemptId}:${stageId}`;
}

// ---------------------------------------------------------------------------------------------------
// Completing an attempt
// ---------------------------------------------------------------------------------------------------

/**
 * The longest pause between two moments of an attempt (its start, each saved answer, its completion) that counts as
 * time spent playing. Reading a stage and deciding takes a minute or two; a longer gap means the trainee left
 * ("Continue later", a closed tab, a call on the ward) and came back, so only this much of it counts.
 */
export const MAX_ACTIVE_GAP_SEC = 5 * 60;

/**
 * The time an attempt was actually played, in whole seconds (review round 2, SPEC-1): the gaps between its start,
 * each answer and its completion, each capped at `maxGapSec`, summed. This is what "Time taken" shows and what reports
 * read (SimulationAttempt.durationSec). Calendar time from start to end would count the days away of a resumed attempt.
 * Never negative: the start and the answers (database time) are sorted, and a completion stamped a moment "before" the
 * last answer (clock skew between the app and the database) adds nothing.
 */
export function activeDurationSeconds(
  startedAt: Date,
  answeredAt: readonly Date[],
  completedAt: Date,
  maxGapSec: number = MAX_ACTIVE_GAP_SEC,
): number {
  const times = [startedAt, ...answeredAt].map((d) => d.getTime()).sort((a, b) => a - b);
  times.push(completedAt.getTime());
  const cap = Math.max(0, maxGapSec) * 1000;
  let ms = 0;
  for (let i = 1; i < times.length; i++) ms += Math.min(Math.max(0, times[i] - times[i - 1]), cap);
  return Math.round(ms / 1000);
}

export type AttemptOutcome = {
  /** One row per step mapped by an option (what SimulationStepResult stores). */
  outcomes: Array<{ stepId: string; compliant: boolean; critical: boolean }>;
  result: ScoreResult;
  /** What the attempt row stores: both null when nothing could be assessed (never "0%" or High). */
  score: number | null;
  riskLevel: RiskLevel | null;
};

/** simulationStepOutcomes + scoreSimulation from @/lib/scoring, plus the values to persist. */
export function attemptOutcome(input: {
  options: readonly SimOption[];
  answers: readonly SimAnswer[];
  steps: readonly StepMeta[];
}): AttemptOutcome {
  const outcomes = simulationStepOutcomes({ options: input.options, answers: input.answers });
  const result = scoreSimulation(input.steps, outcomes);
  return {
    outcomes,
    result,
    score: result.assessable ? result.score : null,
    riskLevel: result.assessable ? result.riskLevel : null,
  };
}

// ---------------------------------------------------------------------------------------------------
// Result review
// ---------------------------------------------------------------------------------------------------

/**
 * chosen_correct: picked and right · chosen_wrong: picked but wrong (a mistake) · missed: a right option that was
 * not picked (a mistake) · avoided: a wrong option rightly left out by a real decision · not_chosen: a wrong option
 * that was simply not picked (neutral).
 *
 * "avoided" is praise, so it is only given where leaving the option out was a decision of its own: every option of a
 * multi stage ("choose all that apply" judges each one), and the other options of a one-answer stage answered
 * correctly. When a one-answer stage was answered wrongly (or not at all), the other wrong options were left out
 * only because one answer was picked: they are "not_chosen", never praised (review round 1, SPEC-6).
 */
export type ReviewOptionState = "chosen_correct" | "chosen_wrong" | "missed" | "avoided" | "not_chosen";

export function reviewOptionState(
  option: { id: string; isCorrect: boolean },
  chosen: ReadonlySet<string>,
  stage: { kind: StageKindValue; correct: boolean },
): ReviewOptionState {
  const picked = chosen.has(option.id);
  if (option.isCorrect) return picked ? "chosen_correct" : "missed";
  if (picked) return "chosen_wrong";
  if (chosen.size === 0) return "not_chosen";
  return stage.kind === "multi" || stage.correct ? "avoided" : "not_chosen";
}

/** A stage's review: whether the answer was right (same rule as scoring) and the state of each option. */
export function reviewStage<T extends { id: string; isCorrect: boolean }>(
  kind: StageKindValue,
  options: readonly T[],
  chosenIds: readonly string[],
): { correct: boolean; answered: boolean; options: Array<T & { state: ReviewOptionState }> } {
  const chosen = new Set(chosenIds);
  const correct = chosenIds.length > 0 && isStageAnswerCorrect(options, chosenIds);
  return {
    correct,
    answered: chosenIds.length > 0,
    options: options.map((option) => ({ ...option, state: reviewOptionState(option, chosen, { kind, correct }) })),
  };
}

/**
 * Why an attempt got its risk level, so the result page states the actual reason instead of the rule (review round 1,
 * UX-3). Same rule as @/lib/scoring riskLevelFor: high = a critical step broken or a score under 50; medium = a
 * mandatory step missed or a score under 80; low otherwise. "gaps" is a low risk with steps still to improve; "high"
 * and "medium" are the generic texts for stored data whose cause cannot be told (e.g. step flags changed later).
 */
export type RiskCause = "critical" | "belowHalf" | "high" | "mandatory" | "belowEighty" | "medium" | "gaps" | "clean";

export function riskCause(input: {
  riskLevel: RiskLevel | null;
  score: number | null;
  violated: ReadonlyArray<{ isMandatory: boolean }>;
  criticalIds: readonly string[];
}): RiskCause | null {
  const { riskLevel, score, violated, criticalIds } = input;
  if (!riskLevel || score === null) return null;
  if (riskLevel === "high") return criticalIds.length > 0 ? "critical" : score < 50 ? "belowHalf" : "high";
  if (riskLevel === "medium") return violated.some((s) => s.isMandatory) ? "mandatory" : score < 80 ? "belowEighty" : "medium";
  return violated.length > 0 ? "gaps" : "clean";
}

/** True for the states that are mistakes and need an explanation with the protocol step. */
export function isMistake(state: ReviewOptionState): boolean {
  return state === "chosen_wrong" || state === "missed";
}

// ---------------------------------------------------------------------------------------------------
// Catalogue filters
// ---------------------------------------------------------------------------------------------------

export type CatalogueFilters = { protocol: string | null; difficulty: DifficultyValue | null };

/** Reads ?protocol=<slug>&difficulty=<level> (first value wins, unknown values are ignored). */
export function parseCatalogueFilters(params: Record<string, string | string[] | undefined>): CatalogueFilters {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const protocol = first(params.protocol)?.trim() ?? "";
  const difficulty = first(params.difficulty);
  return {
    protocol: /^[a-z0-9-]{1,80}$/.test(protocol) ? protocol : null,
    difficulty: isDifficulty(difficulty) ? difficulty : null,
  };
}

/** The catalogue URL query for the given filters ("" when none). */
export function catalogueQuery(filters: CatalogueFilters): string {
  const params = new URLSearchParams();
  if (filters.protocol) params.set("protocol", filters.protocol);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** "m:ss" (or "h:mm:ss" from one hour), Latin digits, for the time an attempt took. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = String(s % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Only absolute https links from content are rendered as links (never javascript:, data: or relative URLs). */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
