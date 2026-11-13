// Shared by server (lib/auth.ts) and client (lib/auth-client.ts): no server-only imports here.
import {
  adminAc as platformAdminAc,
  userAc as platformUserAc,
} from "better-auth/plugins/admin/access";
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  ownerAc,
} from "better-auth/plugins/organization/access";

/** Organization-level resources. Platform-wide powers live on user.role = "admin" (admin plugin). */
export const statement = {
  ...defaultStatements, // organization, member, invitation, team, ac
  protocol: ["create", "update", "delete", "publish"],
  simulation: ["attempt", "assign", "review"],
  scan: ["create", "read", "review", "finalize", "delete"],
  report: ["read", "export"],
} as const;

export const ac = createAccessControl(statement);

const domainFull = {
  protocol: ["create", "update", "delete", "publish"],
  simulation: ["attempt", "assign", "review"],
  scan: ["create", "read", "review", "finalize", "delete"],
  report: ["read", "export"],
} as const;

// Spread the built-in statements, or owner/admin lose the default org/member/invitation permissions.
// Owners do NOT get organization:"delete" (Better Auth's ownerAc has it): only platform admins delete an
// institution, through deleteOrganizationWithData(). /organization/delete is also disabled in lib/auth.ts.
export const owner = ac.newRole({
  ...ownerAc.statements,
  organization: ["update"],
  ...domainFull,
});
export const admin = ac.newRole({ ...adminAc.statements, ...domainFull }); // institution admin
export const examiner = ac.newRole({
  ac: ["read"],
  simulation: ["attempt", "review"],
  scan: ["create", "read", "review", "finalize"],
  report: ["read", "export"],
});
export const trainee = ac.newRole({
  ac: ["read"],
  simulation: ["attempt"],
});

export const orgRoles = { owner, admin, examiner, trainee };
export type OrgRole = keyof typeof orgRoles;
export const ORG_ROLES = [
  "owner",
  "admin",
  "examiner",
  "trainee",
] as const satisfies readonly OrgRole[];
/** Roles that manage the institution (members, invitations, departments, custom protocols). */
export const ORG_MANAGER_ROLES = [
  "owner",
  "admin",
] as const satisfies readonly OrgRole[];
/** Roles that see institution-wide data (dashboards, trainees' results, scans). */
export const ORG_STAFF_ROLES = [
  "owner",
  "admin",
  "examiner",
] as const satisfies readonly OrgRole[];

export type Permissions = {
  [K in keyof typeof statement]?: Array<(typeof statement)[K][number]>;
};

export function isOrgRole(value: unknown): value is OrgRole {
  return (
    typeof value === "string" &&
    (ORG_ROLES as readonly string[]).includes(value)
  );
}

/** Better Auth stores multiple roles as "a,b". Returns the strongest known role, or null. */
export function strongestOrgRole(
  roleField: string | null | undefined,
): OrgRole | null {
  if (!roleField) return null;
  const roles = roleField.split(",").map((r) => r.trim());
  return ORG_ROLES.find((r) => roles.includes(r)) ?? null;
}

export const ORGANIZATION_TYPES = [
  "university",
  "hospital",
  "training_center",
  "government",
] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

/** Platform super-admin (admin plugin): user.role contains "admin" (Better Auth stores roles as "a,b"). */
export function isPlatformAdminRole(role: string | null | undefined): boolean {
  return (role ?? "").split(",").some((r) => r.trim() === "admin");
}

/**
 * Platform protocol editor (user.role "protocol_editor"): manages the global protocols and the simulation scenarios
 * (/admin/protocols, /admin/scenarios) and nothing else of the admin area. No Better Auth admin-plugin permission.
 */
export const PROTOCOL_EDITOR_ROLE = "protocol_editor";

/**
 * Platform roles of the admin plugin (user.role). Better Auth's own "admin" and "user", plus the protocol editor, who
 * has no admin-plugin permission at all (its powers are requireContentEditor() in lib/session.ts). Listing the roles
 * also makes /admin/set-role refuse any other value (YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE).
 */
export const platformRoles = {
  admin: platformAdminAc,
  user: platformUserAc,
  protocol_editor: platformUserAc,
};

export function isProtocolEditorRole(role: string | null | undefined): boolean {
  return (role ?? "").split(",").some((r) => r.trim() === PROTOCOL_EDITOR_ROLE);
}

/** May edit the platform's global content (protocols, scenarios): platform admins and protocol editors. */
export function isContentEditorRole(role: string | null | undefined): boolean {
  return isPlatformAdminRole(role) || isProtocolEditorRole(role);
}
