import { describe, expect, it } from "vitest";
import { daysLeft, type InviteFacts, inviteState, showsInvitationDetails } from "./invite-state";

const now = new Date("2026-10-29T12:00:00Z");
const pending: InviteFacts = {
  status: "pending",
  expiresAt: new Date("2026-11-05T12:00:00Z"),
  email: "Huda@Example.com",
  inviterIsMember: true,
  organizationSuspended: false,
  roleKnown: true,
};
const viewer = { email: "huda@example.com", isMember: false };

describe("inviteState", () => {
  it("opens for the invited address (case-insensitive)", () => {
    expect(inviteState(pending, viewer, now)).toBe("open");
  });

  it("unknown invitations and unknown statuses", () => {
    expect(inviteState(null, viewer, now)).toBe("unknown");
    expect(inviteState({ ...pending, status: "weird" }, viewer, now)).toBe("unknown");
  });

  it("members of the institution see that they are in already, for their own invitation whatever the row says", () => {
    const member = { ...viewer, isMember: true };
    expect(inviteState(pending, member, now)).toBe("already_member");
    expect(inviteState({ ...pending, status: "accepted" }, member, now)).toBe("already_member");
    expect(inviteState({ ...pending, status: "canceled" }, member, now)).toBe("already_member");
    expect(inviteState({ ...pending, expiresAt: now }, member, now)).toBe("already_member");
  });

  it("a member who opens someone else's invitation is told it is for another account (R2-SPEC-1)", () => {
    const staff = { email: "manager@example.com", isMember: true };
    expect(inviteState(pending, staff, now)).toBe("wrong_account");
    // An accepted one says "you are in already" either way; closed ones keep their own state.
    expect(inviteState({ ...pending, status: "accepted" }, staff, now)).toBe("already_member");
    expect(inviteState({ ...pending, status: "canceled" }, staff, now)).toBe("canceled");
    expect(inviteState({ ...pending, expiresAt: now }, staff, now)).toBe("expired");
  });

  it("answered invitations", () => {
    expect(inviteState({ ...pending, status: "accepted" }, viewer, now)).toBe("accepted");
    expect(inviteState({ ...pending, status: "rejected" }, viewer, now)).toBe("rejected");
    expect(inviteState({ ...pending, status: "canceled" }, viewer, now)).toBe("canceled");
  });

  it("expired at the exact expiry time", () => {
    expect(inviteState({ ...pending, expiresAt: now }, viewer, now)).toBe("expired");
  });

  it("the inviter left, or the institution is suspended", () => {
    expect(inviteState({ ...pending, inviterIsMember: false }, viewer, now)).toBe("no_longer_valid");
    expect(inviteState({ ...pending, organizationSuspended: true }, viewer, now)).toBe("suspended");
  });

  it("an invitation with no Waqaya role cannot be accepted (it would give no access)", () => {
    expect(inviteState({ ...pending, roleKnown: false }, viewer, now)).toBe("invalid_role");
    expect(inviteState({ ...pending, roleKnown: false }, null, now)).toBe("invalid_role");
    expect(showsInvitationDetails("invalid_role")).toBe(false);
  });

  it("guests are asked to sign in, other accounts to switch", () => {
    expect(inviteState(pending, null, now)).toBe("sign_in");
    expect(inviteState(pending, { email: "someone@example.com", isMember: false }, now)).toBe("wrong_account");
  });

  it("only actionable states show the institution and role", () => {
    expect(showsInvitationDetails("open")).toBe(true);
    expect(showsInvitationDetails("wrong_account")).toBe(true);
    expect(showsInvitationDetails("sign_in")).toBe(true);
    expect(showsInvitationDetails("expired")).toBe(false);
    expect(showsInvitationDetails("unknown")).toBe(false);
  });
});

describe("daysLeft", () => {
  it("rounds up, at least one day while valid", () => {
    expect(daysLeft(new Date("2026-11-05T12:00:00Z"), now)).toBe(7);
    expect(daysLeft(new Date("2026-10-29T13:00:00Z"), now)).toBe(1);
    expect(daysLeft(now, now)).toBe(0);
    expect(daysLeft(new Date("2026-10-01T00:00:00Z"), now)).toBe(0);
  });
});
