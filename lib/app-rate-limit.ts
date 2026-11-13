// No `import "server-only"`: lib/auth.ts (and so the Better Auth CLI) reaches this through lib/email/auth-mail.ts.
// Never import it from a "use client" file.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Durable fixed-window limits in the app_rate_limit table (note 08, F2). Better Auth's own rateLimit table
 * cannot hold windows longer than 60 s here: it deletes every row older than its longest configured window.
 *
 * Use it for anything Better Auth's limiter does not cover: the per-address e-mail limit, account-deletion
 * codes and password checks in server actions. Server-side `auth.api.*` calls skip Better
 * Auth's limiter entirely (04 Gotcha 7), so every server action that checks a password or a code uses this.
 *
 * Keys: "<purpose>:<id>", never a raw e-mail address (use emailKey()). Max 200 characters.
 */
export async function takeAppRateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  if (!key || key.length > 200) throw new Error("takeAppRateLimit: key must be 1..200 characters");
  if (!Number.isInteger(max) || max < 1) throw new Error("takeAppRateLimit: max must be a positive integer");
  if (!Number.isFinite(windowSec) || windowSec <= 0) throw new Error("takeAppRateLimit: windowSec must be > 0");
  // One atomic statement: a new key starts at 1; an expired window restarts at 1; otherwise count + 1.
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "app_rate_limit" ("key", "count", "windowStart") VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "app_rate_limit"."windowStart" <= now() - make_interval(secs => ${windowSec}::double precision) THEN 1
        ELSE "app_rate_limit"."count" + 1 END,
      "windowStart" = CASE
        WHEN "app_rate_limit"."windowStart" <= now() - make_interval(secs => ${windowSec}::double precision) THEN now()
        ELSE "app_rate_limit"."windowStart" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 1) <= max;
}

/**
 * Seconds until a refused key's fixed window (takeAppRateLimit) opens again, for an accurate Retry-After: the window
 * started at the first take, so the wait is what is LEFT of it, not its whole length. Database clock, like
 * takeAppRateLimit. Between 1 and windowSec; windowSec when the row is gone.
 */
export async function appRateLimitRetryAfterSec(key: string, windowSec: number): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ seconds: number | null }>>`
    SELECT CEIL(EXTRACT(EPOCH FROM ("windowStart" + make_interval(secs => ${windowSec}::double precision) - now())))::int AS "seconds"
    FROM "app_rate_limit" WHERE "key" = ${key}`;
  const seconds = rows[0]?.seconds;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return windowSec;
  return Math.min(windowSec, Math.max(1, seconds));
}

/** Forget a key (e.g. after a successful step, or when the user is deleted). */
export async function resetAppRateLimit(key: string): Promise<void> {
  await prisma.appRateLimit.deleteMany({ where: { key } });
}

/** Daily cleanup (photo-purge job): rows whose window started more than `olderThanDays` ago. */
export async function pruneAppRateLimits(olderThanDays = 2): Promise<number> {
  // SQL now() like takeAppRateLimit, so both sides use the database clock and session time zone.
  return prisma.$executeRaw`
    DELETE FROM "app_rate_limit" WHERE "windowStart" < now() - make_interval(days => ${Math.ceil(olderThanDays)}::int)`;
}

/** "<purpose>:<sha256 of the lower-cased address>": an address-based key that stores no address. */
export function emailKey(purpose: string, address: string): string {
  return `${purpose}:${createHash("sha256").update(address.trim().toLowerCase()).digest("hex")}`;
}
