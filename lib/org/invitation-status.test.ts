import { describe, expect, it } from "vitest";
import { invitationHealth, isLiveInvitation } from "./invitation-status";

const now = new Date("2026-10-29T12:00:00Z");
const live = { expiresAt: new Date("2026-11-05T12:00:00Z"), inviterIsMember: true, role: "examiner" as const };

describe("invitationHealth", () => {
  it("live while unexpired, sent by a current member, with a Waqaya role", () => {
    expect(invitationHealth(live, now)).toBe("live");
    expect(isLiveInvitation("live")).toBe(true);
  });

  it("expired first (at the exact expiry time), then a sender who left, then no role", () => {
    expect(invitationHealth({ ...live, expiresAt: now, inviterIsMember: false, role: null }, now)).toBe("expired");
    expect(invitationHealth({ ...live, inviterIsMember: false, role: null }, now)).toBe("inviter_gone");
    expect(invitationHealth({ ...live, role: null }, now)).toBe("invalid_role");
    for (const h of ["expired", "inviter_gone", "invalid_role"] as const) expect(isLiveInvitation(h)).toBe(false);
  });
});
