import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { log } from "@/lib/log";

/**
 * Per-user AI limits + the AiCall log (admin panel cost table and failure log).
 *
 * Every model call goes through reserveAiCall() BEFORE it starts: under a per-user advisory lock it checks
 * the daily limit, the in-flight cap and the per-minute limit, then inserts a `pending` AiCall row that
 * finishAiCall() completes when the call ends. Parallel requests therefore cannot all pass the check.
 *
 * Daily limit source: AppSetting "ai.dailyLimitPerUser" -> env AI_DAILY_LIMIT_PER_USER -> 20. 0 disables AI
 * for everyone. A "day" is the calendar day in Asia/Riyadh (UTC+3, no DST). Every call counts (pending, ok,
 * refused, truncated, invalid output, aborted, timeout: all billed or possibly billed) except the provider
 * rejections in UNBILLED_ERROR_CODES, which Anthropic answers before generating anything.
 */
export const DEFAULT_DAILY_LIMIT = 20;
/** Calls one user may have running at the same time. */
export const MAX_IN_FLIGHT_PER_USER = 2;
/** Calls one user may start per rolling minute. */
export const MAX_CALLS_PER_MINUTE = 6;
/** A pending row older than this belongs to a crashed process and no longer counts as in flight. */
const IN_FLIGHT_WINDOW_MS = 5 * 60 * 1000;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

export type AiCallKind = "scan_analysis" | "simulation_debrief" | "insight";
export type AiCallStatus = "pending" | "ok" | "refused" | "error";
export type AiFinalStatus = Exclude<AiCallStatus, "pending">;

/** errorCodes (lib/ai/errors.ts) of calls the provider rejected before generating: not billed, not counted. */
export const UNBILLED_ERROR_CODES = ["rate_limited", "overloaded", "bad_request", "config"] as const;

export async function getDailyLimit(): Promise<number> {
  const stored = await getSetting("ai.dailyLimitPerUser");
  if (stored !== undefined) return stored;
  const env = Number.parseInt(process.env.AI_DAILY_LIMIT_PER_USER ?? "", 10);
  return Number.isFinite(env) && env >= 0 ? env : DEFAULT_DAILY_LIMIT;
}

/** Start of the current Riyadh calendar day, as a UTC Date. */
export function startOfRiyadhDay(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + RIYADH_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - RIYADH_OFFSET_MS);
}

/** YYYY-MM-DD of the Riyadh calendar day (the date the scan prompt gives the model). */
export function riyadhDateString(now: Date = new Date()): string {
  return new Date(now.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** AiCall rows that count against the daily limit (see the header comment). */
export function countedTodayWhere(userId: string, now: Date = new Date()): Prisma.AiCallWhereInput {
  return {
    userId,
    createdAt: { gte: startOfRiyadhDay(now) },
    OR: [{ status: { not: "error" } }, { errorCode: null }, { errorCode: { notIn: [...UNBILLED_ERROR_CODES] } }],
  };
}

export async function countAiCallsToday(userId: string, now: Date = new Date()): Promise<number> {
  return prisma.aiCall.count({ where: countedTodayWhere(userId, now) });
}

export type AiQuota = { allowed: boolean; used: number; limit: number; remaining: number };

/** For display (remaining calls today). Enforcement happens in reserveAiCall(). */
export async function checkAiQuota(userId: string): Promise<AiQuota> {
  const [limit, used] = await Promise.all([getDailyLimit(), countAiCallsToday(userId)]);
  return { allowed: used < limit, used, limit, remaining: Math.max(0, limit - used) };
}

export type AiReservation = { ok: true; id: string } | { ok: false; code: "daily_limit" | "too_many_requests" };

/**
 * Atomically checks the user's limits and reserves a `pending` AiCall row. Call it right before the model
 * call and complete the row with finishAiCall(id, ...) however the call ends. Throws only when the
 * database is unreachable (callers then fail closed).
 */
export async function reserveAiCall(
  input: {
    userId: string;
    organizationId?: string | null;
    kind: AiCallKind;
    model: string;
    targetType?: string | null;
    targetId?: string | null;
  },
  now: Date = new Date(),
): Promise<AiReservation> {
  const limit = await getDailyLimit();
  return prisma.$transaction(async (tx) => {
    // Serializes the reservations of ONE user (other users never wait); released at commit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-call:${input.userId}`}, 0))`;
    const used = await tx.aiCall.count({ where: countedTodayWhere(input.userId, now) });
    if (used >= limit) return { ok: false, code: "daily_limit" } as const;
    const inFlight = await tx.aiCall.count({
      where: { userId: input.userId, status: "pending", createdAt: { gte: new Date(now.getTime() - IN_FLIGHT_WINDOW_MS) } },
    });
    if (inFlight >= MAX_IN_FLIGHT_PER_USER) return { ok: false, code: "too_many_requests" } as const;
    const lastMinute = await tx.aiCall.count({
      where: { userId: input.userId, createdAt: { gte: new Date(now.getTime() - 60_000) } },
    });
    if (lastMinute >= MAX_CALLS_PER_MINUTE) return { ok: false, code: "too_many_requests" } as const;
    const row = await tx.aiCall.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        kind: input.kind,
        model: input.model,
        status: "pending",
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
      },
      select: { id: true },
    });
    return { ok: true, id: row.id } as const;
  });
}

export type AiCallOutcome = {
  status: AiFinalStatus;
  /** The model that answered (may differ from the reserved one after a server-side fallback). */
  model?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  errorCode?: string | null;
};

/** Completes a reserved row (status, tokens, cost, latency). Never throws. */
export async function finishAiCall(id: string, reservedModel: string, outcome: AiCallOutcome): Promise<void> {
  const model = outcome.model || reservedModel;
  const cost = estimateCostUsd(model, outcome);
  try {
    await prisma.aiCall.update({
      where: { id },
      data: {
        status: outcome.status,
        model,
        inputTokens: outcome.inputTokens ?? null,
        outputTokens: outcome.outputTokens ?? null,
        costUsd: cost === null ? null : new Prisma.Decimal(cost),
        latencyMs: outcome.latencyMs ?? null,
        errorCode: outcome.errorCode ?? null,
      },
    });
  } catch (e) {
    log.error("ai.call.finish_failed", { err: e });
  }
}

// USD per million tokens (Anthropic first-party list prices, 2026-10). Unknown models -> no estimate.
const PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-fable-5": { input: 10, output: 50 },
};

/** Estimated cost in USD (reasoning tokens are billed as output and included in outputTokens). */
export function estimateCostUsd(
  modelId: string,
  usage: { inputTokens?: number | null; outputTokens?: number | null },
): number | null {
  const key = Object.keys(PRICES_PER_MTOK)
    .sort((a, b) => b.length - a.length)
    .find((k) => modelId === k || modelId.startsWith(`${k}-`) || modelId.startsWith(`${k}@`));
  if (!key) return null;
  const price = PRICES_PER_MTOK[key];
  const cost = ((usage.inputTokens ?? 0) * price.input + (usage.outputTokens ?? 0) * price.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export type RecordAiCallInput = {
  userId: string | null;
  organizationId?: string | null;
  kind: AiCallKind;
  model: string;
  status: AiFinalStatus;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  errorCode?: string | null;
  targetType?: string | null;
  targetId?: string | null;
};

/**
 * Appends one finished AiCall row WITHOUT a limit check. Model calls made for a user go through
 * reserveAiCall + finishAiCall instead. Never throws.
 */
export async function recordAiCall(input: RecordAiCallInput): Promise<void> {
  const cost = estimateCostUsd(input.model, input);
  try {
    await prisma.aiCall.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        kind: input.kind,
        model: input.model,
        status: input.status,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        costUsd: cost === null ? null : new Prisma.Decimal(cost),
        latencyMs: input.latencyMs ?? null,
        errorCode: input.errorCode ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
      },
    });
  } catch (e) {
    log.error("ai.call.record_failed", { err: e });
  }
}
