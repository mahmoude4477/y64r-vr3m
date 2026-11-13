// What the /invite/[id] page shows, from the invitation row and the person looking at it. Pure and client-safe.
// Mirrors Better Auth 1.7.14 (plugins/organization/routes/crud-invites.mjs): accept-invitation needs a pending,
// unexpired invitation addressed to the signed-in e-mail; get-invitation also refuses one whose inviter has left the
// institution, and lib/auth.ts refuses every write on a suspended institution (ORGANIZATION_SUSPENDED).

export type InviteFacts = {
  status: string;
  expiresAt: Date;
  email: string;
  /** The person who sent it is still a member of the institution. */
  inviterIsMember: boolean;
  organizationSuspended: boolean;
  /** The invitation gives one of Waqaya's roles (not Better Auth's default "member", which grants no access). */
  roleKnown: boolean;
};

/** null = signed out. */
export type InviteViewer = { email: string; isMember: boolean } | null;

export type InviteState =
  | "unknown"
  | "already_member"
  | "accepted"
  | "rejected"
  | "canceled"
  | "expired"
  | "no_longer_valid"
  | "suspended"
  | "invalid_role"
  | "sign_in"
  | "wrong_account"
  | "open";

function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * A member of the institution sees "already_member" for their own invitation (any status) and for one that was
 * accepted. Someone else's pending invitation opened in a member's session (a shared ward computer) is
 * "wrong_account", so the invited person learns to switch account instead of being told that nothing is needed
 * (review round 2, R2-SPEC-1).
 */
export function inviteState(invite: InviteFacts | null, viewer: InviteViewer, now: Date = new Date()): InviteState {
  if (!invite) return "unknown";
  if (viewer?.isMember && (sameAddress(invite.email, viewer.email) || invite.status === "accepted")) return "already_member";
  switch (invite.status) {
    case "pending":
      break;
    case "accepted":
      return "accepted";
    case "rejected":
      return "rejected";
    case "canceled":
      return "canceled";
    default:
      return "unknown";
  }
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  if (!invite.inviterIsMember) return "no_longer_valid";
  if (invite.organizationSuspended) return "suspended";
  if (!invite.roleKnown) return "invalid_role";
  if (!viewer) return "sign_in";
  if (!sameAddress(invite.email, viewer.email)) return "wrong_account";
  return "open";
}

/** States that show which institution and role the invitation is for. */
export function showsInvitationDetails(state: InviteState): boolean {
  return state === "open" || state === "sign_in" || state === "wrong_account";
}

/** Whole days until `expiresAt`, at least 1 while it has not expired, 0 after. */
export function daysLeft(expiresAt: Date, now: Date = new Date()): number {
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 86_400_000));
}
