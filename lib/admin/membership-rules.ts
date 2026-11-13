// Rules for the platform admin's own member changes (role change, removal) in an institution. The admin panel writes
// these rows itself (a platform admin is usually not a member, so Better Auth's /organization/* endpoints refuse
// them). It keeps the invariant the account rules rely on (lib/account/deletion-rules.ts): an institution that has
// members always keeps at least one owner. The only exception is removing the LAST member, which leaves an empty
// institution (shown as "no owner" in the admin panel), the same as a sole owner who is the only member leaving.
// Pure (no database import, so Client Components may use it too), unit-tested.
import { strongestOrgRole, type OrgRole } from "@/lib/permissions";

/** Better Auth stores several roles as "a,b" (same rule as lib/account/deletion-rules.ts hasRole). */
export function hasRole(field: string | null | undefined, role: string): boolean {
  return (field ?? "").split(",").some((r) => r.trim() === role);
}

/** userId (when known) lets a duplicate row of the same person never count as "another owner". */
export type MemberRoleRow = { id: string; role: string; userId?: string };

export type MemberChange = { kind: "role"; memberId: string; role: OrgRole } | { kind: "remove"; memberId: string };

export type MemberChangeRefusal = "not_found" | "last_owner" | "unchanged";

/** Why `change` must not happen to `members` (every member of the institution), or null when it may. */
export function memberChangeRefusal(members: readonly MemberRoleRow[], change: MemberChange): MemberChangeRefusal | null {
  const target = members.find((m) => m.id === change.memberId);
  if (!target) return "not_found";
  if (change.kind === "role" && strongestOrgRole(target.role) === change.role && !target.role.includes(",")) return "unchanged";

  const losesOwner = hasRole(target.role, "owner") && (change.kind === "remove" || change.role !== "owner");
  if (!losesOwner) return null;
  const sameUser = (m: MemberRoleRow) => m.id === target.id || (m.userId !== undefined && m.userId === target.userId);
  const otherOwners = members.filter((m) => !sameUser(m) && hasRole(m.role, "owner")).length;
  if (otherOwners > 0) return null;
  // Removing the only member is allowed (the institution is left empty); anything else would leave members
  // without an owner.
  if (change.kind === "remove" && members.every(sameUser)) return null;
  return "last_owner";
}

/** True when this change can take an owner away, so it must run under the account lock (lib/account/deletion-lock). */
export function changeNeedsAccountLock(targetRole: string, change: MemberChange): boolean {
  return hasRole(targetRole, "owner") && (change.kind === "remove" || change.role !== "owner");
}

/**
 * The institution already has its owner, or one is on the way: another person holds the owner role, or an owner
 * invitation is pending that can still be accepted (not expired, its inviter still a member). The platform admin's own
 * owner access (from creating or joining the institution) does not count: it is only there to set the institution up.
 */
export function ownerInPlace(input: {
  viewerUserId: string;
  members: ReadonlyArray<{ userId: string; role: string }>;
  invitations: ReadonlyArray<{ role: string | null; usable: boolean }>;
}): boolean {
  return (
    input.members.some((m) => m.userId !== input.viewerUserId && hasRole(m.role, "owner")) ||
    input.invitations.some((i) => i.usable && hasRole(i.role, "owner"))
  );
}

/**
 * The role the admin panel's invite form starts with (least privilege): "owner" only while the institution still
 * needs its first owner and the admin may invite one (Better Auth: only an owner invites an owner); otherwise the
 * weakest role, so that pressing "Send" without looking never hands out control of an institution.
 */
export function defaultInviteRole(input: { viewerIsOwner: boolean; ownerInPlace: boolean }): OrgRole {
  return input.viewerIsOwner && !input.ownerInPlace ? "owner" : "trainee";
}
