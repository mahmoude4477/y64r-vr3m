import "server-only";
import type * as z from "zod";
import { takeAppRateLimit } from "@/lib/app-rate-limit";
import { readJsonBody as readBoundedJson } from "@/lib/http";
import { type Logger, requestLogger } from "@/lib/log";
import { InvalidPhotoError, StorageNotConfiguredError } from "@/lib/storage";
import { requestOriginAllowed } from "./origin";

/**
 * Small helpers shared by the /api/scans/** Route Handlers. Answers are JSON `{ error: <code> }` with a status;
 * the browser maps the code to text (components/scans, messages scans.errors.*). Never put user text, keys or
 * presigned URLs in an error.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function apiJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function apiError(error: string, status: number, extra?: Record<string, unknown>): Response {
  return Response.json({ error, ...extra }, { status, headers: NO_STORE });
}

/** JSON bodies of these routes are tiny (ids, sizes, a short label). */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Same-origin JSON body, parsed with `schema`. Cookies are SameSite=Lax already; the Origin / Sec-Fetch-Site check
 * and the JSON content type are defence in depth against cross-site form posts.
 */
export async function readJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
  const guard = guardMutation(request);
  if (guard) return { ok: false, response: guard };
  // Bounded read (lib/http.ts): stops at the cap instead of buffering whatever arrives.
  const body = await readBoundedJson(request, MAX_BODY_BYTES);
  if (!body.ok) {
    const code = body.status === 415 ? "unsupported_media_type" : body.status === 413 ? "payload_too_large" : "invalid_body";
    return { ok: false, response: apiError(code, body.status) };
  }
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return { ok: false, response: apiError("invalid_input", 400) };
  return { ok: true, data: parsed.data };
}

/** For state-changing requests without a JSON body (DELETE, a body-less POST): the same origin check. */
export function guardMutation(request: Request): Response | null {
  return requestOriginAllowed(request.headers) ? null : apiError("forbidden_origin", 403);
}

export type RateRule = { key: string; max: number; windowSec: number };

/** True when any rule is over its limit (each rule counts the request). Durable, shared by every instance. */
export async function overRateLimit(rules: readonly RateRule[]): Promise<boolean> {
  const results = await Promise.all(rules.map((r) => takeAppRateLimit(r.key, r.max, r.windowSec)));
  return results.some((allowed) => !allowed);
}

export function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: "slow_down" }), {
    status: 429,
    headers: { ...NO_STORE, "Content-Type": "application/json", "Retry-After": "60" },
  });
}

/**
 * Runs a handler and turns unexpected errors into JSON: storage not configured -> 503 storage_off, a photo the storage
 * helpers refuse -> 400 invalid_photo, anything else -> logged, 500 server_error (no details leave the server).
 */
export async function handleScanRoute(
  request: Request,
  event: string,
  run: (logger: Logger) => Promise<Response>,
): Promise<Response> {
  const logger = requestLogger(request.headers);
  try {
    return await run(logger);
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) return apiError("storage_off", 503);
    if (err instanceof InvalidPhotoError) return apiError("invalid_photo", 400);
    logger.error(`${event}.error`, { err });
    return apiError("server_error", 500);
  }
}
