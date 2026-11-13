import type { Locale } from "next-intl";
import type { RiskLevel } from "@/generated/prisma/enums";
import { pick, pickOrNull } from "@/lib/i18n-content";
import type { ViolatedStep } from "@/lib/recommendations";
import { type ReviewOptionState, reviewStage, safeExternalUrl, type StageKindValue } from "./engine";
import type { AttemptForResult } from "./queries";

/**
 * Turns a completed attempt (queries.attemptForResult) into what the result page shows, in one language. Pure, so it
 * is unit-tested without a database. The per-step outcomes are the stored SimulationStepResult rows (written once
 * when the attempt completed), never recomputed here.
 */

export type ReviewOption = {
  id: string;
  text: string;
  feedback: string;
  state: ReviewOptionState;
  /** A wrong option that real practice treats as an automatic high risk (only flagged when it was chosen). */
  criticalChosen: boolean;
  step: { text: string; critical: boolean; source: { label: string; url: string | null } | null } | null;
};

export type ReviewStage = {
  id: string;
  number: number;
  kind: StageKindValue;
  prompt: string;
  context: string | null;
  answered: boolean;
  correct: boolean;
  options: ReviewOption[];
};

export type ResultStep = ViolatedStep & {
  order: number;
  text: string;
  rationale: string;
  source: { label: string; url: string | null } | null;
};

export type ResultModel = {
  scenario: { slug: string; title: string; protocol: { slug: string; title: string; icon: string } };
  score: number | null;
  riskLevel: RiskLevel | null;
  completedAt: Date | null;
  durationSec: number | null;
  stagesCorrect: number;
  stagesTotal: number;
  stages: ReviewStage[];
  /** Violated steps (to pass to recommendationsFor) and the ids violated critically. */
  violated: ResultStep[];
  criticalIds: string[];
  strengths: ResultStep[];
  /** The stored debrief: the reader's language first, else the other one (with its language for lang/dir). */
  debrief: { text: string; locale: "ar" | "en"; forReader: boolean } | null;
};

function source(label: string | null, url: string | null): { label: string; url: string | null } | null {
  if (!label) return null;
  return { label, url: safeExternalUrl(url) };
}

export function buildResultModel(attempt: AttemptForResult, locale: Locale): ResultModel {
  const chosenByStage = new Map(attempt.answers.map((a) => [a.stageId, a.optionIds]));
  const stages = attempt.scenario.stages.map((stage, i): ReviewStage => {
    const review = reviewStage(stage.kind, stage.options, chosenByStage.get(stage.id) ?? []);
    return {
      id: stage.id,
      number: i + 1,
      kind: stage.kind,
      prompt: pick(stage, "prompt", locale),
      context: pickOrNull(stage, "context", locale),
      answered: review.answered,
      correct: review.correct,
      options: review.options.map((o) => ({
        id: o.id,
        text: pick(o, "text", locale),
        feedback: pick(o, "feedback", locale),
        state: o.state,
        criticalChosen: o.state === "chosen_wrong" && o.isCritical,
        step: o.step
          ? { text: pick(o.step, "text", locale), critical: o.step.isCritical, source: source(o.step.referenceLabel, o.step.referenceUrl) }
          : null,
      })),
    };
  });

  const toStep = (s: AttemptForResult["stepResults"][number]["step"]): ResultStep => ({
    id: s.id,
    protocolId: s.protocolId,
    order: s.order,
    weight: s.weight,
    isMandatory: s.isMandatory,
    isCritical: s.isCritical,
    text: pick(s, "text", locale),
    rationale: pick(s, "rationale", locale),
    source: source(s.referenceLabel, s.referenceUrl),
  });
  const byOrder = (a: ResultStep, b: ResultStep) => a.order - b.order;
  const violated = attempt.stepResults.filter((r) => !r.compliant).map((r) => toStep(r.step)).sort(byOrder);
  const strengths = attempt.stepResults.filter((r) => r.compliant).map((r) => toStep(r.step)).sort(byOrder);
  const criticalIds = attempt.stepResults.filter((r) => r.critical || (!r.compliant && r.step.isCritical)).map((r) => r.step.id);

  const own = locale === "en" ? attempt.debriefEn : attempt.debriefAr;
  const other = locale === "en" ? attempt.debriefAr : attempt.debriefEn;
  const debrief = own?.trim()
    ? { text: own.trim(), locale: locale === "en" ? ("en" as const) : ("ar" as const), forReader: true }
    : other?.trim()
      ? { text: other.trim(), locale: locale === "en" ? ("ar" as const) : ("en" as const), forReader: false }
      : null;

  return {
    scenario: {
      slug: attempt.scenario.slug,
      title: pick(attempt.scenario, "title", locale),
      protocol: {
        slug: attempt.scenario.protocol.slug,
        title: pick(attempt.scenario.protocol, "title", locale),
        icon: attempt.scenario.protocol.icon,
      },
    },
    score: attempt.score,
    riskLevel: attempt.riskLevel,
    completedAt: attempt.completedAt,
    durationSec: attempt.durationSec,
    stagesCorrect: stages.filter((s) => s.correct).length,
    stagesTotal: stages.length,
    stages,
    violated,
    criticalIds,
    strengths,
    debrief,
  };
}
