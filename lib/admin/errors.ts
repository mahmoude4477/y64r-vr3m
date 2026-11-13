// Error codes the admin panel can get back (Better Auth endpoints and the admin team's own actions) and the
// admin.errors.<key> message that explains each one. Pure, unit-tested; the actions translate on the server.

export const ADMIN_ERROR_KEYS = [
  "deletionBlocked",
  "lastPlatformAdmin",
  "roleNotAllowed",
  "lockBusy",
  "fieldNotAllowed",
  "self",
  "impersonateAdmin",
  "impersonateBanned",
  "notFound",
  "alreadyMember",
  "alreadyInvited",
  "slugTaken",
  "notMember",
  "inviteRole",
  "invalidEmail",
  "lastOwner",
  "mustChangePassword",
  "sessionExpired",
  "rateLimited",
  "confirmMismatch",
  "invalidInput",
  "generic",
] as const;

export type AdminErrorKey = (typeof ADMIN_ERROR_KEYS)[number];

/** Better Auth error code (APIError body.code) -> admin.errors key; null = no specific text (show its message). */
const CODE_KEYS: Record<string, AdminErrorKey> = {
  // Waqaya hooks (lib/auth.ts, CONVENTIONS 8 "Admin endpoints")
  ACCOUNT_DELETION_BLOCKED: "deletionBlocked",
  LAST_PLATFORM_ADMIN: "lastPlatformAdmin",
  ROLE_NOT_ALLOWED: "roleNotAllowed",
  ACCOUNT_LOCK_BUSY: "lockBusy",
  FIELD_NOT_ALLOWED: "fieldNotAllowed",
  MUST_CHANGE_PASSWORD: "mustChangePassword",
  // admin plugin
  YOU_CANNOT_BAN_YOURSELF: "self",
  YOU_CANNOT_REMOVE_YOURSELF: "self",
  YOU_CANNOT_IMPERSONATE_ADMINS: "impersonateAdmin",
  BANNED_USER: "impersonateBanned",
  USER_NOT_FOUND: "notFound",
  // organization plugin
  ORGANIZATION_NOT_FOUND: "notFound",
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "alreadyMember",
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "alreadyInvited",
  ORGANIZATION_ALREADY_EXISTS: "slugTaken",
  ORGANIZATION_SLUG_ALREADY_TAKEN: "slugTaken",
  MEMBER_NOT_FOUND: "notMember",
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE: "inviteRole",
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION: "inviteRole",
  INVALID_EMAIL: "invalidEmail",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: "lastOwner",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER: "lastOwner",
  SESSION_EXPIRED: "sessionExpired",
};

export function adminErrorKeyForCode(code: string | null | undefined): AdminErrorKey | null {
  if (!code) return null;
  return Object.hasOwn(CODE_KEYS, code) ? CODE_KEYS[code] : null;
}

/** The code and the (already translated) message of a Better Auth APIError, or nulls for anything else. */
export function apiErrorParts(error: unknown): { status: number | null; code: string | null; message: string | null } {
  if (!error || typeof error !== "object") return { status: null, code: null, message: null };
  const e = error as { statusCode?: unknown; status?: unknown; body?: unknown; message?: unknown };
  const body = e.body && typeof e.body === "object" ? (e.body as { code?: unknown; message?: unknown }) : {};
  const status = typeof e.statusCode === "number" ? e.statusCode : null;
  const code = typeof body.code === "string" ? body.code : null;
  const message =
    typeof body.message === "string" && body.message.trim() ? body.message : typeof e.message === "string" && e.message.trim() ? e.message : null;
  return { status, code, message };
}
