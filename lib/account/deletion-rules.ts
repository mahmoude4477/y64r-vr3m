// Who may delete an account (note 08 B2). CLI-safe: no "server-only" and no next/* imports, because lib/auth.ts
// calls deletionBlockers() from Better Auth hooks and the `auth` CLI loads lib/auth.ts in plain Node.
//
// Checked in three places, always BEFORE anything is deleted (note 08 F3: Better Auth deletes sessions and the
// password before databaseHooks.user.delete.before runs, so a blocker there would strand the user):
// 1. requestAccountDeletion (lib/account/delete-account.ts), before a code is e-mailed;
// 2. user.deleteUser.beforeDelete (lib/auth.ts), the authoritative check of the self-service delete;
// 3. the before hook of /admin/remove-user (lib/auth.ts), for the admin panel's delete.
// The last-admin rule alone (isLastActivePlatformAdmin) also guards /admin/set-role and /admin/ban-user (lib/auth.ts),
// so the platform can never be left without an active admin by a demotion or a ban either.
import { prisma } from "@/lib/prisma";
import { isPlatformAdminRole } from "@/lib/permissions";

export type BlockedOrganization = { id: string; name: string; nameEn: string | null };

export type DeletionBlocker =
  /** Sole owner of institutions that have other members: make another member an owner first. */
  | { kind: "only_owner"; organizations: BlockedOrganization[] }
  /** The only active platform admin: promote someone else first, or nobody could run the platform. */
  | { kind: "last_platform_admin" };

/** Better Auth stores several roles as "a,b". */
export function hasRole(field: string | null | undefined, role: string): boolean {
  return (field ?? "").split(",").some((r) => r.trim() === role);
}

/** A ban that is still in force (Better Auth lifts an expired ban at the next sign-in). */
export function isActiveBan(user: { banned: boolean | null; banExpires: Date | null }, now = new Date()): boolean {
  return !!user.banned && (!user.banExpires || user.banExpires > now);
}

type Membership = {
  role: string;
  organization: BlockedOrganization & { members: Array<{ role: string }> };
};

/**
 * Institutions where `memberships` makes the user the ONLY owner while other members remain. A sole owner who is
 * also the only member may leave (the institution then has no members; the admin panel shows "no owner").
 * `members` must list the OTHER members only.
 */
export function soleOwnerOrganizations(memberships: readonly Membership[]): BlockedOrganization[] {
  return memberships
    .filter((m) => hasRole(m.role, "owner"))
    .filter(({ organization: o }) => o.members.length > 0 && !o.members.some((x) => hasRole(x.role, "owner")))
    .map(({ organization: { id, name, nameEn } }) => ({ id, name, nameEn }));
}

/** Everything that stops `userId` from being deleted right now; [] = may be deleted (or the user is gone). */
export async function deletionBlockers(userId: string): Promise<DeletionBlocker[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return [];

  const memberships = await prisma.member.findMany({
    where: { userId },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          nameEn: true,
          members: { where: { userId: { not: userId } }, select: { role: true } },
        },
      },
    },
  });
  const blockers: DeletionBlocker[] = [];
  const stuck = soleOwnerOrganizations(memberships);
  if (stuck.length > 0) blockers.push({ kind: "only_owner", organizations: stuck });

  if (await isLastActivePlatformAdmin(userId, user.role)) blockers.push({ kind: "last_platform_admin" });
  return blockers;
}

/**
 * True when `userId` is a platform admin and no OTHER platform admin is active (not banned): deleting, demoting or
 * banning them would leave nobody to run the platform. `role` skips the user read when the caller already has it.
 */
export async function isLastActivePlatformAdmin(userId: string, role?: string | null): Promise<boolean> {
  const own = role === undefined ? (await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role : role;
  if (!isPlatformAdminRole(own)) return false;
  const candidates = await prisma.user.findMany({
    where: { id: { not: userId }, role: { contains: "admin" } },
    select: { role: true, banned: true, banExpires: true },
  });
  const now = new Date();
  return !candidates.some((c) => isPlatformAdminRole(c.role) && !isActiveBan(c, now));
}
