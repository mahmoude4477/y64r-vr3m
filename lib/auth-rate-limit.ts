// Better Auth's rate-limit storage (lib/auth.ts `rateLimit.customStorage`). CLI-safe (no "server-only"): lib/auth.ts
// imports it and the `auth` CLI loads lib/auth.ts in plain Node.
//
// Why not Better Auth's built-in `storage: "database"` (final review, 2026-10-29): it runs every /api/auth request
// (get-session included) through the Prisma adapter's incrementOne, which opens an INTERACTIVE transaction with
// `transaction: true`. Under a burst those transactions held pooled connections for seconds, ran past Prisma's 5 s
// transaction timeout (P2028) or found no free connection ("timeout exceeded when trying to connect"), and unrelated
// users' requests answered 500. Here every request is ONE atomic SQL statement on the same `rateLimit` table: no
// transaction, one connection for a few milliseconds.
//
// Same rule as Better Auth's database storage (better-auth api/rate-limiter): a key ("<ip>|<path>") may make `max`
// requests while the previous request is less than `window` seconds old; the count restarts at 1 once the last
// request is at least `window` old. A refused request changes nothing. `storage: "database"` stays in lib/auth.ts
// so `pnpm auth:generate` / `auth:check` keep the rateLimit model.
//
// Bounded keys (finish-round review): Better Auth rate-limits in the router's onRequest, BEFORE route matching, so
// every /api/auth/<anything> would write its own row, and a path of a few KB made the unique index throw (a 500 on
// demand). storageKey() keeps a known endpoint's key, folds a path parameter (/reset-password/:token) into the
// endpoint's pattern, puts every unknown path of a client into ONE row per rule, and hashes anything still long.
import { createHash, randomUUID } from "node:crypto";
import type { BetterAuthOptions } from "better-auth";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";

type RateLimitStorage = NonNullable<NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]>;
type Rule = { window: number; max: number };

/**
 * Rows whose last request is older than this are pruned. Any age above the longest window is safe (an older row
 * restarts at 1 anyway); the prune also never cuts below twice the longest window it has seen (see below).
 */
export const PRUNE_AFTER_MS = 2 * 60 * 1000;
/** At most one prune per process per this interval, in the background. */
export const PRUNE_EVERY_MS = 60 * 1000;
/** Keys longer than this are stored as a hash (the btree index of rateLimit.key takes at most ~2.7 KB). */
export const MAX_KEY_LENGTH = 200;

let lastPrune = 0;
let longestWindowMs = 0;

function pruneInBackground(now: number) {
  if (now - lastPrune < PRUNE_EVERY_MS) return;
  lastPrune = now;
  const cutoff = BigInt(now - Math.max(PRUNE_AFTER_MS, 2 * longestWindowMs));
  prisma.$executeRaw`DELETE FROM "rateLimit" WHERE "lastRequest" < ${cutoff}`.catch((err: unknown) =>
    log.warn("auth.rate_limit.prune_failed", { err }),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Keys

type PathMatcher = { exact: Set<string>; patterns: Array<{ pattern: string; parts: string[] }> };
let endpoints: PathMatcher | null = null;

/**
 * Better Auth's endpoint paths (`auth.api`), registered by lib/auth.ts once the instance exists. Until then (and in
 * the `auth` CLI) only the hash below bounds a key.
 */
export function setAuthEndpointPaths(paths: Iterable<unknown>): void {
  const matcher: PathMatcher = { exact: new Set(), patterns: [] };
  for (const path of paths) {
    if (typeof path !== "string" || !path.startsWith("/")) continue; // server-only endpoints have no path
    if (path.includes("/:")) matcher.patterns.push({ pattern: path, parts: path.split("/") });
    else matcher.exact.add(path);
  }
  endpoints = matcher;
}

/** The endpoint path for a request path: itself, its pattern (`/reset-password/:token`), or null (no endpoint). */
export function endpointPathFor(path: string): string | null {
  if (!endpoints) return path;
  if (endpoints.exact.has(path)) return path;
  const parts = path.split("/");
  for (const { pattern, parts: want } of endpoints.patterns) {
    if (want.length !== parts.length) continue;
    if (want.every((w, i) => (w.startsWith(":") ? parts[i] !== "" : w === parts[i]))) return pattern;
  }
  return null;
}

/** The row key for Better Auth's "<ip>|<path>" key and its rule (exported for tests). */
export function storageKey(key: string, rule: Rule): string {
  const bar = key.indexOf("|"); // the ip part never contains "|" (Better Auth: createRateLimitKey(ip, path))
  const ip = bar >= 0 ? key.slice(0, bar) : key;
  const path = bar >= 0 ? key.slice(bar + 1) : "";
  const endpoint = endpointPathFor(path);
  // Unknown paths only ever answer 404: one row per client and rule, however many paths it tries.
  const bounded = endpoint === null ? `${ip}|(other paths ${rule.window}s/${rule.max})` : `${ip}|${endpoint}`;
  if (bounded.length <= MAX_KEY_LENGTH) return bounded;
  return `sha256:${createHash("sha256").update(bounded).digest("hex")}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Consume

/** Seconds until `lastRequest + window` (at least 1). */
export function retryAfterSeconds(lastRequest: number, windowSec: number, now: number): number {
  return Math.max(1, Math.ceil((lastRequest + windowSec * 1000 - now) / 1000));
}

/** One request against `key`: allowed (counted) or refused (nothing written). */
export async function consumeRateLimit(key: string, rule: Rule, now = Date.now()): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const windowMs = BigInt(Math.round(rule.window * 1000));
  const nowMs = BigInt(now);
  longestWindowMs = Math.max(longestWindowMs, Number(windowMs));
  // A new key starts at 1. An existing key is updated only when its window has passed (restart at 1) or it is
  // still under `max` (count + 1); otherwise the WHERE is false, nothing changes and no row comes back (refused).
  // Postgres serialises concurrent upserts of one key on its row lock, so parallel requests cannot all pass.
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "rateLimit" ("id", "key", "count", "lastRequest") VALUES (${randomUUID()}, ${key}, 1, ${nowMs})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN ${nowMs} - "rateLimit"."lastRequest" >= ${windowMs} THEN 1 ELSE "rateLimit"."count" + 1 END,
      "lastRequest" = ${nowMs}
    WHERE ${nowMs} - "rateLimit"."lastRequest" >= ${windowMs} OR "rateLimit"."count" < ${rule.max}
    RETURNING "count"`;
  if (rows.length > 0) {
    if (rows[0]?.count === 1) pruneInBackground(now); // a new key or a restarted window, like Better Auth
    return { allowed: true, retryAfter: null };
  }
  const last = await prisma.$queryRaw<Array<{ lastRequest: bigint | number }>>`
    SELECT "lastRequest" FROM "rateLimit" WHERE "key" = ${key}`;
  const lastRequest = last[0] ? Number(last[0].lastRequest) : now;
  return { allowed: false, retryAfter: retryAfterSeconds(lastRequest, rule.window, now) };
}

export const authRateLimitStorage: RateLimitStorage = {
  consume: (key, rule) => consumeRateLimit(storageKey(key, rule), rule),
};
