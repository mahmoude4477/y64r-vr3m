import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  canHandleInvitation,
  compareMembers,
  countByRole,
  isManagerRole,
  isStaffRole,
  memberRole,
  removeBlock,
  roleChangeBlock,
  rolesForPicker,
} from "./roles";

describe("role groups", () => {
  it("managers are owners and admins, staff adds examiners", () => {
    expect(["owner", "admin", "examiner", "trainee"].map((r) => isManagerRole(r as never))).toEqual([true, true, false, false]);
    expect(["owner", "admin", "examiner", "trainee"].map((r) => isStaffRole(r as never))).toEqual([true, true, true, false]);
    expect(isManagerRole(null)).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });

  it("reads Better Auth's multi-role field, strongest role first; no Waqaya role is null (no access)", () => {
    expect(memberRole("examiner,admin")).toBe("admin");
    expect(memberRole("owner")).toBe("owner");
    expect(memberRole("member,trainee")).toBe("trainee");
    // Better Auth's default, never given by our UI: lib/session.ts gives such a member no institution, so the pages
    // must not show a trainee.
    expect(memberRole("member")).toBeNull();
    expect(memberRole(null)).toBeNull();
  });

  it("pickers list the most common role first", () => {
    expect(rolesForPicker(["owner", "admin", "examiner", "trainee"])).toEqual(["trainee", "examiner", "admin", "owner"]);
    expect(rolesForPicker(["admin", "examiner", "trainee"])).toEqual(["trainee", "examiner", "admin"]);
  });
});

describe("assignableRoles", () => {
  it("only owners give the owner role", () => {
    expect(assignableRoles("owner")).toEqual(["owner", "admin", "examiner", "trainee"]);
    expect(assignableRoles("admin")).toEqual(["admin", "examiner", "trainee"]);
    expect(assignableRoles("examiner")).toEqual([]);
    expect(assignableRoles("trainee")).toEqual([]);
    expect(assignableRoles(null)).toEqual([]);
  });

  it("admins cannot resend or cancel an owner invitation", () => {
    expect(canHandleInvitation("admin", "owner")).toBe(false);
    expect(canHandleInvitation("admin", "examiner")).toBe(true);
    expect(canHandleInvitation("owner", "owner")).toBe(true);
    expect(canHandleInvitation("examiner", "trainee")).toBe(false);
  });

  it("an invitation with no Waqaya role can be canceled by any manager", () => {
    expect(canHandleInvitation("admin", null)).toBe(true);
    expect(canHandleInvitation("owner", null)).toBe(true);
    expect(canHandleInvitation("examiner", null)).toBe(false);
  });
});

describe("roleChangeBlock", () => {
  const owner = { memberId: "m-owner", role: "owner" as const };
  const admin = { memberId: "m-admin", role: "admin" as const };
  const examiner = { memberId: "m-ex", role: "examiner" as const };

  it("examiners and trainees change nothing", () => {
    expect(roleChangeBlock(examiner, { id: "m-x", role: "trainee" }, 1)).toBe("not_manager");
    expect(roleChangeBlock({ memberId: "t", role: "trainee" }, { id: "m-x", role: "trainee" }, 1)).toBe("not_manager");
  });

  it("only owners change an owner's role", () => {
    expect(roleChangeBlock(admin, { id: "m-owner", role: "owner" }, 2)).toBe("owner_only");
    expect(roleChangeBlock(owner, { id: "m-owner2", role: "owner" }, 2)).toBeNull();
  });

  it("the last owner cannot step down", () => {
    expect(roleChangeBlock(owner, { id: "m-owner", role: "owner" }, 1)).toBe("last_owner");
    expect(roleChangeBlock(owner, { id: "m-owner", role: "owner" }, 2)).toBeNull();
  });

  it("managers change everyone else, themselves included, and give a role to a member without one", () => {
    expect(roleChangeBlock(admin, { id: "m-ex", role: "examiner" }, 1)).toBeNull();
    expect(roleChangeBlock(admin, { id: "m-admin", role: "admin" }, 1)).toBeNull();
    expect(roleChangeBlock(admin, { id: "m-none", role: null }, 1)).toBeNull();
  });
});

describe("removeBlock", () => {
  const owner = { memberId: "m-owner", role: "owner" as const };
  const admin = { memberId: "m-admin", role: "admin" as const };

  it("never removes yourself (leaving is separate)", () => {
    expect(removeBlock(owner, { id: "m-owner", role: "owner" }, 3)).toBe("self");
    expect(removeBlock(admin, { id: "m-admin", role: "admin" }, 1)).toBe("self");
  });

  it("only owners remove an owner, never the last one", () => {
    expect(removeBlock(admin, { id: "m-o2", role: "owner" }, 2)).toBe("owner_only");
    expect(removeBlock(owner, { id: "m-o2", role: "owner" }, 2)).toBeNull();
    expect(removeBlock(owner, { id: "m-o2", role: "owner" }, 1)).toBe("last_owner");
  });

  it("managers remove admins, examiners and trainees; others remove nobody", () => {
    expect(removeBlock(admin, { id: "m-a2", role: "admin" }, 1)).toBeNull();
    expect(removeBlock(admin, { id: "m-t", role: "trainee" }, 1)).toBeNull();
    expect(removeBlock({ memberId: "m-ex", role: "examiner" }, { id: "m-t", role: "trainee" }, 1)).toBe("not_manager");
  });
});

describe("compareMembers / countByRole", () => {
  it("sorts by role strength, then by name", () => {
    const rows = [
      { role: "trainee" as const, name: "Basma" },
      { role: "owner" as const, name: "Yasir" },
      { role: "trainee" as const, name: "amal" },
      { role: "examiner" as const, name: "Huda" },
    ];
    expect([...rows].sort(compareMembers("en")).map((r) => r.name)).toEqual(["Yasir", "Huda", "amal", "Basma"]);
    expect([{ role: null, name: "Adam" }, ...rows].sort(compareMembers("en")).at(-1)?.name).toBe("Adam"); // no role last
  });

  it("counts every role, zero included, and the rows with no Waqaya role apart", () => {
    expect(countByRole(["owner", "trainee", "trainee", null])).toEqual({
      byRole: { owner: 1, admin: 0, examiner: 0, trainee: 2 },
      noRole: 1,
    });
    expect(countByRole([])).toEqual({ byRole: { owner: 0, admin: 0, examiner: 0, trainee: 0 }, noRole: 0 });
  });
});
