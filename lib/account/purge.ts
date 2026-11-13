// Personal-data purge that runs when a user is deleted (PRODUCT 9 "delete my account", note 08 B3/B4, 2.4-2.5).
// CLI-safe (no "server-only"): lib/auth.ts runs it from databaseHooks.user.delete.before, for the self-service
// delete (auth.api.deleteUser) and the admin panel's /admin/remove-user alike.
//
// Better Auth has already deleted the user's sessions and accounts (password) when this runs, and deletes the
// user row right after it. The foreign keys then do the rest:
// - Cascade (personal): memberships, departments, simulation attempts with answers and step results, and the
//   invitations they sent that were already answered (their history stays in the audit log). PENDING invitations
//   they sent belong to the institution: in an institution the user still belongs to they are handed to another
//   owner (else admin) first, and go with the user only when no manager is left (final review).
// - SetNull (institution records kept, without the person): scans they examined or finalised, step overrides,
//   attached photos, AI calls, settings, protocols they created, audit rows (actorId).
// This function removes what no foreign key covers and de-identifies the audit trail. It must never throw on
// purpose: a throw here leaves the user without a password or sessions (note 08 F3). Blockers are checked
// BEFORE (lib/account/deletion-rules.ts).
import type { Prisma } from "@/generated/prisma/client";
import { hasRole, isActiveBan } from "@/lib/account/deletion-rules";
import { emailKey } from "@/lib/app-rate-limit";
import { deletePhotoObjects } from "@/lib/data-lifecycle";
import { prisma } from "@/lib/prisma";

export type PurgeResult = { photos: number; auditRows: number; teams: number; invitationsMoved: number };

/** The verification rows that belong to this user (Better Auth's e-mail codes, our account-deletion code). */
export function userVerificationWhere(userId: string, email: string | null): Prisma.VerificationWhereInput {
  const or: Prisma.VerificationWhereInput[] = [
    { value: userId }, // Better Auth rows that store the user id (delete-account token and similar)
    { identifier: { contains: userId } }, // ours: "account-delete:<userId>"
  ];
  // emailOTP identifiers are "<type>-otp-<email>" (better-auth plugins/email-otp/utils.mjs toOTPIdentifier).
  if (email) or.push({ identifier: { endsWith: `-otp-${email.toLowerCase()}` } });
  return { OR: or };
}

type Manager = { userId: string; role: string; user: { banned: boolean | null; banExpires: Date | null } };

/**
 * Who takes over a deleted manager's pending invitations: the oldest owner, else the oldest admin (`managers` in
 * membership order), the first who is not banned; a banned one only when no other manager is left.
 */
export function invitationHeir(managers: readonly Manager[], now = new Date()): Manager | null {
  const pick = (list: readonly Manager[]) => list.find((m) => hasRole(m.role, "owner")) ?? list.find((m) => hasRole(m.role, "admin"));
  return pick(managers.filter((m) => !isActiveBan(m.user, now))) ?? pick(managers) ?? null;
}

export async function purgeUserData(userId: string): Promise<PurgeResult> {
  const r = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    const email = user?.email.trim().toLowerCase() ?? null;

    // Unattached uploads (never part of a scan) are the uploader's, not the institution's.
    const photos = await tx.scanPhoto.findMany({ where: { uploadedById: userId, scanId: null }, select: { id: true, storageKey: true } });
    if (photos.length > 0) await tx.scanPhoto.deleteMany({ where: { id: { in: photos.map((p) => p.id) } } });

    // The audit trail stays with the institution, without the person (actorId -> null comes from the FK).
    const audit = await tx.auditLog.updateMany({
      where: { actorId: userId },
      data: { actorName: null, ip: null, actorDeleted: true },
    });

    // Departments: the teamMember cascade would leave team.memberCount too high (note 08 F4).
    const teamRows = await tx.teamMember.findMany({ where: { userId }, select: { teamId: true } });
    const teamIds = [...new Set(teamRows.map((t) => t.teamId))];
    await tx.teamMember.deleteMany({ where: { userId } });
    for (const teamId of teamIds) {
      const memberCount = await tx.teamMember.count({ where: { teamId } });
      await tx.team.updateMany({ where: { id: teamId }, data: { memberCount } });
    }

    // Pending invitations they sent: the inviterId FK (Cascade) would delete them with the user row, and invitees
    // would find "invitation not found". Hand them to another manager of the same institution: the oldest owner, else
    // the oldest admin, preferring one who is not banned (a banned manager cannot sign in, and get-invitation would
    // show them as the inviter). Only institutions the user still belongs to: after leaving or being removed their
    // invitations were already refused by get-invitation (INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION), and
    // must not come back under the owner's name. Everything else goes with the user.
    const pendingOrgs = await tx.invitation.findMany({
      where: { inviterId: userId, status: "pending", organization: { members: { some: { userId } } } },
      distinct: ["organizationId"],
      select: { organizationId: true },
    });
    let invitationsMoved = 0;
    for (const { organizationId } of pendingOrgs) {
      const managers = await tx.member.findMany({
        where: { organizationId, userId: { not: userId }, OR: [{ role: { contains: "owner" } }, { role: { contains: "admin" } }] },
        orderBy: { createdAt: "asc" },
        select: { userId: true, role: true, user: { select: { banned: true, banExpires: true } } },
      });
      const heir = invitationHeir(managers);
      if (!heir) continue;
      const moved = await tx.invitation.updateMany({
        where: { inviterId: userId, organizationId, status: "pending" },
        data: { inviterId: heir.userId },
      });
      invitationsMoved += moved.count;
    }

    // Sessions in which THIS user (a platform admin) was acting as someone else.
    await tx.session.deleteMany({ where: { impersonatedBy: userId } });

    await tx.verification.deleteMany({ where: userVerificationWhere(userId, email) });
    // Our durable limits: "<purpose>:<userId>" keys and the hashed per-address e-mail key.
    await tx.appRateLimit.deleteMany({
      where: { OR: [{ key: { endsWith: `:${userId}` } }, ...(email ? [{ key: emailKey("email-send", email) }] : [])] },
    });
    if (email) {
      // Invitations addressed to them (no FK: the invitee may never have had an account).
      await tx.invitation.deleteMany({ where: { email: { equals: email, mode: "insensitive" } } });
      // Legacy per-address limiter rows from before app_rate_limit (same key format, Better Auth's table).
      await tx.rateLimit.deleteMany({ where: { key: emailKey("email-send", email) } });
    }
    return { keys: photos.map((p) => p.storageKey), auditRows: audit.count, teams: teamIds.length, invitationsMoved };
  });
  await deletePhotoObjects(r.keys, "user delete"); // best effort, after the commit
  return { photos: r.keys.length, auditRows: r.auditRows, teams: r.teams, invitationsMoved: r.invitationsMoved };
}
