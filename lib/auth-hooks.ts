// Rules behind lib/auth.ts hooks: the mustChangePassword and suspended-institution gates for Better Auth's
// own endpoints (/api/auth/*, which the browser can call directly), and the automatic audit of admin /
// organization endpoints. CLI-safe: no "server-only" (the `auth` CLI loads lib/auth.ts in plain Node).
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------------------------------

/** Paths that need no session gate: public auth flows, the session itself and the password change. */
const UNGATED_EXACT = new Set([
  "/get-session",
  "/sign-out",
  "/change-password",
  "/ok",
  "/error",
  "/verify-email",
  "/send-verification-email",
  "/request-password-reset",
  "/reset-password",
]);
const UNGATED_PREFIXES = ["/sign-in/", "/sign-up/", "/email-otp/", "/forget-password/", "/reset-password/", "/callback/"];

/** True when the before hook must read the session and apply the gates below. */
export function isGatedAuthPath(path: string): boolean {
  return !UNGATED_EXACT.has(path) && !UNGATED_PREFIXES.some((p) => path.startsWith(p));
}

/** While user.mustChangePassword is set, every gated path is refused except these. */
const ALLOWED_WHILE_MUST_CHANGE_PASSWORD = new Set(["/admin/stop-impersonating"]);

export function blockedByMustChangePassword(path: string): boolean {
  return isGatedAuthPath(path) && !ALLOWED_WHILE_MUST_CHANGE_PASSWORD.has(path);
}

/** POST /organization/* endpoints that do not change the organization (allowed while it is suspended). */
const ORG_NON_WRITES = new Set([
  "/organization/check-slug",
  "/organization/has-permission",
  "/organization/leave",
  "/organization/reject-invitation",
  "/organization/create", // a new organization is never suspended
]);

/** An /organization/* call that changes the organization (members, invitations, teams, roles, settings). */
export function isOrganizationWrite(path: string): boolean {
  if (!path.startsWith("/organization/")) return false;
  if (path.startsWith("/organization/get-") || path.startsWith("/organization/list")) return false;
  return !ORG_NON_WRITES.has(path);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Endpoints that act on an existing invitation: Better Auth takes the organization from the invitation row. */
const INVITATION_PATHS = new Set(["/organization/accept-invitation", "/organization/cancel-invitation"]);

/** Endpoints that act on an existing team (department). */
const TEAM_PATHS = new Set([
  "/organization/update-team",
  "/organization/remove-team",
  "/organization/add-team-member",
  "/organization/remove-team-member",
]);

/**
 * Every organization an /organization/* write may change, resolved the way Better Auth 1.7.14 resolves it
 * (plugins/organization/routes/*), so the suspended gate checks the organization the endpoint really uses:
 * - accept-invitation, cancel-invitation: the invitation row's organization;
 * - set-active: body.organizationId, or the organization of body.organizationSlug (null clears: always allowed);
 * - update-team: body.data.organizationId, else the active one (Better Auth ignores body.organizationId there);
 * - every other write: body.organizationId, else the active one.
 * Team endpoints also add the team row's organization (defensive: over-checking can only refuse).
 */
export async function resolveTargetOrganizations(
  path: string,
  body: unknown,
  activeOrganizationId: string | null | undefined,
): Promise<string[]> {
  const b = asRecord(body);
  const active = str(activeOrganizationId);
  const targets: Array<string | null> = [];

  if (INVITATION_PATHS.has(path)) {
    const invitationId = str(b.invitationId);
    if (invitationId) {
      const inv = await prisma.invitation.findUnique({ where: { id: invitationId }, select: { organizationId: true } });
      targets.push(inv?.organizationId ?? null);
    }
  } else if (path === "/organization/set-active") {
    const slug = str(b.organizationSlug);
    if (!str(b.organizationId) && slug) {
      const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
      targets.push(org?.id ?? null);
    } else {
      targets.push(str(b.organizationId));
    }
  } else if (path === "/organization/update-team") {
    targets.push(str(asRecord(b.data).organizationId) ?? active);
  } else {
    targets.push(str(b.organizationId) ?? active);
  }

  if (TEAM_PATHS.has(path)) {
    const teamId = str(b.teamId);
    if (teamId) {
      const team = await prisma.team.findUnique({ where: { id: teamId }, select: { organizationId: true } });
      targets.push(team?.organizationId ?? null);
    }
  }
  return [...new Set(targets.filter((id): id is string => id !== null))];
}

/**
 * The suspended institution an /organization/* call would change, or null (not a write, or nothing it
 * targets is suspended). lib/auth.ts refuses the call with 403 ORGANIZATION_SUSPENDED when this is set.
 */
export async function suspendedWriteTarget(
  path: string,
  body: unknown,
  activeOrganizationId: string | null | undefined,
): Promise<string | null> {
  if (!isOrganizationWrite(path)) return null;
  const ids = await resolveTargetOrganizations(path, body, activeOrganizationId);
  if (ids.length === 0) return null;
  const org = await prisma.organization.findFirst({ where: { id: { in: ids }, suspended: true }, select: { id: true } });
  return org?.id ?? null;
}

// ---------------------------------------------------------------------------------------------------
// Audit of Better Auth admin / organization endpoints
// ---------------------------------------------------------------------------------------------------

/** Every admin-plugin and organization-plugin endpoint that changes something. Reads are not audited. */
export const AUDITED_AUTH_PATHS = new Set([
  "/admin/ban-user",
  "/admin/create-user",
  "/admin/impersonate-user",
  "/admin/remove-user",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/stop-impersonating",
  "/admin/unban-user",
  "/admin/update-user",
  "/organization/accept-invitation",
  "/organization/add-team-member",
  "/organization/cancel-invitation",
  "/organization/create",
  "/organization/create-role",
  "/organization/create-team",
  "/organization/delete",
  "/organization/delete-role",
  "/organization/invite-member",
  "/organization/leave",
  "/organization/reject-invitation",
  "/organization/remove-member",
  "/organization/remove-team",
  "/organization/remove-team-member",
  "/organization/update",
  "/organization/update-member-role",
  "/organization/update-role",
  "/organization/update-team",
]);

/**
 * The user's own account endpoints, audited only while a platform admin acts as that user (the admin is the actor,
 * meta.impersonating the user): everything else a user does to their own account is theirs. Session revokes are
 * refused in that state (lib/settings-feature/auth-gates.ts), so they never get here.
 */
export const IMPERSONATION_AUDITED_PATHS = new Set(["/update-user", "/change-password", "/change-email"]);

/**
 * Body fields copied into audit meta. Never passwords, session tokens, e-mail addresses or free text about a person:
 * banReason stays on the user row only (it may describe the person, and audit rows outlive a deleted account).
 */
const META_FIELDS = [
  "userId",
  "role",
  "roleName",
  "roleId",
  "organizationId",
  "memberId",
  "invitationId",
  "teamId",
  "banExpiresIn",
] as const;

export type AuthAuditSession = {
  user: { id: string };
  session: { impersonatedBy?: string | null; activeOrganizationId?: string | null };
} | null;

export type AuthAuditEntry = {
  actorId: string | null;
  action: string;
  targetType: "user" | "organization";
  targetId: string | null;
  meta: Prisma.InputJsonObject;
};

/**
 * The audit row for a successful admin / organization endpoint call, or null when the path is not audited.
 * Actor: the real person. While impersonating, that is the admin (session.impersonatedBy) and
 * meta.impersonating names the impersonated user.
 */
export function authAuditEntry(input: { path: string; body: unknown; returned: unknown; session: AuthAuditSession }): AuthAuditEntry | null {
  const { path, session } = input;
  const impersonator = str(session?.session.impersonatedBy);
  if (IMPERSONATION_AUDITED_PATHS.has(path) && impersonator && session) {
    // Which fields, never their values (a name, an e-mail address, a password).
    const fields = Object.keys(asRecord(input.body)).filter((k) => k !== "password" && k !== "currentPassword" && k !== "newPassword").sort();
    return {
      actorId: impersonator,
      action: `auth.user.${path.slice(1)}`,
      targetType: "user",
      targetId: session.user.id,
      meta: { impersonating: session.user.id, ...(path === "/update-user" ? { fields } : {}) },
    };
  }
  if (!AUDITED_AUTH_PATHS.has(path)) return null;
  const [, plugin = "", endpoint = ""] = path.split("/");
  const body = asRecord(input.body);
  const returned = asRecord(input.returned);
  const impersonatedBy = str(session?.session.impersonatedBy);

  const meta: Record<string, Prisma.InputJsonValue> = {};
  for (const field of META_FIELDS) {
    const value = body[field];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") meta[field] = value;
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) meta[field] = value as string[];
  }
  const data = asRecord(body.data);
  if (Object.keys(data).length > 0) meta.fields = Object.keys(data).sort(); // which fields changed, not their values
  if (impersonatedBy && session) meta.impersonating = session.user.id;

  let targetType: AuthAuditEntry["targetType"];
  let targetId: string | null;
  if (plugin === "admin") {
    targetType = "user";
    targetId =
      str(body.userId) ??
      str(asRecord(returned.user).id) ??
      (path === "/admin/stop-impersonating" ? (session?.user.id ?? null) : null);
  } else {
    targetType = "organization";
    targetId =
      str(body.organizationId) ??
      str(returned.organizationId) ??
      str(asRecord(returned.invitation).organizationId) ??
      str(asRecord(returned.member).organizationId) ??
      (path === "/organization/create" ? str(returned.id) : null) ??
      str(session?.session.activeOrganizationId);
    if (path === "/organization/invite-member" && str(returned.id)) meta.invitationId = str(returned.id) as string;
  }

  return {
    actorId: impersonatedBy ?? session?.user.id ?? null,
    action: `auth.${plugin}.${endpoint}`,
    targetType,
    targetId,
    meta,
  };
}
