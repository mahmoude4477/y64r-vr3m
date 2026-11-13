/**
 * One scoring model for simulations and scans (PRODUCT.md section 4). Pure and unit-tested
 * (lib/scoring.test.ts). Never re-implement any of these rules in a feature.
 *
 * - Each applicable step has a weight w (default 1, clamped to 1..3).
 * - score = round(100 * sum(w compliant) / sum(w applicable)); 0 when nothing is applicable; never > 100.
 * - Risk: HIGH if any critical step is violated or score < 50; MEDIUM if any mandatory step is violated
 *   or score < 80; LOW otherwise. When nothing is applicable the result is NOT ASSESSABLE: riskLevel is
 *   null (persist Scan.riskLevel / SimulationAttempt.riskLevel = null, show common.score.notAssessable),
 *   never "high" from the literal 0 < 50 reading, which would inflate the High share in dashboards.
 * - Scans: a step is applicable unless its final verdict is not_applicable. A not_visible step that the
 *   reviewer did not resolve counts as not applicable but is listed (`unresolved`).
 * - Simulations: a step is compliant when every option mapped to it was answered correctly (correct
 *   options chosen, wrong ones avoided). Choosing a critical wrong option violates its step critically.
 * - Recommendations come from the violated steps (rule-based list, always available even if AI fails).
 */

export type RiskLevel = "low" | "medium" | "high";
export type StepOutcome = "compliant" | "non_compliant" | "not_applicable";

export const MIN_WEIGHT = 1;
export const MAX_WEIGHT = 3;
export const HIGH_RISK_BELOW = 50;
export const MEDIUM_RISK_BELOW = 80;

export type ScoredStep = {
  stepId: string;
  weight: number;
  isMandatory: boolean;
  isCritical: boolean;
  outcome: StepOutcome;
  /** Violated critically even if the step itself is not flagged critical (critical wrong option). */
  criticalViolation?: boolean;
  /** Not applicable only because nobody resolved a not_visible verdict (listed in the report). */
  unresolved?: boolean;
  /** No answer at all: no AI verdict and no examiner verdict (e.g. a non-visual step nobody answered). */
  unanswered?: boolean;
};

export type ScoreResult = {
  /** Integer 0..100 (0 when not assessable) */
  score: number;
  /** null when not assessable: store null and show "not assessable" (ScoreBadge score={null}) */
  riskLevel: RiskLevel | null;
  /** false when no step was applicable */
  assessable: boolean;
  applicableWeight: number;
  compliantWeight: number;
  compliant: string[];
  violated: string[];
  criticalViolations: string[];
  mandatoryViolations: string[];
  notApplicable: string[];
  unresolved: string[];
  /** Subset of unresolved with no answer at all (see canFinalizeScan). */
  unanswered: string[];
};

/** Weight clamped to 1..3 and rounded; anything invalid becomes 1. */
export function normalizeWeight(weight: number | null | undefined): number {
  if (typeof weight !== "number" || !Number.isFinite(weight)) return MIN_WEIGHT;
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Math.round(weight)));
}

export function riskLevelFor(input: { score: number; criticalViolation: boolean; mandatoryViolation: boolean }): RiskLevel {
  if (input.criticalViolation || input.score < HIGH_RISK_BELOW) return "high";
  if (input.mandatoryViolation || input.score < MEDIUM_RISK_BELOW) return "medium";
  return "low";
}

export function computeScore(steps: readonly ScoredStep[]): ScoreResult {
  let applicableWeight = 0;
  let compliantWeight = 0;
  const result: Omit<ScoreResult, "score" | "riskLevel" | "assessable" | "applicableWeight" | "compliantWeight"> = {
    compliant: [],
    violated: [],
    criticalViolations: [],
    mandatoryViolations: [],
    notApplicable: [],
    unresolved: [],
    unanswered: [],
  };

  for (const step of steps) {
    if (step.outcome === "not_applicable") {
      result.notApplicable.push(step.stepId);
      if (step.unresolved) result.unresolved.push(step.stepId);
      if (step.unanswered) result.unanswered.push(step.stepId);
      continue;
    }
    const w = normalizeWeight(step.weight);
    applicableWeight += w;
    if (step.outcome === "compliant") {
      compliantWeight += w;
      result.compliant.push(step.stepId);
      continue;
    }
    result.violated.push(step.stepId);
    if (step.isCritical || step.criticalViolation) result.criticalViolations.push(step.stepId);
    if (step.isMandatory) result.mandatoryViolations.push(step.stepId);
  }

  const assessable = applicableWeight > 0;
  const score = assessable ? Math.min(100, Math.max(0, Math.round((100 * compliantWeight) / applicableWeight))) : 0;
  const riskLevel = assessable
    ? riskLevelFor({
        score,
        criticalViolation: result.criticalViolations.length > 0,
        mandatoryViolation: result.mandatoryViolations.length > 0,
      })
    : null;
  return { score, riskLevel, assessable, applicableWeight, compliantWeight, ...result };
}

// ---------------------------------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------------------------------

export type AiVerdict = "compliant" | "non_compliant" | "not_visible";
export type FinalVerdict = "compliant" | "non_compliant" | "not_applicable";

/**
 * The effective outcome of one scan step. The examiner's finalVerdict wins; otherwise the AI verdict
 * stands (the examiner accepted it by finalising); not_visible / no verdict = not applicable + unresolved.
 */
export function scanStepOutcome(input: {
  aiVerdict?: AiVerdict | null;
  finalVerdict?: FinalVerdict | null;
}): { outcome: StepOutcome; unresolved: boolean } {
  if (input.finalVerdict) return { outcome: input.finalVerdict, unresolved: false };
  if (input.aiVerdict === "compliant" || input.aiVerdict === "non_compliant") {
    return { outcome: input.aiVerdict, unresolved: false };
  }
  return { outcome: "not_applicable", unresolved: true };
}

export type StepMeta = { id: string; weight: number; isMandatory: boolean; isCritical: boolean };

export type ScanResultInput = { stepId: string; aiVerdict?: AiVerdict | null; finalVerdict?: FinalVerdict | null };

function isUnanswered(result: ScanResultInput | undefined): boolean {
  return !result || (!result.aiVerdict && !result.finalVerdict);
}

/**
 * Score a scan from its protocol steps and ScanStepResult rows. Steps without a row (or with neither
 * verdict) are unresolved AND listed in `unanswered`. Check canFinalizeScan() before finalising.
 */
export function scoreScan(steps: readonly StepMeta[], results: readonly ScanResultInput[]): ScoreResult {
  const byStep = new Map(results.map((r) => [r.stepId, r]));
  return computeScore(
    steps.map((step) => {
      const result = byStep.get(step.id);
      const { outcome, unresolved } = scanStepOutcome(result ?? {});
      return {
        stepId: step.id,
        weight: step.weight,
        isMandatory: step.isMandatory,
        isCritical: step.isCritical,
        outcome,
        unresolved,
        unanswered: isUnanswered(result),
      };
    }),
  );
}

/**
 * Whether the examiner may finalise (PRODUCT 1: they answer the non-visual steps, then finalise). Every
 * mandatory or critical step needs an answer: a final verdict, or an AI verdict for a visual step. Steps
 * that never get an AI verdict (non-visual ones, or every step when the AI call failed) therefore need the
 * examiner to set finalVerdict. An AI not_visible counts as answered (it stays unresolved and is listed).
 * Optional steps may stay unanswered.
 */
export function canFinalizeScan(
  steps: ReadonlyArray<Pick<StepMeta, "id" | "isMandatory" | "isCritical">>,
  results: readonly ScanResultInput[],
): { ok: boolean; missing: string[] } {
  const byStep = new Map(results.map((r) => [r.stepId, r]));
  const missing = steps.filter((s) => (s.isMandatory || s.isCritical) && isUnanswered(byStep.get(s.id))).map((s) => s.id);
  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------------------------------
// Simulations
// ---------------------------------------------------------------------------------------------------

export type SimOption = { id: string; stageId: string; stepId: string | null; isCorrect: boolean; isCritical: boolean };
export type SimAnswer = { stageId: string; optionIds: readonly string[] };

/** A stage answer is correct when the chosen set equals the set of correct options (single or multi). */
export function isStageAnswerCorrect(
  stageOptions: ReadonlyArray<Pick<SimOption, "id" | "isCorrect">>,
  chosenIds: readonly string[],
): boolean {
  const chosen = new Set(chosenIds);
  const known = new Set(stageOptions.map((o) => o.id));
  for (const id of chosen) if (!known.has(id)) return false;
  return stageOptions.every((o) => (o.isCorrect ? chosen.has(o.id) : !chosen.has(o.id)));
}

/**
 * Per-step outcome of an attempt (what SimulationStepResult stores). Only steps mapped by at least one
 * option are returned; an unanswered stage counts as "nothing chosen".
 */
export function simulationStepOutcomes(input: {
  options: readonly SimOption[];
  answers: readonly SimAnswer[];
}): Array<{ stepId: string; compliant: boolean; critical: boolean }> {
  const chosenByStage = new Map(input.answers.map((a) => [a.stageId, new Set(a.optionIds)]));
  const byStep = new Map<string, { compliant: boolean; critical: boolean }>();
  for (const option of input.options) {
    if (!option.stepId) continue;
    const chosen = chosenByStage.get(option.stageId)?.has(option.id) ?? false;
    const answeredRight = option.isCorrect ? chosen : !chosen;
    const criticalHit = option.isCritical && !option.isCorrect && chosen;
    const current = byStep.get(option.stepId) ?? { compliant: true, critical: false };
    byStep.set(option.stepId, {
      compliant: current.compliant && answeredRight,
      critical: current.critical || criticalHit,
    });
  }
  return [...byStep.entries()].map(([stepId, v]) => ({ stepId, ...v }));
}

/** Score an attempt: steps the scenario does not touch are not applicable. */
export function scoreSimulation(
  steps: readonly StepMeta[],
  outcomes: ReadonlyArray<{ stepId: string; compliant: boolean; critical: boolean }>,
): ScoreResult {
  const byStep = new Map(outcomes.map((o) => [o.stepId, o]));
  return computeScore(
    steps.map((step) => {
      const o = byStep.get(step.id);
      return {
        stepId: step.id,
        weight: step.weight,
        isMandatory: step.isMandatory,
        isCritical: step.isCritical,
        outcome: !o ? "not_applicable" : o.compliant ? "compliant" : "non_compliant",
        criticalViolation: o?.critical ?? false,
      };
    }),
  );
}

// ---------------------------------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------------------------------

/**
 * The rule-based recommendation order for violated steps: critical first, then mandatory, then by
 * weight (desc), then original order. Features attach each step's rationale and a link to a scenario
 * that trains its protocol; an AI summary may be phrased on top, but this list always exists.
 */
export function prioritizeViolations<T extends StepMeta>(violated: readonly T[], criticalIds: readonly string[] = []): T[] {
  const critical = new Set(criticalIds);
  const rank = (s: T) => (s.isCritical || critical.has(s.id) ? 0 : s.isMandatory ? 1 : 2);
  return violated
    .map((step, index) => ({ step, index }))
    .sort(
      (a, b) =>
        rank(a.step) - rank(b.step) ||
        normalizeWeight(b.step.weight) - normalizeWeight(a.step.weight) ||
        a.index - b.index,
    )
    .map((x) => x.step);
}
