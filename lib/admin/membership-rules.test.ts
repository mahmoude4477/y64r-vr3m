import { describe, expect, it } from "vitest";
import { changeNeedsAccountLock, defaultInviteRole, hasRole, memberChangeRefusal, ownerInPlace } from "./membership-rules";

const owner = (id: string) => ({ id, role: "owner" });
const member = (id: string, role = "trainee") => ({ id, role });

describe("platform admin member changes", () => {
  it("lets any role change that keeps an owner", () => {
    expect(memberChangeRefusal([owner("o1"), member("m1")], { kind: "role", memberId: "m1", role: "examiner" })).toBeNull();
    expect(memberChangeRefusal([owner("o1"), owner("o2")], { kind: "role", memberId: "o1", role: "admin" })).toBeNull();
    // promoting someone to owner of an institution that has none fixes it
    expect(memberChangeRefusal([member("m1"), member("m2")], { kind: "role", memberId: "m1", role: "owner" })).toBeNull();
  });

  it("refuses to demote or remove the last owner while other members remain", () => {
    expect(memberChangeRefusal([owner("o1"), member("m1")], { kind: "role", memberId: "o1", role: "admin" })).toBe("last_owner");
    expect(memberChangeRefusal([owner("o1"), member("m1")], { kind: "remove", memberId: "o1" })).toBe("last_owner");
    // a sole owner who is the only member cannot be demoted either (members without an owner)
    expect(memberChangeRefusal([owner("o1")], { kind: "role", memberId: "o1", role: "trainee" })).toBe("last_owner");
  });

  it("allows removing the only member (the institution is left empty)", () => {
    expect(memberChangeRefusal([owner("o1")], { kind: "remove", memberId: "o1" })).toBeNull();
  });

  it("never counts a second row of the same person as another owner", () => {
    const rows = [
      { id: "a1", role: "owner", userId: "admin" },
      { id: "a2", role: "owner", userId: "admin" },
      { id: "m1", role: "trainee", userId: "u1" },
    ];
    expect(memberChangeRefusal(rows, { kind: "remove", memberId: "a1" })).toBe("last_owner");
    expect(memberChangeRefusal([...rows, { id: "o2", role: "owner", userId: "u2" }], { kind: "remove", memberId: "a1" })).toBeNull();
    // the person's duplicate rows alone: removing one leaves no one else behind
    expect(memberChangeRefusal(rows.slice(0, 2), { kind: "remove", memberId: "a1" })).toBeNull();
  });

  it("reads Better Auth's comma role lists", () => {
    expect(hasRole("admin,owner", "owner")).toBe(true);
    expect(hasRole("coowner", "owner")).toBe(false);
    expect(memberChangeRefusal([{ id: "o1", role: "admin,owner" }, member("m1")], { kind: "remove", memberId: "o1" })).toBe("last_owner");
  });

  it("reports unknown members and no-op changes", () => {
    expect(memberChangeRefusal([owner("o1")], { kind: "remove", memberId: "x" })).toBe("not_found");
    expect(memberChangeRefusal([owner("o1"), member("m1", "examiner")], { kind: "role", memberId: "m1", role: "examiner" })).toBe("unchanged");
  });

  it("takes the account lock only when an owner can be lost", () => {
    expect(changeNeedsAccountLock("owner", { kind: "remove", memberId: "o1" })).toBe(true);
    expect(changeNeedsAccountLock("owner", { kind: "role", memberId: "o1", role: "admin" })).toBe(true);
    expect(changeNeedsAccountLock("owner", { kind: "role", memberId: "o1", role: "owner" })).toBe(false);
    expect(changeNeedsAccountLock("trainee", { kind: "remove", memberId: "m1" })).toBe(false);
    expect(changeNeedsAccountLock("trainee", { kind: "role", memberId: "m1", role: "owner" })).toBe(false);
  });
});

describe("invite form default role (least privilege)", () => {
  const admin = "admin-1";
  it("offers owner only while the institution still needs its first owner", () => {
    // A new institution: only the platform admin (owner from creating it), no owner invitation yet.
    const fresh = ownerInPlace({ viewerUserId: admin, members: [{ userId: admin, role: "owner" }], invitations: [] });
    expect(fresh).toBe(false);
    expect(defaultInviteRole({ viewerIsOwner: true, ownerInPlace: fresh })).toBe("owner");
  });

  it("starts with the weakest role once another owner is in place or invited", () => {
    const withOwner = ownerInPlace({
      viewerUserId: admin,
      members: [{ userId: admin, role: "owner" }, { userId: "u2", role: "admin,owner" }],
      invitations: [],
    });
    expect(withOwner).toBe(true);
    expect(defaultInviteRole({ viewerIsOwner: true, ownerInPlace: withOwner })).toBe("trainee");

    const invited = ownerInPlace({ viewerUserId: admin, members: [{ userId: admin, role: "owner" }], invitations: [{ role: "owner", usable: true }] });
    expect(invited).toBe(true);
    expect(defaultInviteRole({ viewerIsOwner: true, ownerInPlace: invited })).toBe("trainee");
  });

  it("does not count an owner invitation that can no longer be accepted, or other roles", () => {
    expect(
      ownerInPlace({
        viewerUserId: admin,
        members: [{ userId: admin, role: "owner" }, { userId: "u3", role: "examiner" }],
        invitations: [{ role: "owner", usable: false }, { role: "admin", usable: true }],
      }),
    ).toBe(false);
  });

  it("never starts with owner for an admin who may not invite one", () => {
    expect(defaultInviteRole({ viewerIsOwner: false, ownerInPlace: false })).toBe("trainee");
  });
});
