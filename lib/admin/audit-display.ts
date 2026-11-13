// How an audit_log row is shown in the admin panel (overview "latest activity" and the audit log page).
// Pure, unit-tested; shared by Server and Client Components.

import { isPlatformAdminRole } from "@/lib/permissions";

export type AuditActorRow = {
  actorId: string | null;
  actorName: string | null;
  actorDeleted: boolean;
  /** The actor's current name, when the account still exists (joined from user). */
  actor?: { name: string } | null;
};

export type AuditActorView =
  | { kind: "deleted" }
  | { kind: "system" }
  | { kind: "user"; userId: string | null; name: string };

/**
 * CONVENTIONS section 6: actorDeleted -> common.deletedUser; actorId and actorName both null (and not deleted) ->
 * common.system; otherwise the actor's current name, else the actorName snapshot taken when the row was written.
 */
export function auditActorView(row: AuditActorRow): AuditActorView {
  if (row.actorDeleted) return { kind: "deleted" };
  if (row.actorId === null && row.actorName === null) return { kind: "system" };
  const name = row.actor?.name?.trim() || row.actorName?.trim() || "";
  if (!name) return row.actorId ? { kind: "user", userId: row.actorId, name: "" } : { kind: "system" };
  return { kind: "user", userId: row.actorId, name };
}

/**
 * Message keys (admin.activity.actions.<key>) for the audit actions the platform writes: Better Auth's automatic rows
 * (auth.<plugin>.<endpoint>, lib/auth-hooks.ts AUDITED_AUTH_PATHS) and the app's own writeAudit() rows. An action
 * missing here is shown by its code, so a new action never breaks the page.
 */
export const AUDIT_ACTION_KEYS = {
  "auth.admin.ban-user": "banUser",
  "auth.admin.unban-user": "unbanUser",
  "auth.admin.set-role": "setRole",
  "auth.admin.impersonate-user": "impersonate",
  "auth.admin.stop-impersonating": "stopImpersonating",
  "auth.admin.remove-user": "removeUser",
  "auth.admin.revoke-user-session": "revokeSession",
  "auth.admin.revoke-user-sessions": "revokeSessions",
  "auth.admin.set-user-password": "setPassword",
  "auth.admin.update-user": "updateUser",
  "auth.admin.create-user": "createUser",
  // A user's own account endpoints, audited only while a platform admin acts as that user (lib/auth-hooks.ts).
  "auth.user.update-user": "userSelfUpdate",
  "auth.user.change-password": "userSelfPassword",
  "auth.user.change-email": "userSelfEmail",
  "auth.organization.create": "orgCreate",
  "auth.organization.update": "orgUpdate",
  "auth.organization.delete": "orgDelete",
  "auth.organization.invite-member": "orgInvite",
  "auth.organization.accept-invitation": "orgAcceptInvitation",
  "auth.organization.reject-invitation": "orgRejectInvitation",
  "auth.organization.cancel-invitation": "orgCancelInvitation",
  "auth.organization.remove-member": "orgRemoveMember",
  "auth.organization.update-member-role": "orgMemberRole",
  "auth.organization.leave": "orgLeave",
  "auth.organization.create-team": "teamCreate",
  "auth.organization.update-team": "teamUpdate",
  "auth.organization.remove-team": "teamRemove",
  "auth.organization.add-team-member": "teamAddMember",
  "auth.organization.remove-team-member": "teamRemoveMember",
  "auth.organization.create-role": "roleCreate",
  "auth.organization.update-role": "roleUpdate",
  "auth.organization.delete-role": "roleDelete",
  "organization.update": "orgUpdate",
  "organization.suspend": "orgSuspend",
  "organization.unsuspend": "orgUnsuspend",
  "organization.delete": "orgDelete",
  "organization.member.add": "orgMemberAdd",
  "organization.member.role": "orgMemberRole",
  "organization.member.remove": "orgRemoveMember",
  "organization.invitation.cancel": "orgCancelInvitation",
  "account.delete": "accountDelete",
  "account.delete.request": "accountDeleteRequest",
  "account.session.revoke": "accountSessionRevoke",
  "account.sessions.revoke_others": "accountSessionsRevokeOthers",
  "scan.finalize": "scanFinalize",
  "scan.delete": "scanDelete",
  "attempt.delete": "attemptDelete",
  "setting.update": "settingUpdate",
  "setting.reset": "settingReset",
  "protocol.create": "protocolCreate",
  "protocol.update": "protocolUpdate",
  "protocol.copy": "protocolCopy",
  "protocol.version": "protocolVersion",
  "protocol.publish": "protocolPublish",
  "protocol.unpublish": "protocolUnpublish",
  "protocol.delete": "protocolDelete",
  "scenario.create": "scenarioCreate",
  "scenario.update": "scenarioUpdate",
  "scenario.version": "scenarioVersion",
  "scenario.publish": "scenarioPublish",
  "scenario.unpublish": "scenarioUnpublish",
  "scenario.delete": "scenarioDelete",
  "reports.export": "reportsExport",
} as const;

export type AuditActionKey = (typeof AUDIT_ACTION_KEYS)[keyof typeof AUDIT_ACTION_KEYS];

export function auditActionKey(action: string): AuditActionKey | null {
  return Object.hasOwn(AUDIT_ACTION_KEYS, action) ? AUDIT_ACTION_KEYS[action as keyof typeof AUDIT_ACTION_KEYS] : null;
}

/** meta.impersonating of a row (the user the admin was acting as), or null. */
export function auditImpersonating(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>).impersonating;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Target types with a label (admin.audit.targetTypes.<type>); any other type is shown by its code. */
export const AUDIT_TARGET_TYPES = [
  "user",
  "organization",
  "scan",
  "simulation_attempt",
  "protocol",
  "scenario",
  "setting",
  "session",
  "report",
] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export function auditTargetTypeKey(type: string): AuditTargetType | null {
  return (AUDIT_TARGET_TYPES as readonly string[]).includes(type) ? (type as AuditTargetType) : null;
}

/**
 * The common.roles.* key for a row's actorRole (the actor's platform role when the row was written: "admin" or
 * "user", Better Auth may store several comma-separated). Null for an empty or unknown value (shown as its code).
 */
export function auditActorRoleKey(role: string | null | undefined): "platformAdmin" | "user" | null {
  if (!role) return null;
  if (isPlatformAdminRole(role)) return "platformAdmin";
  const roles = role.split(",").map((r) => r.trim());
  return roles.length > 0 && roles.every((r) => r === "user") ? "user" : null;
}

/** The institution a row is about: the target itself, or meta.organizationId (Better Auth rows and the app's own). */
export function auditOrganizationId(row: { targetType: string; targetId: string | null; meta: unknown }): string | null {
  if (row.targetType === "organization" && row.targetId) return row.targetId;
  if (!row.meta || typeof row.meta !== "object" || Array.isArray(row.meta)) return null;
  const value = (row.meta as Record<string, unknown>).organizationId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Longest text shown for one meta value (a long list is cut; the full row stays in the database). */
export const META_VALUE_MAX = 300;

export type MetaEntry = { key: string; value: string };

/**
 * meta as key / value text for the details of an audit row. Plain text only (React escapes it; never HTML): strings
 * as they are, numbers and booleans as written, null as "null", lists joined with ", ", objects as JSON. Keys sorted;
 * at most 30 entries. Never throws on odd data.
 */
export function auditMetaEntries(meta: unknown): MetaEntry[] {
  if (meta === null || meta === undefined) return [];
  if (typeof meta !== "object" || Array.isArray(meta)) return [{ key: "value", value: metaText(meta) }];
  return Object.keys(meta as Record<string, unknown>)
    .sort()
    .slice(0, 30)
    .map((key) => ({ key: key.slice(0, 60), value: metaText((meta as Record<string, unknown>)[key]) }));
}

function metaText(value: unknown): string {
  let text: string;
  if (value === null || value === undefined) text = "null";
  else if (typeof value === "string") text = value;
  else if (typeof value === "number" || typeof value === "boolean") text = String(value);
  else if (Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number")) text = value.join(", ");
  else {
    try {
      text = JSON.stringify(value) ?? "";
    } catch {
      text = "";
    }
  }
  return text.length > META_VALUE_MAX ? `${text.slice(0, META_VALUE_MAX - 1)}…` : text;
}
