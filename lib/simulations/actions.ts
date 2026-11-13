"use server";

// Server Actions of the simulation player (CONVENTIONS 5: validate, authorize, scoped write). They return stable
// error codes; the player translates them (simulations.player.errors.*). Every action re-checks the session and
// scopes every query with @/lib/authz inside ./attempts.ts, so a direct POST cannot touch another user's attempt.
import { hasLocale } from "next-intl";
import { unstable_rethrow } from "next/navigation";
import { routing } from "@/i18n/routing";
import { scopeOf } from "@/lib/authz";
import { log } from "@/lib/log";
import { requireUser } from "@/lib/session";
import {
  type AnswerResult,
  answerStage as answerStageForUser,
  type AttemptError,
  completeAttempt as completeAttemptForUser,
  type CompleteResult,
  startAttempt as startAttemptForUser,
  type StartResult,
} from "./attempts";
import { answerStageSchema, completeAttemptSchema, startAttemptSchema } from "./schemas";

export type ActionError = AttemptError | "bad_locale" | "invalid_input" | "failed";
type Failure = { ok: false; error: ActionError };

async function run<T>(action: string, locale: string, work: (scope: ReturnType<typeof scopeOf>) => Promise<T>): Promise<T | Failure> {
  if (!hasLocale(routing.locales, locale)) return { ok: false, error: "bad_locale" };
  const ctx = await requireUser(); // guests and mustChangePassword: redirect (outside the try on purpose)
  try {
    return await work(scopeOf(ctx));
  } catch (err) {
    unstable_rethrow(err);
    log.error("simulations.action.failed", { action, err });
    return { ok: false, error: "failed" };
  }
}

/** Resumes the open attempt on this scenario or starts one. */
export async function startAttempt(locale: string, input: unknown): Promise<StartResult | Failure> {
  const parsed = startAttemptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return run("start", locale, (scope) => startAttemptForUser(scope, parsed.data.scenarioId));
}

/** "Start over": abandons the open attempt (kept as history) and starts a fresh one. */
export async function restartAttempt(locale: string, input: unknown): Promise<StartResult | Failure> {
  const parsed = startAttemptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return run("restart", locale, (scope) => startAttemptForUser(scope, parsed.data.scenarioId, { restart: true }));
}

/** Saves the answer to the current stage; the last answer also completes and scores the attempt. */
export async function answerStage(locale: string, input: unknown): Promise<AnswerResult | Failure> {
  const parsed = answerStageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return run("answer", locale, (scope) => answerStageForUser(scope, parsed.data));
}

/** Completes an attempt whose stages are all answered (recovery when the last answer's completion was lost). */
export async function completeAttempt(locale: string, input: unknown): Promise<CompleteResult | Failure> {
  const parsed = completeAttemptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  return run("complete", locale, (scope) => completeAttemptForUser(scope, parsed.data.attemptId));
}
