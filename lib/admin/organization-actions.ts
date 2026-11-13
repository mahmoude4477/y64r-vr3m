"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { attempt, badLocale, DB_FAILED, failure, fromAuthError, revalidateAdmin, type ActionResult } from "@/lib/admin/action-result";
import { changeNeedsAccountLock, hasRole, memberChangeRefusal, type MemberChange } from "@/lib/admin/membership-rules";
import {
  confirmationMatches,
  createOrganizationSchema,
  deleteOrganizationSchema,
  invitationSchema,
  inviteSchema,
  memberRoleSchema,
  memberSchema,
  organizationIdSchema,
  suspendOrganizationSchema,
  updateOrganizationSchema,
} from "@/lib/admin/schemas";
import { organizationSlug } from "@/lib/admin/slug";
import { type AppLocale, isAppLocale } from "@/i18n/routing";
import { AccountLockBusyError, withAccountLock } from "@/lib/account/deletion-lock";
import { writeAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { deleteOrganizationWithData } from "@/lib/data-lifecycle";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, type AuthContext } from "@/lib/session";

// Platform-admin actions on institutions (PRODUCT 6a).
//
// Two kinds of writes:
// - Better Auth endpoints where Better Auth's own rules matter: creating the institution (the creator becomes its
//   first owner) and invitations (the inviter must be a member; get-invitation refuses an invitation whose inviter
//   left). They are audited automatically (auth.organization.*).
// - The admin panel's own writes, for which a platform admin need not be a member: profile, suspend, member roles and
//   removals, cancelling invitations, and adding themselves as an owner. Each writes its audit row with
//   writeAudit(ctx, ..., { tx }) inside the same transaction, so a change never commits without it.
// - Deleting an institution: deleteOrganizationWithData writes its "organization.delete" row through its `audit`
//   callback, inside the delete's own transaction.
// Member changes that can take an owner away run under the account lock (lib/account/deletion-lock.ts), like the
// Better Auth calls that can (CONVENTIONS 6), and keep at least one owner while the institution has members.

type AdminCtx = AuthContext;
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Locks the institution's row for the rest of the transaction (false when it does not exist). Membership writes of
 * the panel take it first, so parallel calls (two tabs, a retried request) run one after the other and each sees the
 * rows the previous one committed: member has no unique (organizationId, userId) key (requested), so an unlocked
 * check-then-insert could add the same person twice.
 */
async function lockOrganization(tx: Tx, organizationId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "organization" WHERE id = ${organizationId} FOR UPDATE`;
  return rows.length > 0;
}

async function slugFor(nameEn: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = organizationSlug(nameEn, randomBytes(4).toString("hex"));
    const taken = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return organizationSlug(nameEn, randomBytes(8).toString("hex"));
}

/**
 * Creates the institution through Better Auth (the platform admin becomes its first owner, so they can invite) and,
 * when an address is given, invites its owner by e-mail (the invite page also offers the copyable link).
 */
export async function createOrganizationAction(
  locale: string,
  input: unknown,
): Promise<ActionResult<{ organizationId: string; invitationId: string | null; inviteError: string | null }>> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  const { nameAr, nameEn, type, ownerEmail } = parsed.data;
  if (ownerEmail && ownerEmail === ctx.user.email.toLowerCase()) return failure(locale, "alreadyMember");

  const h = await headers();
  let organizationId: string;
  try {
    const created = await auth.api.createOrganization({
      headers: h,
      body: { name: nameAr, nameEn, type, slug: await slugFor(nameEn), keepCurrentActiveOrganization: true },
    });
    organizationId = created.id;
  } catch (e) {
    return fromAuthError(locale, e, "admin.organization.create_failed");
  }

  let invitationId: string | null = null;
  let inviteError: string | null = null;
  if (ownerEmail) {
    try {
      const invitation = await auth.api.createInvitation({ headers: h, body: { email: ownerEmail, role: "owner", organizationId } });
      invitationId = invitation.id;
    } catch (e) {
      // The institution exists: the admin can invite again from its page.
      inviteError = (await fromAuthError(locale, e, "admin.organization.invite_failed")).message;
    }
  }
  revalidateAdmin(locale);
  return { ok: true, organizationId, invitationId, inviteError };
}

export async function updateOrganizationAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = updateOrganizationSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  const { organizationId, nameAr, nameEn, type } = parsed.data;
  const done = await attempt("admin.organization.update_failed", () =>
    prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUnique({ where: { id: organizationId }, select: { name: true, nameEn: true, type: true } });
      if (!before) return false;
      await tx.organization.update({ where: { id: organizationId }, data: { name: nameAr, nameEn, type } });
      const fields = [before.name !== nameAr && "name", before.nameEn !== nameEn && "nameEn", before.type !== type && "type"].filter(
        (f): f is string => typeof f === "string",
      );
      await writeAudit(ctx, "organization.update", { type: "organization", id: organizationId }, { fields }, { tx });
      return true;
    }),
  );
  if (done === DB_FAILED) return failure(locale, "generic");
  if (!done) return failure(locale, "notFound");
  revalidateAdmin(locale);
  return { ok: true };
}

/**
 * Suspends or reactivates an institution. While suspended, its members lose access to it (lib/session.ts drops it as
 * the active institution, new sessions skip it) and Better Auth refuses changes to it (ORGANIZATION_SUSPENDED); its
 * data is kept.
 */
export async function setOrganizationSuspendedAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = suspendOrganizationSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  const { organizationId, suspended } = parsed.data;
  const done = await attempt("admin.organization.suspend_failed", () =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.organization.updateMany({ where: { id: organizationId }, data: { suspended } });
      if (updated.count === 0) return false;
      await writeAudit(ctx, suspended ? "organization.suspend" : "organization.unsuspend", { type: "organization", id: organizationId }, undefined, {
        tx,
      });
      return true;
    }),
  );
  if (done === DB_FAILED) return failure(locale, "generic");
  if (!done) return failure(locale, "notFound");
  revalidateAdmin(locale);
  return { ok: true };
}

/**
 * Deletes the institution and everything it owns (deleteOrganizationWithData: scans with their photos, attempts on
 * its own scenarios, members, invitations, departments, custom protocols and scenarios). The admin types the name.
 */
export async function deleteOrganizationAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = deleteOrganizationSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  const { organizationId, confirmName } = parsed.data;
  const org = await attempt("admin.organization.delete_failed", () =>
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, nameEn: true, _count: { select: { members: true, scans: true } } },
    }),
  );
  if (org === DB_FAILED) return failure(locale, "generic");
  if (!org) return failure(locale, "notFound");
  if (!confirmationMatches(confirmName, org.name, org.nameEn)) return failure(locale, "confirmMismatch");
  let deleted: boolean;
  try {
    // The audit row outlives the institution: it keeps the names (not personal data) and the counts.
    deleted = await deleteOrganizationWithData(organizationId, {
      audit: (tx) =>
        writeAudit(
          ctx,
          "organization.delete",
          { type: "organization", id: organizationId },
          { name: org.name, nameEn: org.nameEn, members: org._count.members, scans: org._count.scans },
          { tx },
        ),
    });
  } catch (e) {
    log.error("admin.organization.delete_failed", { err: e });
    return failure(locale, "generic");
  }
  if (!deleted) return failure(locale, "notFound");
  revalidateAdmin(locale);
  return { ok: true };
}

/** Runs a member change with the rule check under the account lock when it can take an owner away. */
async function changeMember(
  locale: AppLocale,
  ctx: AdminCtx,
  organizationId: string,
  change: MemberChange,
): Promise<ActionResult> {
  const target = await attempt("admin.organization.member_change_failed", () =>
    prisma.member.findFirst({ where: { id: change.memberId, organizationId }, select: { role: true } }),
  );
  if (target === DB_FAILED) return failure(locale, "generic");
  if (!target) return failure(locale, "notFound");

  const run = () =>
    prisma.$transaction(async (tx) => {
      if (!(await lockOrganization(tx, organizationId))) return "not_found" as const;
      const members = await tx.member.findMany({ where: { organizationId }, select: { id: true, role: true, userId: true } });
      const refusal = memberChangeRefusal(members, change);
      if (refusal) return refusal;
      const member = members.find((m) => m.id === change.memberId)!;
      if (change.kind === "role") {
        await tx.member.update({ where: { id: member.id }, data: { role: change.role } });
        await writeAudit(
          ctx,
          "organization.member.role",
          { type: "organization", id: organizationId },
          { memberId: member.id, userId: member.userId, role: change.role, previousRole: member.role },
          { tx },
        );
        return null;
      }
      // Removal, the way Better Auth removes a member: departments first (and their member counts), then the
      // membership; the user's sessions stop pointing at this institution.
      const teamRows = await tx.teamMember.findMany({
        where: { userId: member.userId, team: { organizationId } },
        select: { id: true, teamId: true },
      });
      if (teamRows.length > 0) {
        await tx.teamMember.deleteMany({ where: { id: { in: teamRows.map((t) => t.id) } } });
        for (const teamId of new Set(teamRows.map((t) => t.teamId))) {
          const memberCount = await tx.teamMember.count({ where: { teamId } });
          await tx.team.updateMany({ where: { id: teamId }, data: { memberCount } });
        }
      }
      // Every row of that person (a duplicate from before the row lock would otherwise keep them a member).
      await tx.member.deleteMany({ where: { organizationId, userId: member.userId } });
      await tx.session.updateMany({
        where: { userId: member.userId, activeOrganizationId: organizationId },
        data: { activeOrganizationId: null, activeTeamId: null },
      });
      await writeAudit(
        ctx,
        "organization.member.remove",
        { type: "organization", id: organizationId },
        { memberId: member.id, userId: member.userId, previousRole: member.role },
        { tx },
      );
      return null;
    });

  let refusal: Awaited<ReturnType<typeof run>>;
  try {
    refusal = changeNeedsAccountLock(target.role, change) ? await withAccountLock(run, "admin.organization.member") : await run();
  } catch (e) {
    if (e instanceof AccountLockBusyError) return failure(locale, "lockBusy");
    log.error("admin.organization.member_change_failed", { kind: change.kind, err: e });
    return failure(locale, "generic");
  }
  if (refusal === "not_found") return failure(locale, "notFound");
  if (refusal === "last_owner") return failure(locale, "lastOwner");
  revalidateAdmin(locale);
  return { ok: true };
}

export async function changeMemberRoleAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = memberRoleSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  return changeMember(locale, ctx, parsed.data.organizationId, { kind: "role", memberId: parsed.data.memberId, role: parsed.data.role });
}

/** Removes a member (also how the platform admin leaves an institution they joined or created). */
export async function removeMemberAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  return changeMember(locale, ctx, parsed.data.organizationId, { kind: "remove", memberId: parsed.data.memberId });
}

export async function cancelInvitationAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = invitationSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  const { organizationId, invitationId } = parsed.data;
  const done = await attempt("admin.organization.invitation_cancel_failed", () =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.invitation.updateMany({
        where: { id: invitationId, organizationId, status: "pending" },
        data: { status: "canceled" },
      });
      if (updated.count === 0) return false;
      await writeAudit(ctx, "organization.invitation.cancel", { type: "organization", id: organizationId }, { invitationId }, { tx });
      return true;
    }),
  );
  if (done === DB_FAILED) return failure(locale, "generic");
  if (!done) return failure(locale, "notFound");
  revalidateAdmin(locale);
  return { ok: true };
}

/**
 * Invites someone through Better Auth (e-mail + the copyable link). The platform admin must be an owner or admin of
 * the institution: Better Auth records them as the inviter, and get-invitation refuses invitations whose inviter is
 * not a member. Re-inviting an address cancels its older pending invitation.
 */
export async function inviteMemberAction(locale: string, input: unknown): Promise<ActionResult<{ invitationId: string }>> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  const { organizationId, email, role } = parsed.data;
  const membership = await attempt("admin.organization.invite_failed", () =>
    prisma.member.findFirst({ where: { organizationId, userId: ctx.user.id }, select: { role: true } }),
  );
  if (membership === DB_FAILED) return failure(locale, "generic");
  if (!membership || !(hasRole(membership.role, "owner") || hasRole(membership.role, "admin"))) return failure(locale, "notMember");
  try {
    const invitation = await auth.api.createInvitation({ headers: await headers(), body: { email, role, organizationId } });
    revalidateAdmin(locale);
    return { ok: true, invitationId: invitation.id };
  } catch (e) {
    return fromAuthError(locale, e, "admin.organization.invite_failed");
  }
}

/**
 * Adds the platform admin to the institution as an owner, so they can send invitations (e.g. a new owner for an
 * institution that has none). Audited as organization.member.add; the admin leaves again with removeMemberAction.
 */
export async function joinOrganizationAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = organizationIdSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  const { organizationId } = parsed.data;
  const result = await attempt("admin.organization.join_failed", () =>
    prisma.$transaction(async (tx) => {
      if (!(await lockOrganization(tx, organizationId))) return "notFound" as const;
      const existing = await tx.member.findFirst({ where: { organizationId, userId: ctx.user.id }, select: { id: true } });
      if (existing) return "alreadyMember" as const;
      const member = await tx.member.create({
        data: { id: randomUUID(), organizationId, userId: ctx.user.id, role: "owner", createdAt: new Date() },
        select: { id: true },
      });
      await writeAudit(
        ctx,
        "organization.member.add",
        { type: "organization", id: organizationId },
        { memberId: member.id, userId: ctx.user.id, role: "owner" },
        { tx },
      );
      return null;
    }),
  );
  if (result === DB_FAILED) return failure(locale, "generic");
  if (result) return failure(locale, result);
  revalidateAdmin(locale);
  return { ok: true };
}
