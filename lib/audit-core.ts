// CLI-safe audit writer: no "server-only", no next/headers. lib/auth.ts hooks (loaded by the `auth` CLI
// and scripts in plain Node) write through this file; app code uses writeAudit from lib/audit.ts.
import { getIP } from "better-auth/api";
import type { Prisma } from "@/generated/prisma/client";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";

/**
 * Client-IP headers, in trust order. Better Auth uses the same list for its rate limits (lib/auth.ts), and
 * clientIp() below applies Better Auth's own rule (a multi-hop X-Forwarded-For is never trusted, so the
 * spoofable leftmost value is never used). Whether Railway's edge overwrites a client-sent X-Real-IP is
 * still to be checked on the deployed service (crosscheck G10).
 */
export const CLIENT_IP_HEADERS = ["x-real-ip", "x-forwarded-for"];

type IpOptions = Parameters<typeof getIP>[1];
// ipv6Subnet 128: the audit keeps the client's full IPv6 address (normalised, e.g. 2001:0db8:...:0001).
// Better Auth's rate limits (lib/auth.ts) keep their default /64, which groups one IPv6 client's addresses.
const IP_OPTIONS = { advanced: { ipAddress: { ipAddressHeaders: CLIENT_IP_HEADERS, ipv6Subnet: 128 } } } as IpOptions;

/** The client IP for an audit row (same header rule as the rate limiter, full IPv6 address), or null. */
export function clientIp(headers: Headers | null | undefined): string | null {
  if (!headers) return null;
  try {
    return getIP(headers, IP_OPTIONS);
  } catch {
    return null;
  }
}

/**
 * The real person behind an action. While a platform admin impersonates a user (session.impersonatedBy),
 * the actor is the admin and `impersonating` names the impersonated user (it goes into meta.impersonating).
 */
export function resolveAuditActor(
  userId: string | null,
  impersonatedBy: string | null | undefined,
): { actorId: string | null; impersonating: string | null } {
  const admin = typeof impersonatedBy === "string" && impersonatedBy.length > 0 ? impersonatedBy : null;
  return admin && admin !== userId ? { actorId: admin, impersonating: userId } : { actorId: userId, impersonating: null };
}

/** meta + { impersonating } (a non-object meta is kept under `value`). */
export function withImpersonating(meta: Prisma.InputJsonValue | undefined, impersonating: string | null): Prisma.InputJsonValue | undefined {
  if (!impersonating) return meta;
  if (meta === undefined) return { impersonating };
  if (typeof meta === "object" && meta !== null && !Array.isArray(meta)) return { ...(meta as Prisma.InputJsonObject), impersonating };
  return { value: meta, impersonating };
}

export type AuditRecord = {
  actorId: string | null;
  /**
   * Snapshot of the actor when the row is written (user.name, platform user.role). Looked up from actorId when
   * left undefined. When that account is deleted the row is de-identified (lib/account/purge.ts): actorId -> null
   * (FK), actorName and ip -> null, actorDeleted -> true.
   */
  actorName?: string | null;
  actorRole?: string | null;
  /** true = written for / about an account that no longer exists (e.g. "account.delete"). UI: common.deletedUser. */
  actorDeleted?: boolean;
  /** dotted, e.g. "user.ban", "scan.finalize", "auth.admin.set-role" */
  action: string;
  targetType: string;
  targetId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
};

// Postgres text and jsonb cannot hold U+0000: an insert with one fails ("invalid byte sequence" /
// "unsupported Unicode escape sequence"). Strip it from every string that goes into the row.
export function stripNul(value: string): string {
  return value.includes("\u0000") ? value.replaceAll("\u0000", "") : value;
}

/** A copy of `meta` with U+0000 removed from every string, keys included (depth-limited, cycles impossible in JSON). */
export function sanitizeAuditMeta(value: Prisma.InputJsonValue | undefined, depth = 0): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return stripNul(value);
  if (typeof value !== "object") return value;
  if (depth > 8) return "[depth]";
  if (Array.isArray(value)) {
    return value.map((v) => (v === null ? null : (sanitizeAuditMeta(v as Prisma.InputJsonValue, depth + 1) ?? null))) as Prisma.InputJsonArray;
  }
  const out: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [k, v] of Object.entries(value as Record<string, Prisma.InputJsonValue | null | undefined>)) {
    if (v === undefined) continue;
    out[stripNul(k)] = v === null ? null : (sanitizeAuditMeta(v, depth + 1) ?? null);
  }
  return out as Prisma.InputJsonObject;
}

const clean = (s: string | null | undefined) => (typeof s === "string" ? stripNul(s) : (s ?? null));

/**
 * Appends one audit_log row.
 *
 * - Without `tx` it never throws: auditing must not break an action that already happened (the error is logged).
 * - With `tx` it THROWS: the row is part of the caller's transaction, so a failed audit fails (and rolls back) the
 *   whole change instead of committing it silently without its audit row.
 */
export async function writeAuditRecord(record: AuditRecord, tx?: Prisma.TransactionClient): Promise<void> {
  const db = tx ?? prisma;
  try {
    let actorName = record.actorName;
    let actorRole = record.actorRole;
    if (record.actorId && actorName === undefined) {
      const actor = await db.user.findUnique({ where: { id: record.actorId }, select: { name: true, role: true } });
      actorName = actor?.name ?? null;
      actorRole = actorRole === undefined ? (actor?.role ?? null) : actorRole;
    }
    await db.auditLog.create({
      data: {
        actorId: record.actorId,
        actorName: clean(actorName),
        actorRole: clean(actorRole),
        actorDeleted: record.actorDeleted ?? false,
        action: stripNul(record.action),
        targetType: stripNul(record.targetType),
        targetId: clean(record.targetId),
        meta: sanitizeAuditMeta(record.meta),
        ip: clean(record.ip),
      },
    });
  } catch (e) {
    if (tx) throw e;
    log.error("audit.write_failed", { action: record.action, err: e });
  }
}
