// One rule for "is this pending invitation still waiting for an answer?", shared by the overview figure
// (getOrgSummary), the members page list (listPendingInvitations) and the setup checklist. Pure and client-safe.
// Mirrors Better Auth 1.7.14 (plugins/organization/routes/crud-invites.mjs): accept-invitation refuses an expired
// invitation, get-invitation refuses one whose sender has left the institution, and a row with no Waqaya role would
// make a member without any access (lib/org/roles.ts memberRole).
import type { OrgRole } from "@/lib/permissions";

export type InvitationHealth = "live" | "expired" | "inviter_gone" | "invalid_role";

export function invitationHealth(
  invitation: { expiresAt: Date; inviterIsMember: boolean; role: OrgRole | null },
  now: Date = new Date(),
): InvitationHealth {
  if (invitation.expiresAt.getTime() <= now.getTime()) return "expired";
  if (!invitation.inviterIsMember) return "inviter_gone";
  if (invitation.role === null) return "invalid_role";
  return "live";
}

/** Waiting for the invited person (counted as "pending" on the overview). The others need a new invitation. */
export function isLiveInvitation(health: InvitationHealth): boolean {
  return health === "live";
}
