import { APICallError, NoObjectGeneratedError, RetryError } from "ai";
import { log } from "@/lib/log";

/**
 * Stable error codes for every AI feature. UIs map them to messages; AiCall.errorCode stores them.
 * - not_configured: no ANTHROPIC_API_KEY on this server
 * - daily_limit:    the user reached the per-day AI limit (lib/ai/limits.ts)
 * - too_many_requests: too many calls of this user running, or started this minute (retry shortly)
 * - refused:        Claude declined (finishReason content-filter, after server-side fallbacks)
 */
export type AiErrorCode =
  | "not_configured"
  | "daily_limit"
  | "too_many_requests"
  | "refused"
  | "truncated"
  | "invalid_output"
  | "rate_limited"
  | "overloaded"
  | "timeout"
  | "aborted"
  | "bad_request"
  | "config"
  | "unknown";

export type AiFailure = { ok: false; code: AiErrorCode; retryable: boolean; category?: string };

export function mapAiError(error: unknown): AiFailure {
  const e = RetryError.isInstance(error) ? error.lastError : error;

  if (NoObjectGeneratedError.isInstance(e)) {
    if (e.finishReason === "content-filter") return { ok: false, code: "refused", retryable: false };
    if (e.finishReason === "length") return { ok: false, code: "truncated", retryable: true };
    return { ok: false, code: "invalid_output", retryable: true };
  }
  if (APICallError.isInstance(e)) {
    const status = e.statusCode ?? 0;
    if (status === 429) return { ok: false, code: "rate_limited", retryable: true };
    if (status === 401 || status === 403) return { ok: false, code: "config", retryable: false };
    if (status >= 500) return { ok: false, code: "overloaded", retryable: true }; // incl. 529
    if (status === 400 || status === 413) {
      log.error("ai.request_rejected", { status }); // never the body (it may echo the input)
      return { ok: false, code: "bad_request", retryable: false };
    }
  }
  if (e instanceof DOMException && e.name === "TimeoutError") return { ok: false, code: "timeout", retryable: true };
  if (e instanceof DOMException && e.name === "AbortError") return { ok: false, code: "aborted", retryable: false };
  log.error("ai.unexpected_error", { errName: e instanceof Error ? e.name : typeof e }); // never the message
  return { ok: false, code: "unknown", retryable: false };
}

/** HTTP status a Route Handler should use for a failure. */
export function aiFailureStatus(failure: Pick<AiFailure, "code" | "retryable">): number {
  switch (failure.code) {
    case "daily_limit":
    case "too_many_requests":
      return 429;
    case "not_configured":
      return 503;
    case "refused":
      return 422;
    case "aborted":
      return 499;
    default:
      return failure.retryable ? 503 : 502;
  }
}
