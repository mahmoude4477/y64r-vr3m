// Institution role rules for the org pages (client-safe: no server imports). Most of them mirror what Better Auth
// 1.7.14 enforces in plugins/organization/routes/crud-members.mjs and crud-invites.mjs, so the UI never offers an
// action the server refuses. One rule is stricter than Better Auth on its own (see canHandleInvitation); its server
// side is lib/org/auth-gates.ts, wired into lib/auth.ts by the foundation. Every change still goes through
// /api/auth/organization/*.
import { ORG_MANAGER_ROLES, ORG_ROLES, ORG_STAFF_ROLES, type OrgRole, strongestOrgRole } from "@/lib/permissions";

/** Owner, admin: manage members, invitations, departments. */
export function isManagerRole(role: OrgRole | null | undefined): boolean {
  return !!role && (ORG_MANAGER_ROLES as readonly OrgRole[]).includes(role);
}

/** Owner, admin, examiner: see the institution pages. */
export function isStaffRole(role: OrgRole | null | undefined): boolean {
  return !!role && (ORG_STAFF_ROLES as readonly OrgRole[]).includes(role);
}

/**
 * The role a member or invitation row stands for. Better Auth stores several roles as "a,b"; the strongest known one
 * wins. A row with no Waqaya role (Better Auth's default "member", only possible through a direct API call) is null:
 * lib/session.ts gives that person no institution at all, so the pages show "no role" instead of pretending that
 * the person is a trainee.
 */
export function memberRole(roleField: string | null | undefined): OrgRole | null {
  return strongestOrgRole(roleField);
}

/** Roles `actor` may give when inviting or changing a role. Only owners give (or take away) the owner role. */
export function assignableRoles(actor: OrgRole | null | undefined): OrgRole[] {
  if (actor === "owner") return [...ORG_ROLES];
  if (actor === "admin") return ORG_ROLES.filter((r) => r !== "owner");
  return [];
}

/** The roles in the order the pickers list them: the most common and least powerful first (trainee … owner). */
export function rolesForPicker(roles: readonly OrgRole[]): OrgRole[] {
  return [...roles].sort((a, b) => ORG_ROLES.indexOf(b) - ORG_ROLES.indexOf(a));
}

export type MemberRef = { id: string; role: OrgRole | null };
export type ActorRef = { memberId: string; role: OrgRole };

export type RoleChangeBlock = "not_manager" | "owner_only" | "last_owner";

/**
 * Why `actor` may not change `target`'s role, or null when they may. `ownerCount` = owners of the institution.
 * - only owners change an owner's role (Better Auth: YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER);
 * - the last owner cannot step down (YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER).
 */
export function roleChangeBlock(actor: ActorRef, target: MemberRef, ownerCount: number): RoleChangeBlock | null {
  if (!isManagerRole(actor.role)) return "not_manager";
  if (target.role === "owner" && actor.role !== "owner") return "owner_only";
  if (target.role === "owner" && ownerCount <= 1) return "last_owner";
  return null;
}

export type RemoveBlock = "not_manager" | "self" | "owner_only" | "last_owner";

/**
 * Why `actor` may not remove `target` from the institution, or null when they may.
 * - nobody removes themselves here (leaving is a separate action);
 * - only owners remove an owner, and never the last one (YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER).
 */
export function removeBlock(actor: ActorRef, target: MemberRef, ownerCount: number): RemoveBlock | null {
  if (!isManagerRole(actor.role)) return "not_manager";
  if (target.id === actor.memberId) return "self";
  if (target.role === "owner" && actor.role !== "owner") return "owner_only";
  if (target.role === "owner" && ownerCount <= 1) return "last_owner";
  return null;
}

/**
 * Whether `actor` may cancel or resend an invitation for `role`: managers, and only owners for an owner invitation.
 * Better Auth refuses an admin's resend of an owner invitation by itself (invite-member checks the role), but its
 * cancel-invitation checks only invitation:cancel, which institution admins have: the owner-only cancel is enforced
 * by cancelInvitationRefusal (lib/org/auth-gates.ts) once lib/auth.ts calls it (foundation request SEC-5).
 * An invitation with no Waqaya role (null) can only be canceled, by any manager.
 */
export function canHandleInvitation(actor: OrgRole | null | undefined, role: OrgRole | null): boolean {
  if (!isManagerRole(actor)) return false;
  return role === null || assignableRoles(actor).includes(role);
}

/** Position of a role in ORG_ROLES; rows with no Waqaya role come last. */
function rank(role: OrgRole | null): number {
  return role === null ? ORG_ROLES.length : ORG_ROLES.indexOf(role);
}

/** Strongest role first (no role last), then by name in the page's language. */
export function compareMembers(locale: string) {
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  return (a: { role: OrgRole | null; name: string }, b: { role: OrgRole | null; name: string }) =>
    rank(a.role) - rank(b.role) || collator.compare(a.name, b.name);
}

/** Members per role, every role present (0 when none), plus the rows with no Waqaya role. */
export function countByRole(roles: readonly (OrgRole | null)[]): { byRole: Record<OrgRole, number>; noRole: number } {
  const byRole = Object.fromEntries(ORG_ROLES.map((r) => [r, 0])) as Record<OrgRole, number>;
  let noRole = 0;
  for (const role of roles) {
    if (role === null) noRole += 1;
    else byRole[role] += 1;
  }
  return { byRole, noRole };
}
