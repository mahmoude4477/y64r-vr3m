import "server-only";
import { attemptsOwn, type Scope, scenariosReadable } from "@/lib/authz";
import { takeAppRateLimit } from "@/lib/app-rate-limit";
import { prisma } from "@/lib/prisma";
import { isStageAnswerCorrect } from "@/lib/scoring";
import { canContinueIn, resumableAttempt } from "./attempt-scope";
import { activeDurationSeconds, attemptOutcome, nextStageIndex, type StageKindValue, validateChoice } from "./engine";

/**
 * Attempt lifecycle on the server (start / resume, answer one stage, complete). Every query is scoped with
 * @/lib/authz: an attempt is only ever read or written through attemptsOwn(scope), and a scenario is only started
 * when scenariosReadable(scope) lets the user play it. The server actions in ./actions.ts wrap these.
 *
 * Rules (simulations team, 2026-10-29):
 * - One open attempt per user, scenario and institution (./attempt-scope.ts): starting again resumes it (two tabs
 *   share it); "start over" abandons it and opens a new one. Abandoned attempts keep their answers as history. An
 *   open attempt credited to another institution is left alone: it continues there once that institution is active.
 * - Stages are answered in order and an answer is final ("no going back"): a real decision cannot be undone, the
 *   score reflects the first decision instead of trial and error, and the result page explains every choice.
 * - The last answer completes the attempt in the same request: per-step outcomes and the score come from
 *   @/lib/scoring (simulationStepOutcomes + scoreSimulation) and are stored once (SimulationStepResult). The stored
 *   duration is the time actually played (engine.activeDurationSeconds), not the calendar time since the start.
 * - Every write re-checks that the attempt may still be played (security review, 2026-10-30): its scenario is still
 *   readable (published, of a protocol the user may read, global or of the ACTIVE institution) and the attempt is
 *   credited to no institution or to the active one (./attempt-scope.ts). An unpublished scenario or a replaced
 *   version answers "not_playable"; an attempt of an institution that is not the active one (left, removed, or
 *   switched in another tab) answers "other_institution". Nothing is written into an institution's data after access
 *   to it ended, and the admin's "cannot be finished while unpublished" holds.
 */

export type AttemptError =
  | "not_found"
  | "no_stages"
  | "rate_limited"
  | "not_in_progress"
  | "already_answered"
  | "out_of_order"
  | "invalid_choice"
  | "incomplete"
  | "not_playable"
  /** The attempt is credited to an institution that is not the active one (it stays open for when it is again). */
  | "other_institution";

export type StartResult =
  | { ok: true; attemptId: string; answeredStageIds: string[]; resumed: boolean }
  | { ok: false; error: AttemptError };

/** New attempts per user per hour (start + start over); resuming an open attempt is never limited. */
export const STARTS_PER_HOUR = 60;

function lockKey(scope: Scope, scenarioId: string) {
  return `sim-attempt:${scope.userId}:${scenarioId}`;
}

/** The scenario may be played by the user right now (scenariosReadable). */
async function scenarioPlayable(scope: Scope, scenarioId: string): Promise<boolean> {
  const row = await prisma.scenario.findFirst({ where: { AND: [{ id: scenarioId }, scenariosReadable(scope)] }, select: { id: true } });
  return row !== null;
}

/**
 * Why an open attempt cannot take answers in this context, or null when it can: it must be credited to no institution
 * or to the active one, and its scenario must still be playable.
 */
async function blockedReason(
  scope: Scope,
  attempt: { organizationId: string | null; scenarioId: string },
): Promise<"other_institution" | "not_playable" | null> {
  if (!canContinueIn(attempt.organizationId, scope)) return "other_institution";
  return (await scenarioPlayable(scope, attempt.scenarioId)) ? null : "not_playable";
}

/**
 * Resumes the user's open attempt on this scenario, or starts one. With `restart`, the open attempts that could be
 * continued here are abandoned and a fresh one starts. Serialised per user and scenario (advisory lock), so a double
 * click or two tabs never open two. An open attempt credited to another institution (./attempt-scope.ts) is neither
 * resumed nor closed here: it stays open for when that institution is active again (review round 2, SPEC-2).
 */
export async function startAttempt(scope: Scope, scenarioId: string, options: { restart?: boolean } = {}): Promise<StartResult> {
  const scenario = await prisma.scenario.findFirst({
    where: { AND: [{ id: scenarioId }, scenariosReadable(scope)] },
    select: { id: true, _count: { select: { stages: true } } },
  });
  if (!scenario) return { ok: false, error: "not_found" };
  if (scenario._count.stages === 0) return { ok: false, error: "no_stages" };

  const openSelect = { id: true, organizationId: true, answers: { select: { stageId: true } } } as const;

  if (!options.restart) {
    const current = resumableAttempt(
      await prisma.simulationAttempt.findMany({
        where: { ...attemptsOwn(scope), scenarioId, status: "in_progress" },
        orderBy: { startedAt: "desc" },
        select: openSelect,
      }),
      scope,
    );
    if (current) return { ok: true, attemptId: current.id, answeredStageIds: current.answers.map((a) => a.stageId), resumed: true };
  }
  if (!(await takeAppRateLimit(`sim-start:${scope.userId}`, STARTS_PER_HOUR, 3600))) return { ok: false, error: "rate_limited" };

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(scope, scenarioId)}, 0))`;
    const existing = await tx.simulationAttempt.findMany({
      where: { ...attemptsOwn(scope), scenarioId, status: "in_progress" },
      orderBy: { startedAt: "desc" },
      select: openSelect,
    });
    const current = options.restart ? undefined : resumableAttempt(existing, scope);
    if (current) {
      // Another tab started it a moment ago.
      return { ok: true as const, attemptId: current.id, answeredStageIds: current.answers.map((a) => a.stageId), resumed: true };
    }
    // Start over: every open attempt that could be continued here is closed as unfinished (kept as history). Attempts
    // credited to another institution stay open; without restart none of the open ones can be continued here.
    const closing = options.restart ? existing.filter((a) => canContinueIn(a.organizationId, scope)) : [];
    if (closing.length > 0) {
      await tx.simulationAttempt.updateMany({ where: { id: { in: closing.map((a) => a.id) } }, data: { status: "abandoned" } });
    }
    const created = await tx.simulationAttempt.create({
      data: { userId: scope.userId, organizationId: scope.organizationId, scenarioId },
      select: { id: true },
    });
    return { ok: true as const, attemptId: created.id, answeredStageIds: [], resumed: false };
  });
}

export type AnswerResult =
  | { ok: true; completed: false; nextIndex: number }
  | { ok: true; completed: true; attemptId: string }
  | { ok: false; error: AttemptError };

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/** Saves the answer to the next unanswered stage of the user's open attempt; the last one completes the attempt. */
export async function answerStage(
  scope: Scope,
  input: { attemptId: string; stageId: string; optionIds: readonly string[] },
): Promise<AnswerResult> {
  const attempt = await prisma.simulationAttempt.findFirst({
    where: { id: input.attemptId, ...attemptsOwn(scope) },
    select: {
      id: true,
      status: true,
      organizationId: true,
      scenarioId: true,
      scenario: {
        select: {
          stages: {
            orderBy: { order: "asc" },
            select: { id: true, kind: true, options: { select: { id: true, isCorrect: true } } },
          },
        },
      },
      answers: { select: { stageId: true } },
    },
  });
  if (!attempt) return { ok: false, error: "not_found" };
  if (attempt.status !== "in_progress") return { ok: false, error: "not_in_progress" };
  const blocked = await blockedReason(scope, attempt);
  if (blocked) return { ok: false, error: blocked };

  const stages = attempt.scenario.stages;
  const stage = stages.find((s) => s.id === input.stageId);
  if (!stage) return { ok: false, error: "not_found" };
  const answered = attempt.answers.map((a) => a.stageId);
  if (answered.includes(stage.id)) return { ok: false, error: "already_answered" };
  const index = nextStageIndex(stages, answered);
  if (stages[index]?.id !== stage.id) return { ok: false, error: "out_of_order" };

  const choice = validateChoice(stage.kind as StageKindValue, input.optionIds, stage.options.map((o) => o.id));
  if (!choice.ok) return { ok: false, error: "invalid_choice" };

  try {
    await prisma.simulationAnswer.create({
      data: {
        attemptId: attempt.id,
        stageId: stage.id,
        optionIds: choice.optionIds,
        isCorrect: isStageAnswerCorrect(stage.options, choice.optionIds),
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "already_answered" }; // another tab, same stage
    throw e;
  }

  if (index + 1 < stages.length) return { ok: true, completed: false, nextIndex: index + 1 };
  const done = await completeAttempt(scope, attempt.id);
  return done.ok ? { ok: true, completed: true, attemptId: attempt.id } : done;
}

export type CompleteResult = { ok: true; attemptId: string } | { ok: false; error: AttemptError };

/**
 * Scores the user's open attempt once every stage is answered, stores the per-step outcomes and closes it.
 * Idempotent: an attempt that is already completed answers ok (a retry after a lost response).
 */
export async function completeAttempt(scope: Scope, attemptId: string, now: Date = new Date()): Promise<CompleteResult> {
  const attempt = await prisma.simulationAttempt.findFirst({
    where: { id: attemptId, ...attemptsOwn(scope) },
    select: {
      id: true,
      status: true,
      organizationId: true,
      scenarioId: true,
      startedAt: true,
      scenario: {
        select: {
          stages: {
            select: {
              id: true,
              options: { select: { id: true, stageId: true, stepId: true, isCorrect: true, isCritical: true } },
            },
          },
        },
      },
      answers: { select: { stageId: true, optionIds: true, answeredAt: true } },
    },
  });
  if (!attempt) return { ok: false, error: "not_found" };
  if (attempt.status === "completed") return { ok: true, attemptId };
  if (attempt.status !== "in_progress") return { ok: false, error: "not_in_progress" };
  const blocked = await blockedReason(scope, attempt);
  if (blocked) return { ok: false, error: blocked };

  const stages = attempt.scenario.stages;
  if (stages.length === 0) return { ok: false, error: "no_stages" };
  if (nextStageIndex(stages, attempt.answers.map((a) => a.stageId)) < stages.length) return { ok: false, error: "incomplete" };

  const options = stages.flatMap((s) => s.options);
  const stepIds = [...new Set(options.flatMap((o) => (o.stepId ? [o.stepId] : [])))];
  const steps =
    stepIds.length === 0
      ? []
      : await prisma.protocolStep.findMany({
          where: { id: { in: stepIds } },
          select: { id: true, weight: true, isMandatory: true, isCritical: true },
        });
  const outcome = attemptOutcome({ options, answers: attempt.answers, steps });

  await prisma.$transaction(async (tx) => {
    const updated = await tx.simulationAttempt.updateMany({
      where: { id: attempt.id, ...attemptsOwn(scope), status: "in_progress" },
      data: {
        status: "completed",
        completedAt: now,
        durationSec: activeDurationSeconds(attempt.startedAt, attempt.answers.map((a) => a.answeredAt), now),
        score: outcome.score,
        riskLevel: outcome.riskLevel,
      },
    });
    if (updated.count === 0) return; // completed by a parallel request a moment ago
    if (outcome.outcomes.length > 0) {
      await tx.simulationStepResult.createMany({
        data: outcome.outcomes.map((o) => ({ attemptId: attempt.id, stepId: o.stepId, compliant: o.compliant, critical: o.critical })),
        skipDuplicates: true,
      });
    }
  });
  return { ok: true, attemptId: attempt.id };
}
