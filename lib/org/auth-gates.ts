// Server rules for Better Auth's organization endpoints that Better Auth 1.7.14 does not enforce by itself. The browser
// can call /api/auth/organization/* directly, so the org pages' own rules (lib/org/access.ts, the forms' schemas,
// lib/org/roles.ts) need a server side too. lib/auth.ts (foundation) calls these from `hooks.before`, after its
// session gate, and turns a refusal into `hookError(r.status, r.code, r.english, locale)`. One call covers all of them
// (teamAuthGateRefusal at the end of this file), together with the settings rules (lib/settings-feature/auth-gates.ts).
// CLI-safe: no "server-only" (the `auth` CLI loads lib/auth.ts in plain Node), only Prisma and pure modules.
import { ORG_MANAGER_ROLES, ORG_ROLES, ORG_STAFF_ROLES, type OrgRole, strongestOrgRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sessionRevokeRefusal, updateUserRefusal } from "@/lib/settings-feature/auth-gates";
import { isStoredDepartmentName, isStoredForm, orgProfileSchema, sameDepartmentName } from "./schemas";

export type GateRefusal = {
  status: "BAD_REQUEST" | "FORBIDDEN";
  code: string;
  /** The English text (hookError translates by code: lib/auth-errors-ar.ts / lib/account/errors-ar.ts). */
  english: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const invalid = (field: string): GateRefusal => ({ status: "BAD_REQUEST", code: "INVALID_INPUT", english: `Invalid value: ${field}` });

// ---------------------------------------------------------------------------------------------------
// Reads (SEC-1): Better Auth only checks that the caller is a member of the institution.
// ---------------------------------------------------------------------------------------------------

/**
 * Who may call each organization read. The pages show members to staff only (trainees get the not-found page) and
 * invitations to managers only; get-full-organization embeds both. Nothing in the app calls these from the browser.
 */
const READ_RULES = new Map<string, readonly OrgRole[]>([
  ["/organization/list-members", ORG_STAFF_ROLES],
  ["/organization/list-team-members", ORG_STAFF_ROLES],
  ["/organization/list-teams", ORG_STAFF_ROLES],
  ["/organization/list-invitations", ORG_MANAGER_ROLES],
  ["/organization/get-full-organization", ORG_MANAGER_ROLES],
]);

/** True for the reads this module gates (lib/auth.ts runs orgReadRefusal for them). */
export function isGatedOrgRead(path: string): boolean {
  return READ_RULES.has(path);
}

/** Whether a member with `roleField` (Better Auth's "a,b" list) may call the read `path`. Other paths: true. */
export function orgReadAllowed(path: string, roleField: string | null | undefined): boolean {
  const roles = READ_RULES.get(path);
  if (!roles) return true;
  const role = strongestOrgRole(roleField);
  return role !== null && roles.includes(role);
}

/**
 * The institutions a gated read looks at, resolved the way Better Auth 1.7.14 resolves them (crud-members.mjs,
 * crud-invites.mjs, crud-org.mjs, crud-team.mjs): query.organizationId else the active one, a slug (looked up)
 * when given, and for list-team-members the team's institution (query.teamId else the active team). When both an id
 * and a slug are given, both are checked (over-checking can only refuse).
 */
export async function readTargetOrganizations(
  path: string,
  query: unknown,
  session: { activeOrganizationId?: string | null; activeTeamId?: string | null },
): Promise<string[]> {
  const q = asRecord(query);
  const targets: Array<string | null> = [];
  if (path === "/organization/list-team-members") {
    const teamId = str(q.teamId) ?? str(session.activeTeamId);
    if (teamId) {
      const team = await prisma.team.findUnique({ where: { id: teamId }, select: { organizationId: true } });
      targets.push(team?.organizationId ?? null);
    }
  } else {
    // list-invitations and list-teams ignore organizationSlug.
    const usesSlug = path === "/organization/list-members" || path === "/organization/get-full-organization";
    const slug = usesSlug ? str(q.organizationSlug) : null;
    if (slug) {
      const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
      targets.push(org?.id ?? null);
    }
    const id = str(q.organizationId);
    if (id || !slug) targets.push(id ?? str(session.activeOrganizationId));
  }
  return [...new Set(targets.filter((t): t is string => t !== null))];
}

/**
 * A refusal for a gated organization read by `userId`, or null (allowed, not gated, or nothing to resolve: Better
 * Auth then answers by itself). The caller's role is checked in every institution the read looks at.
 */
export async function orgReadRefusal(input: {
  path: string;
  query: unknown;
  userId: string;
  session: { activeOrganizationId?: string | null; activeTeamId?: string | null };
}): Promise<GateRefusal | null> {
  if (!isGatedOrgRead(input.path)) return null;
  const targets = await readTargetOrganizations(input.path, input.query, input.session);
  if (targets.length === 0) return null;
  const members = await prisma.member.findMany({
    where: { userId: input.userId, organizationId: { in: targets } },
    select: { organizationId: true, role: true },
  });
  const roleIn = new Map(members.map((m) => [m.organizationId, m.role]));
  if (targets.every((id) => orgReadAllowed(input.path, roleIn.get(id)))) return null;
  return { status: "FORBIDDEN", code: "YOU_ARE_NOT_ALLOWED_TO_VIEW_THIS", english: "You are not allowed to view this" };
}

// ---------------------------------------------------------------------------------------------------
// Institution profile (SEC-2): Better Auth checks only name.min(1); additional fields are not validated at all.
// ---------------------------------------------------------------------------------------------------

/** The only organization fields a manager changes through /organization/update (the edit form's fields). */
const ORG_UPDATE_FIELDS = new Set(["name", "nameEn", "type"]);

function profileFieldRefusal(field: "name" | "nameEn" | "type", value: unknown): GateRefusal | null {
  if (field === "nameEn" && value === null) return null; // clears the English name
  // The raw value, not only its trimmed copy: Better Auth stores what it was sent (R2-SEC-1).
  return isStoredForm(orgProfileSchema.shape[field], value) ? null : invalid(field);
}

/**
 * /organization/update: only data.name, data.nameEn and data.type, each valid (slug, logo and metadata are not
 * offered by the UI: FIELD_NOT_ALLOWED). /organization/create (platform admins): the same rules for name, nameEn and
 * type when present; its other fields (slug, keepCurrentActiveOrganization, …) are left to Better Auth.
 */
export function orgProfileRefusal(path: string, body: unknown): GateRefusal | null {
  const b = asRecord(body);
  if (path === "/organization/update") {
    const data = asRecord(b.data);
    for (const key of Object.keys(data)) {
      if (!ORG_UPDATE_FIELDS.has(key)) return { status: "BAD_REQUEST", code: "FIELD_NOT_ALLOWED", english: `Field not allowed: ${key}` };
    }
    for (const field of ["name", "nameEn", "type"] as const) {
      if (field in data) {
        const refusal = profileFieldRefusal(field, data[field]);
        if (refusal) return refusal;
      }
    }
    return null;
  }
  if (path === "/organization/create") {
    if (!isStoredForm(orgProfileSchema.shape.name, b.name)) return invalid("name");
    for (const field of ["nameEn", "type"] as const) {
      if (field in b && b[field] !== undefined) {
        const refusal = profileFieldRefusal(field, b[field]);
        if (refusal) return refusal;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Department names (SEC-2): Better Auth accepts any string, also an empty one or a duplicate.
// ---------------------------------------------------------------------------------------------------

/**
 * create-team (body.name, institution = body.organizationId else the active one) and update-team (body.data.name,
 * institution = the team row's, else body.data.organizationId, else the active one): the name must be valid and
 * already normalized, exactly as the form sends it (isStoredDepartmentName: no padding a trim would hide), and not the
 * name of another department of the same institution (sameDepartmentName).
 */
export async function departmentNameRefusal(
  path: string,
  body: unknown,
  activeOrganizationId: string | null | undefined,
): Promise<GateRefusal | null> {
  if (path !== "/organization/create-team" && path !== "/organization/update-team") return null;
  const b = asRecord(body);
  let name: unknown;
  let organizationId: string | null;
  let teamId: string | null = null;
  if (path === "/organization/create-team") {
    name = b.name;
    organizationId = str(b.organizationId) ?? str(activeOrganizationId);
  } else {
    const data = asRecord(b.data);
    if (!("name" in data)) return null; // nothing about the name changes
    name = data.name;
    teamId = str(b.teamId);
    const team = teamId ? await prisma.team.findUnique({ where: { id: teamId }, select: { organizationId: true } }) : null;
    organizationId = team?.organizationId ?? str(data.organizationId) ?? str(activeOrganizationId);
  }
  if (!isStoredDepartmentName(name)) return invalid("name");
  if (!organizationId) return null;
  const teams = await prisma.team.findMany({ where: { organizationId }, select: { id: true, name: true } });
  const taken = teams.some((t) => t.id !== teamId && sameDepartmentName(t.name, name));
  return taken ? { status: "BAD_REQUEST", code: "DEPARTMENT_NAME_TAKEN", english: "A department with this name already exists" } : null;
}

// ---------------------------------------------------------------------------------------------------
// Roles (SEC-6): Better Auth also accepts its own default roles ("member"), which Waqaya does not use.
// ---------------------------------------------------------------------------------------------------

const ROLE_PATHS = new Set(["/organization/update-member-role", "/organization/invite-member", "/organization/add-member"]);

/** Every part of a role value ("a", "a,b" or ["a", "b"]) is one of Waqaya's four institution roles. */
export function isOrgRoleValue(value: unknown): boolean {
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : null;
  if (!parts || parts.length === 0) return false;
  return parts.every((p) => typeof p === "string" && (ORG_ROLES as readonly string[]).includes(p.trim()));
}

/** update-member-role / invite-member / add-member with a role outside ORG_ROLES: ROLE_NOT_FOUND. */
export function orgRoleRefusal(path: string, body: unknown): GateRefusal | null {
  if (!ROLE_PATHS.has(path)) return null;
  const b = asRecord(body);
  if (!("role" in b)) return null; // Better Auth answers a missing role by itself
  return isOrgRoleValue(b.role) ? null : { status: "BAD_REQUEST", code: "ROLE_NOT_FOUND", english: "Role not found" };
}

// ---------------------------------------------------------------------------------------------------
// Owner invitations (SEC-5): Better Auth lets institution admins cancel them (invitation:cancel only).
// ---------------------------------------------------------------------------------------------------

function includesOwner(roleField: string | null | undefined): boolean {
  return (roleField ?? "").split(",").some((r) => r.trim() === "owner");
}

/**
 * /organization/cancel-invitation of an invitation that gives the owner role, by anyone who is not an owner of that
 * institution: refused, the same rule as inviting or resending (only owners give the owner role). Unknown
 * invitation: null (Better Auth answers INVITATION_NOT_FOUND).
 */
export async function cancelInvitationRefusal(body: unknown, userId: string): Promise<GateRefusal | null> {
  const invitationId = str(asRecord(body).invitationId);
  if (!invitationId) return null;
  const invitation = await prisma.invitation.findUnique({ where: { id: invitationId }, select: { role: true, organizationId: true } });
  if (!invitation || !includesOwner(invitation.role)) return null;
  const member = await prisma.member.findFirst({
    where: { organizationId: invitation.organizationId, userId },
    select: { role: true },
  });
  if (includesOwner(member?.role)) return null;
  return {
    status: "FORBIDDEN",
    code: "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION",
    english: "You are not allowed to cancel this invitation",
  };
}

// ---------------------------------------------------------------------------------------------------
// One entry point for lib/auth.ts hooks.before (foundation), after its session, must-change-password and
// suspended-institution checks: `const r = await teamAuthGateRefusal({...}); if (r) throw hookError(r.status, r.code,
// r.english, locale);`
// ---------------------------------------------------------------------------------------------------

export type TeamGateInput = {
  path: string;
  body: unknown;
  query: unknown;
  /** The signed-in user (in an impersonation session: the user being acted as). */
  userId: string;
  session: { activeOrganizationId?: string | null; activeTeamId?: string | null; impersonatedBy?: string | null };
  /** isPlatformAdminRole(user.role). */
  platformAdmin: boolean;
};

/**
 * Every rule of this file and of lib/settings-feature/auth-gates.ts for one Better Auth call, or null. Value rules
 * (names, types, roles, /update-user fields) and the impersonation rule apply to everyone; the permission rules that
 * only narrow what Better Auth allows members (reads by role, canceling owner invitations) do not apply to platform
 * admins.
 */
export async function teamAuthGateRefusal(input: TeamGateInput): Promise<GateRefusal | null> {
  const { path, body } = input;
  const sync =
    sessionRevokeRefusal(path, input.session) ??
    (path === "/update-user" ? updateUserRefusal(body) : null) ??
    orgProfileRefusal(path, body) ??
    orgRoleRefusal(path, body);
  if (sync) return sync;
  const department = await departmentNameRefusal(path, body, input.session.activeOrganizationId);
  if (department) return department;
  if (input.platformAdmin) return null;
  if (path === "/organization/cancel-invitation") return cancelInvitationRefusal(body, input.userId);
  return orgReadRefusal({ path, query: input.query, userId: input.userId, session: input.session });
}
