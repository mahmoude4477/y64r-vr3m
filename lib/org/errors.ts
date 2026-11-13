// Better Auth error codes of the organization endpoints -> our own texts (messages org.errors.*). Client-safe.
// The server's `message` is already translated (lib/auth.ts i18n plugin and hookError), but several codes need a
// sentence that says what to do next, in this product's words, so each known code gets its own org.* text.

export const ORG_ERROR_KEYS = [
  "generic",
  "network",
  "rateLimited",
  "sessionExpired",
  "lockBusy",
  "suspended",
  "mustChangePassword",
  "deletionBlocked",
  "lastOwner",
  "notAllowed",
  "ownerRoleOnly",
  "alreadyMember",
  "alreadyInvited",
  "invitationLimit",
  "membershipLimit",
  "invalidEmail",
  "memberNotFound",
  "departmentNotFound",
  "lastDepartment",
  "departmentInUse",
  "notInDepartment",
  "invitationNotFound",
  "notRecipient",
  "verifyEmailFirst",
  "organizationNotFound",
  "roleNotFound",
  "invalidInput",
  "departmentNameTaken",
] as const;

export type OrgErrorKey = (typeof ORG_ERROR_KEYS)[number];

const CODE_TO_KEY: Record<string, OrgErrorKey> = {
  // Waqaya codes thrown from the lib/auth.ts before hook
  ACCOUNT_LOCK_BUSY: "lockBusy",
  ORGANIZATION_SUSPENDED: "suspended",
  MUST_CHANGE_PASSWORD: "mustChangePassword",
  ACCOUNT_DELETION_BLOCKED: "deletionBlocked",
  SESSION_EXPIRED: "sessionExpired",
  // the server rules of lib/org/auth-gates.ts (wired into the lib/auth.ts before hook)
  INVALID_INPUT: "invalidInput",
  FIELD_NOT_ALLOWED: "notAllowed",
  DEPARTMENT_NAME_TAKEN: "departmentNameTaken",
  YOU_ARE_NOT_ALLOWED_TO_VIEW_THIS: "notAllowed",
  // owners
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: "lastOwner",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER: "lastOwner",
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE: "ownerRoleOnly",
  // permissions
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER: "notAllowed",
  YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: "notAllowed",
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION: "notAllowed",
  YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION: "notAllowed",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION: "notAllowed",
  YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM: "notAllowed",
  YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION: "notAllowed",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM: "notAllowed",
  YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION: "notAllowed",
  YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER: "notAllowed",
  YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER: "notAllowed",
  YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "notAllowed",
  // Better Auth answers this one also when the department is the caller's active team (crud-team.mjs remove-team)
  YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM: "departmentInUse",
  // members and invitations
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "alreadyMember",
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "alreadyInvited",
  INVITATION_LIMIT_REACHED: "invitationLimit",
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "membershipLimit",
  INVALID_EMAIL: "invalidEmail",
  MEMBER_NOT_FOUND: "memberNotFound",
  USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "memberNotFound",
  ROLE_NOT_FOUND: "roleNotFound",
  // departments (Better Auth teams)
  TEAM_NOT_FOUND: "departmentNotFound",
  INVALID_TEAM_ID: "departmentNotFound",
  UNABLE_TO_REMOVE_LAST_TEAM: "lastDepartment",
  USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "notInDepartment",
  // accepting an invitation
  INVITATION_NOT_FOUND: "invitationNotFound",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "notRecipient",
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION: "verifyEmailFirst",
  ORGANIZATION_NOT_FOUND: "organizationNotFound",
  NO_ACTIVE_ORGANIZATION: "organizationNotFound",
};

/** A Better Auth client error (`{ error }` of authClient.*), or null for a thrown network failure. */
export type OrgClientError = { status?: number; code?: string; message?: string } | null | undefined;

/** The org.errors.* key for a Better Auth error. */
export function orgErrorKey(error: OrgClientError): OrgErrorKey {
  if (!error) return "network";
  const known = error.code ? CODE_TO_KEY[error.code] : undefined;
  if (known) return known;
  // ROLE_NOT_FOUND from invite-member comes without a code, as "ROLE_NOT_FOUND: <role>" in the message.
  if (error.message?.startsWith("ROLE_NOT_FOUND")) return "roleNotFound";
  if (error.status === 429) return "rateLimited";
  if (error.status === 401) return "sessionExpired";
  if (error.status === 403) return "notAllowed";
  if (!error.status) return "network";
  return "generic";
}
