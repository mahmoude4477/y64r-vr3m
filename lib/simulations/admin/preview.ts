import { prioritizeViolations } from "@/lib/scoring";
import { attemptOutcome, reviewStage } from "../engine";
import type { ResultModel, ResultStep, ReviewStage } from "../result-model";
import type { PreviewData } from "./queries";

/**
 * The admin preview's result, computed in the browser from the choices made (nothing is saved). Uses the same
 * scoring as a real attempt (engine.attemptOutcome over @/lib/scoring) and returns the result page's model, so the
 * preview shows exactly what a trainee would see. Pure and unit-tested.
 */
export function buildPreviewResult(data: PreviewData, answers: Readonly<Record<string, readonly string[]>>, durationSec: number): ResultModel {
  const stepById = new Map(data.steps.map((s) => [s.id, s]));
  const options = data.stages.flatMap((stage) =>
    stage.options.map((o) => ({ id: o.id, stageId: stage.id, stepId: o.stepId, isCorrect: o.isCorrect, isCritical: o.isCritical })),
  );
  const outcome = attemptOutcome({
    options,
    answers: data.stages.map((stage) => ({ stageId: stage.id, optionIds: answers[stage.id] ?? [] })),
    steps: data.steps,
  });

  const stages = data.stages.map((stage, i): ReviewStage => {
    const review = reviewStage(stage.kind, stage.options, answers[stage.id] ?? []);
    return {
      id: stage.id,
      number: i + 1,
      kind: stage.kind,
      prompt: stage.prompt,
      context: stage.context,
      answered: review.answered,
      correct: review.correct,
      options: review.options.map((o) => {
        const step = o.stepId ? stepById.get(o.stepId) : undefined;
        return {
          id: o.id,
          text: o.text,
          feedback: o.feedback,
          state: o.state,
          criticalChosen: o.state === "chosen_wrong" && o.isCritical,
          step: step ? { text: step.text, critical: step.isCritical, source: step.source } : null,
        };
      }),
    };
  });

  const toStep = (id: string): ResultStep[] => {
    const s = stepById.get(id);
    return s ? [s] : [];
  };
  const byOrder = (a: ResultStep, b: ResultStep) => a.order - b.order;
  const violated = outcome.outcomes.filter((o) => !o.compliant).flatMap((o) => toStep(o.stepId)).sort(byOrder);
  const strengths = outcome.outcomes.filter((o) => o.compliant).flatMap((o) => toStep(o.stepId)).sort(byOrder);
  const criticalIds = outcome.outcomes
    .filter((o) => o.critical || (!o.compliant && stepById.get(o.stepId)?.isCritical))
    .map((o) => o.stepId);

  return {
    scenario: { slug: data.scenario.slug, title: data.scenario.title, protocol: data.scenario.protocol },
    score: outcome.score,
    riskLevel: outcome.riskLevel,
    completedAt: null,
    durationSec,
    stagesCorrect: stages.filter((s) => s.correct).length,
    stagesTotal: stages.length,
    stages,
    violated,
    criticalIds,
    strengths,
    debrief: null,
  };
}

/** The rule-based "what to work on" list of a preview result (no scenario links: the admin is previewing one). */
export function previewRecommendations(model: ResultModel) {
  const critical = new Set(model.criticalIds);
  return prioritizeViolations(model.violated, model.criticalIds).map((step) => ({
    step,
    critical: step.isCritical || critical.has(step.id),
    scenario: null,
  }));
}
