// How AiCall rows are filtered and shown on /admin/ai (PRODUCT 6a "AI & settings"). Pure (Prisma types only),
// unit-tested; lib/admin/ai-queries.ts runs the filters after requirePlatformAdmin().
import type { Prisma } from "@/generated/prisma/client";
import { parseChoice, parseId, parsePage, type RawSearchParams } from "@/lib/admin/params";

/**
 * A `pending` row older than this belongs to a process that crashed or was stopped mid-call: the same window
 * lib/ai/limits.ts uses (IN_FLIGHT_WINDOW_MS) to stop counting it as in flight.
 */
export const AI_PENDING_STALE_MS = 5 * 60 * 1000;

/** Rows per page of the AI call list. */
export const AI_CALLS_PAGE_SIZE = 25;

export type AiCallStatusValue = "pending" | "ok" | "refused" | "error";
export type AiCallKindValue = "scan_analysis" | "simulation_debrief" | "insight";

/** What a row means for the admin: pending is split into still running and stalled (crashed). */
export type AiCallState = "ok" | "refused" | "error" | "running" | "stalled";

export function aiCallState(row: { status: AiCallStatusValue; createdAt: Date }, now: Date = new Date()): AiCallState {
  if (row.status !== "pending") return row.status;
  return now.getTime() - row.createdAt.getTime() > AI_PENDING_STALE_MS ? "stalled" : "running";
}

/** errorCode values a row can carry (lib/ai/errors.ts AiErrorCode); admin.ai.errorCodes.<code> explains each one. */
export const AI_ERROR_CODES = [
  "refused",
  "truncated",
  "invalid_output",
  "rate_limited",
  "overloaded",
  "timeout",
  "aborted",
  "bad_request",
  "config",
  "not_configured",
  "daily_limit",
  "too_many_requests",
  "unknown",
] as const;
export type AiErrorCodeValue = (typeof AI_ERROR_CODES)[number];

/** The message key of a stored error code; anything unexpected is "unknown" (the raw code is still shown). */
export function aiErrorCodeKey(code: string | null | undefined): AiErrorCodeValue | null {
  if (!code) return null;
  return (AI_ERROR_CODES as readonly string[]).includes(code) ? (code as AiErrorCodeValue) : "unknown";
}

export const AI_STATUS_FILTERS = ["all", "failed", "ok", "refused", "error", "running", "stalled"] as const;
export type AiStatusFilter = (typeof AI_STATUS_FILTERS)[number];
export const AI_KIND_FILTERS = ["all", "scan_analysis", "simulation_debrief", "insight"] as const;
export type AiKindFilter = (typeof AI_KIND_FILTERS)[number];

export type AiCallFilters = { status: AiStatusFilter; kind: AiKindFilter; org: string; page: number };
export const AI_CALL_DEFAULTS = { status: "all", kind: "all" } as const;

export function parseAiCallFilters(raw: RawSearchParams): AiCallFilters {
  return {
    status: parseChoice(raw.status, AI_STATUS_FILTERS, "all"),
    kind: parseChoice(raw.kind, AI_KIND_FILTERS, "all"),
    // "all" is the institution select's "no filter" value.
    org: parseId(raw.org) === "all" ? "" : parseId(raw.org),
    page: parsePage(raw.page),
  };
}

export function aiCallWhere(f: Omit<AiCallFilters, "page">, now: Date = new Date()): Prisma.AiCallWhereInput {
  const and: Prisma.AiCallWhereInput[] = [];
  const staleBefore = new Date(now.getTime() - AI_PENDING_STALE_MS);
  if (f.status === "failed") {
    and.push({ OR: [{ status: { in: ["error", "refused"] } }, { status: "pending", createdAt: { lt: staleBefore } }] });
  } else if (f.status === "running") and.push({ status: "pending", createdAt: { gte: staleBefore } });
  else if (f.status === "stalled") and.push({ status: "pending", createdAt: { lt: staleBefore } });
  else if (f.status !== "all") and.push({ status: f.status });
  if (f.kind !== "all") and.push({ kind: f.kind });
  if (f.org) and.push({ organizationId: f.org });
  return and.length ? { AND: and } : {};
}

/** Where a setting's current value comes from: saved here, the server's environment, or the built-in default. */
export type SettingSource = "panel" | "environment" | "default";

export function settingSource(stored: boolean, fromEnv: boolean): SettingSource {
  return stored ? "panel" : fromEnv ? "environment" : "default";
}

/** The admin-panel link of an AiCall target (a scan or a simulation attempt), or null. */
export function aiTargetHref(targetType: string | null, targetId: string | null): `/admin/${string}` | null {
  if (!targetId) return null;
  if (targetType === "scan") return `/admin/assessments/scans/${targetId}`;
  if (targetType === "simulation_attempt") return `/admin/assessments/attempts/${targetId}`;
  return null;
}
