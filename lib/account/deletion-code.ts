import "server-only";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The 6-digit code that confirms an account deletion (note 08 B1). One live code per user, stored in Better Auth's
 * `verification` table as "<hmac>:<wrong tries>" under identifier "account-delete:<userId>":
 * - HMAC-SHA256 keyed with BETTER_AUTH_SECRET, so a database dump alone cannot brute-force the 10^6 codes;
 * - 10 minutes, 5 wrong tries (a wrong code or a wrong password) per code, then a new code is needed;
 * - checked under a per-user advisory lock, so parallel guesses cannot all pass the try counter.
 * The user purge (lib/account/purge.ts) deletes the row with the account.
 */
export const DELETION_CODE_TTL_SECONDS = 10 * 60;
export const DELETION_CODE_MAX_TRIES = 5;

export type CodeCheck = "ok" | "invalid" | "expired" | "too_many";

export const deletionCodeIdentifier = (userId: string) => `account-delete:${userId}`;

export function hashDeletionCode(userId: string, code: string, secret = process.env.BETTER_AUTH_SECRET ?? ""): string {
  return createHmac("sha256", `waqaya-account-delete-v1:${secret}`).update(`${userId}:${code}`).digest("hex");
}

/** "<hash>:<tries>" -> parts; a malformed value counts as used up. */
export function parseCodeValue(value: string): { hash: string; tries: number } {
  const [hash = "", triesRaw = ""] = value.split(":");
  const tries = /^\d+$/.test(triesRaw) ? Number(triesRaw) : DELETION_CODE_MAX_TRIES;
  return { hash: /^[0-9a-f]{64}$/.test(hash) ? hash : "", tries };
}

/** Constant-time comparison of two hex digests. */
export function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export const normalizeCode = (input: string) => input.replace(/[\s-]/g, "");

const newCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

function codeRow(userId: string, code: string) {
  return {
    id: randomUUID(),
    identifier: deletionCodeIdentifier(userId),
    value: `${hashDeletionCode(userId, code)}:0`,
    expiresAt: new Date(Date.now() + DELETION_CODE_TTL_SECONDS * 1000),
  };
}

/** A new code replaces any earlier one at once. Returns the plain code (to e-mail; never log or store it). */
export async function issueDeletionCode(userId: string): Promise<string> {
  const code = newCode();
  const identifier = deletionCodeIdentifier(userId);
  await prisma.$transaction([
    prisma.verification.deleteMany({ where: { identifier } }),
    prisma.verification.create({ data: codeRow(userId, code) }),
  ]);
  return code;
}

/**
 * Issues a new code and hands it to `deliver` (the e-mail). Only when it went out does the new code replace the
 * earlier one: when sending fails (the per-address limit, a provider error), the new row is removed and the code the
 * user already received keeps working. Checks use the NEWEST row (withCodeRow). After a send, only OLDER rows are
 * removed: two requests at once (two tabs, a double tap) must not delete each other's code (review round 2); the
 * newer of the two e-mailed codes is the one that works.
 */
export async function sendNewDeletionCode<T extends { ok: boolean }>(
  userId: string,
  deliver: (code: string) => Promise<T>,
): Promise<T> {
  const code = newCode();
  const row = await prisma.verification.create({ data: codeRow(userId, code) });
  let result: T;
  try {
    result = await deliver(code);
  } catch (e) {
    await prisma.verification.deleteMany({ where: { id: row.id } });
    throw e;
  }
  if (result.ok) {
    await prisma.verification.deleteMany({ where: { identifier: row.identifier, createdAt: { lt: row.createdAt } } });
  } else {
    await prisma.verification.deleteMany({ where: { id: row.id } });
  }
  return result;
}

async function withCodeRow<T>(
  userId: string,
  fn: (
    row: { id: string; hash: string; tries: number } | null,
    tx: Prisma.TransactionClient,
  ) => Promise<T>,
): Promise<T> {
  const identifier = deletionCodeIdentifier(userId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`;
    const row = await tx.verification.findFirst({ where: { identifier }, orderBy: { createdAt: "desc" } });
    if (!row || row.expiresAt <= new Date()) {
      if (row) await tx.verification.deleteMany({ where: { identifier } });
      return fn(null, tx);
    }
    return fn({ id: row.id, ...parseCodeValue(row.value) }, tx);
  });
}

/** One wrong try against the live code; the last allowed one deletes it. */
async function countFailure(
  row: { id: string; hash: string; tries: number },
  tx: Prisma.TransactionClient,
): Promise<"invalid" | "too_many"> {
  const tries = row.tries + 1;
  if (tries >= DELETION_CODE_MAX_TRIES) {
    await tx.verification.deleteMany({ where: { id: row.id } });
    return "too_many";
  }
  await tx.verification.update({ where: { id: row.id }, data: { value: `${row.hash}:${tries}` } });
  return "invalid";
}

/** Checks `code`. A wrong code uses up one try. "ok" keeps the row until the account is gone. */
export async function checkDeletionCode(userId: string, code: string): Promise<CodeCheck> {
  const candidate = hashDeletionCode(userId, normalizeCode(code));
  return withCodeRow(userId, async (row, tx) => {
    if (!row) return "expired";
    if (row.tries >= DELETION_CODE_MAX_TRIES || !row.hash) {
      await tx.verification.deleteMany({ where: { id: row.id } });
      return "too_many";
    }
    if (sameDigest(row.hash, candidate)) return "ok";
    return countFailure(row, tx);
  });
}

/** A wrong PASSWORD after a right code also uses up one of the code's tries. */
export async function recordDeletionFailure(userId: string): Promise<"invalid" | "too_many" | "expired"> {
  return withCodeRow(userId, async (row, tx) => (row ? countFailure(row, tx) : "expired"));
}
