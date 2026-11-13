import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { clientIp, resolveAuditActor, withImpersonating, writeAuditRecord } from "@/lib/audit-core";
import { getSession } from "@/lib/session";

/**
 * Who did it. Pass the AuthContext (`ctx` from requireUser / requireOrgRole / requirePlatformAdmin /
 * authorizeApi): while a platform admin impersonates a user, the row names the ADMIN as actor and
 * meta.impersonating the user, the same rule as the Better Auth audit rows. A bare user object or id is
 * checked against the current request's session for the same rule. `null` = the system (scripts).
 */
export type AuditActor =
  | { user: { id: string }; session: { impersonatedBy?: string | null } }
  | { id: string }
  | string
  | null;
export type AuditTarget = { type: string; id?: string | null };

async function actorOf(actor: AuditActor): Promise<{ actorId: string | null; impersonating: string | null }> {
  if (actor && typeof actor === "object" && "user" in actor) return resolveAuditActor(actor.user.id, actor.session.impersonatedBy);
  const userId = typeof actor === "string" ? actor : (actor?.id ?? null);
  if (!userId) return { actorId: null, impersonating: null };
  try {
    const s = await getSession(); // deduplicated per request
    if (s && s.user.id === userId) return resolveAuditActor(userId, s.session.impersonatedBy);
  } catch {
    // outside a request (scripts)
  }
  return { actorId: userId, impersonating: null };
}

/**
 * Append-only audit trail for the app's own actions (admin panel Server Actions, finalisations,
 * deletes that do not go through Better Auth). Never put secrets, passwords, OTPs, tokens or e-mail
 * addresses in `meta`. The row also stores a snapshot of the actor's name and platform role, so it still
 * says who did it after that account is deleted.
 *
 *   const ctx = await requireOrgRole(ORG_STAFF_ROLES);
 *   await writeAudit(ctx, "scan.finalize", { type: "scan", id: scanId });
 *
 * Better Auth admin / organization endpoints (/api/auth/admin/*, /api/auth/organization/*: set-role,
 * ban, impersonate, remove-user, update-member-role, ...) are audited automatically by lib/auth.ts as
 * "auth.<plugin>.<endpoint>"; do not write a second row for them.
 *
 * Without `options.tx` failures are logged and swallowed: auditing must not break an action that already
 * happened. With `options.tx` (the row is part of your transaction) a failure is THROWN, so the transaction rolls
 * back instead of committing the change without its audit row:
 *
 *   await prisma.$transaction(async (tx) => {
 *     await tx.scan.update({ ... });
 *     await writeAudit(ctx, "scan.finalize", { type: "scan", id }, undefined, { tx });
 *   });
 *
 * U+0000 is stripped from every string (Postgres text/jsonb cannot store it).
 */
export async function writeAudit(
  actor: AuditActor,
  action: string,
  target: AuditTarget,
  meta?: Prisma.InputJsonValue,
  options?: { ip?: string | null; tx?: Prisma.TransactionClient },
): Promise<void> {
  const { actorId, impersonating } = await actorOf(actor);
  let ip = options?.ip ?? null;
  if (ip === null) {
    try {
      ip = clientIp(await headers());
    } catch {
      ip = null; // outside a request (scripts)
    }
  }
  await writeAuditRecord(
    { actorId, action, targetType: target.type, targetId: target.id ?? null, meta: withImpersonating(meta, impersonating), ip },
    options?.tx,
  );
}
