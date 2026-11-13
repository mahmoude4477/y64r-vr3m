import "server-only";
import { createUIMessageStreamResponse, type LanguageModel, streamText, toUIMessageStream } from "ai";
import type { RiskLevel } from "@/lib/scoring";
import { type AiErrorCode, aiFailureStatus, type AiFailure, mapAiError } from "./errors";
import { type AiCallOutcome, finishAiCall, reserveAiCall } from "./limits";
import { claudeProviderOptions, getAiConfig, getLanguageModel, isAiConfigured } from "./model";
import { log } from "@/lib/log";

/**
 * Short personal simulation debrief, streamed in ONE locale (PRODUCT.md 4-5). The rule-based
 * recommendation list (lib/scoring.ts prioritizeViolations) must already be on the page: this text
 * only phrases a summary on top and the page works without it.
 *
 * Route Handler usage (the client uses useCompletion from @ai-sdk/react with this endpoint):
 *   const r = await streamDebrief({ ...facts, userId, onComplete: (text) => saveDebrief(attemptId, text) });
 *   return r.ok ? r.response : Response.json({ error: r.code }, { status: r.status });
 */

export type DebriefFacts = {
  locale: "ar" | "en";
  scenarioTitle: string;
  protocolTitle: string;
  score: number;
  riskLevel: RiskLevel;
  /** Violated steps in priority order (critical first). Text in the debrief locale. */
  violations: ReadonlyArray<{ step: string; rationale?: string | null; critical: boolean }>;
  /** Steps done well (text in the debrief locale). */
  strengths: readonly string[];
};

export function debriefInstructions(locale: "ar" | "en"): string {
  return [
    "You are a supportive infection prevention and control trainer for healthcare students and staff.",
    "Write a short personal debrief of a simulation attempt: at most 5 sentences, no headings, no lists, no markdown.",
    "Start with what went well, then name the most important correction (critical violations first) and why it matters for patient and staff safety, then one concrete thing to practise next.",
    "Use only the facts given; do not invent steps, numbers or guidelines. Educational tone, never alarming or judgemental.",
    locale === "ar"
      ? "Reply in clear Modern Standard Arabic."
      : "Reply in plain English.",
  ].join(" ");
}

export function debriefPrompt(facts: DebriefFacts): string {
  return JSON.stringify(
    {
      scenario: facts.scenarioTitle,
      protocol: facts.protocolTitle,
      score: facts.score,
      riskLevel: facts.riskLevel,
      violations: facts.violations,
      strengths: facts.strengths,
    },
    null,
    2,
  );
}

const STREAM_ERROR_TEXT = {
  ar: "تعذّر توليد الملخص الآن. توصياتك أعلاه متاحة دائمًا.",
  en: "The summary could not be generated right now. Your recommendations above are always available.",
} as const;

export type DebriefResult = { ok: true; response: Response } | (AiFailure & { status: number });

export async function streamDebrief(
  input: DebriefFacts & {
    userId: string;
    organizationId?: string | null;
    attemptId?: string | null;
    abortSignal?: AbortSignal;
    /** Called once with the full text when the stream finished normally (persist it here). */
    onComplete?: (text: string) => Promise<void> | void;
    /** Tests only: a mock model; skips the limits and the AiCall row. */
    model?: LanguageModel;
    /** Tests only: receives the AiCall outcome that would be recorded. */
    onTrack?: (outcome: AiCallOutcome) => void;
  },
): Promise<DebriefResult> {
  const testing = !!input.model;
  const fail = (code: AiErrorCode, retryable: boolean): DebriefResult => {
    const f = { ok: false as const, code, retryable };
    return { ...f, status: aiFailureStatus(f) };
  };
  if (!testing && !isAiConfigured()) return fail("not_configured", false);

  const config = testing ? { modelId: "mock", effort: "low" as const } : await getAiConfig();

  // Reserve BEFORE the call (daily limit, in-flight cap, per-minute limit; atomic per user).
  let reservationId: string | null = null;
  if (!testing) {
    try {
      const r = await reserveAiCall({
        userId: input.userId,
        organizationId: input.organizationId,
        kind: "simulation_debrief",
        model: config.modelId,
        targetType: input.attemptId ? "simulation_attempt" : null,
        targetId: input.attemptId ?? null,
      });
      if (!r.ok) return fail(r.code, r.code === "too_many_requests");
      reservationId = r.id;
    } catch (e) {
      log.error("ai.reserve_failed", { kind: "debrief", err: e });
      return fail("unknown", true); // fail closed: no reservation, no model call
    }
  }

  const started = Date.now();
  let finished = false; // exactly one outcome per call (onEnd, onError or onAbort)
  const track = async (outcome: Omit<AiCallOutcome, "latencyMs">) => {
    if (finished) return;
    finished = true;
    const full = { ...outcome, latencyMs: Date.now() - started };
    input.onTrack?.(full);
    if (reservationId) await finishAiCall(reservationId, config.modelId, full);
  };

  const result = streamText({
    model: input.model ?? getLanguageModel(config.modelId),
    instructions: debriefInstructions(input.locale),
    prompt: debriefPrompt(input),
    maxOutputTokens: 4_000, // includes (short) adaptive thinking at low effort
    timeout: { totalMs: 45_000, chunkMs: 20_000 },
    abortSignal: input.abortSignal,
    // Latency matters more than depth here: always low effort.
    providerOptions: claudeProviderOptions({ effort: "low", userId: input.userId }),
    onEnd: async ({ finishReason, text, totalUsage, response }) => {
      const usage = { inputTokens: totalUsage.inputTokens, outputTokens: totalUsage.outputTokens };
      if (finishReason === "content-filter") {
        await track({ status: "refused", model: response.modelId, errorCode: "refused", ...usage });
        return;
      }
      if (finishReason === "error") {
        await track({ status: "error", model: response.modelId, errorCode: "unknown", ...usage });
        return;
      }
      await track({ status: "ok", model: response.modelId, ...usage });
      if (finishReason === "stop" && text.trim() && input.onComplete) {
        try {
          await input.onComplete(text.trim());
        } catch (e) {
          log.error("ai.debrief.on_complete_failed", { err: e });
        }
      }
    },
    onError: async ({ error }) => {
      await track({ status: "error", errorCode: mapAiError(error).code });
    },
    // In streamText an abort or a timeout ends with onAbort (neither onEnd nor onError runs).
    onAbort: async ({ steps, reason }) => {
      const usage = steps.reduce(
        (acc, step) => ({
          inputTokens: acc.inputTokens + (step.usage.inputTokens ?? 0),
          outputTokens: acc.outputTokens + (step.usage.outputTokens ?? 0),
        }),
        { inputTokens: 0, outputTokens: 0 },
      );
      const timedOut = reason instanceof DOMException && reason.name === "TimeoutError";
      await track({ status: "error", errorCode: timedOut ? "timeout" : "aborted", ...usage });
    },
  });

  return {
    ok: true,
    response: createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        sendReasoning: false,
        onError: () => STREAM_ERROR_TEXT[input.locale],
      }),
    }),
  };
}
