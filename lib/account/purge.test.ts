import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ log: [] as Array<[string, unknown]>, deletedKeys: [] as string[][] }));

vi.mock("@/lib/data-lifecycle", () => ({
  deletePhotoObjects: async (keys: string[]) => {
    calls.deletedKeys.push([...keys]);
  },
}));

vi.mock("@/lib/prisma", () => {
  const rec = (name: string, result: unknown) => async (args: unknown) => {
    calls.log.push([name, args]);
    return typeof result === "function" ? (result as (a: unknown) => unknown)(args) : result;
  };
  const tx = {
    user: { findUnique: rec("user.findUnique", { email: "Me@Example.com" }) },
    scanPhoto: {
      findMany: rec("scanPhoto.findMany", [
        { id: "p1", storageKey: "scans/org/u/1.jpg" },
        { id: "p2", storageKey: "scans/org/u/2.jpg" },
      ]),
      deleteMany: rec("scanPhoto.deleteMany", { count: 2 }),
    },
    auditLog: { updateMany: rec("auditLog.updateMany", { count: 7 }) },
    teamMember: {
      findMany: rec("teamMember.findMany", [{ teamId: "t1" }, { teamId: "t2" }, { teamId: "t1" }]),
      deleteMany: rec("teamMember.deleteMany", { count: 3 }),
      count: rec("teamMember.count", (a: unknown) => ((a as { where: { teamId: string } }).where.teamId === "t1" ? 4 : 0)),
    },
    team: { updateMany: rec("team.updateMany", { count: 1 }) },
    session: { deleteMany: rec("session.deleteMany", { count: 1 }) },
    verification: { deleteMany: rec("verification.deleteMany", { count: 2 }) },
    appRateLimit: { deleteMany: rec("appRateLimit.deleteMany", { count: 1 }) },
    invitation: {
      deleteMany: rec("invitation.deleteMany", { count: 1 }),
      // pending invitations the user sent, in three institutions they still belong to
      findMany: rec("invitation.findMany", [{ organizationId: "org-a" }, { organizationId: "org-b" }, { organizationId: "org-c" }]),
      updateMany: rec("invitation.updateMany", { count: 2 }),
    },
    member: {
      // org-a: an admin joined first, then a banned owner, then an active owner -> the active owner gets them;
      // org-b: no manager left; org-c: only a banned owner -> they get them (better than losing the invitations)
      findMany: rec("member.findMany", (a: unknown) => {
        const org = (a as { where: { organizationId: string } }).where.organizationId;
        const active = { banned: false, banExpires: null };
        const banned = { banned: true, banExpires: null };
        if (org === "org-a") {
          return [
            { userId: "admin-1", role: "admin", user: active },
            { userId: "owner-banned", role: "owner", user: banned },
            { userId: "owner-2", role: "owner", user: active },
          ];
        }
        if (org === "org-c") return [{ userId: "owner-c", role: "owner", user: banned }];
        return [];
      }),
    },
    rateLimit: { deleteMany: rec("rateLimit.deleteMany", { count: 0 }) },
  };
  return { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

const { invitationHeir, purgeUserData, userVerificationWhere } = await import("./purge");
const { emailKey } = await import("@/lib/app-rate-limit");

const argsOf = (name: string) => calls.log.filter(([n]) => n === name).map(([, a]) => a);

describe("purgeUserData", () => {
  it("removes what no FK covers, de-identifies the audit trail and recounts departments", async () => {
    calls.log = [];
    calls.deletedKeys = [];
    const r = await purgeUserData("u-1");
    expect(r).toEqual({ photos: 2, auditRows: 7, teams: 2, invitationsMoved: 4 });

    // Only unattached uploads, then their bucket objects after the commit.
    expect(argsOf("scanPhoto.findMany")[0]).toMatchObject({ where: { uploadedById: "u-1", scanId: null } });
    expect(argsOf("scanPhoto.deleteMany")[0]).toEqual({ where: { id: { in: ["p1", "p2"] } } });
    expect(calls.deletedKeys).toEqual([["scans/org/u/1.jpg", "scans/org/u/2.jpg"]]);

    // Audit rows stay, without name and IP, marked as a deleted actor.
    expect(argsOf("auditLog.updateMany")[0]).toEqual({ where: { actorId: "u-1" }, data: { actorName: null, ip: null, actorDeleted: true } });

    // team.memberCount recounted once per department (F4).
    expect(argsOf("team.updateMany")).toEqual([
      { where: { id: "t1" }, data: { memberCount: 4 } },
      { where: { id: "t2" }, data: { memberCount: 0 } },
    ]);

    // Pending invitations the user sent stay with the institution, under another owner (else admin), in the
    // institutions the user still belongs to only (after leaving, get-invitation already refused them).
    expect(argsOf("invitation.findMany")[0]).toMatchObject({
      where: { inviterId: "u-1", status: "pending", organization: { members: { some: { userId: "u-1" } } } },
    });
    expect(argsOf("member.findMany")[0]).toMatchObject({
      where: { organizationId: "org-a", userId: { not: "u-1" } },
      select: { user: { select: { banned: true, banExpires: true } } },
    });
    expect(argsOf("invitation.updateMany")).toEqual([
      { where: { inviterId: "u-1", organizationId: "org-a", status: "pending" }, data: { inviterId: "owner-2" } },
      { where: { inviterId: "u-1", organizationId: "org-c", status: "pending" }, data: { inviterId: "owner-c" } },
    ]); // org-b has no manager left: its invitations go with the user (FK cascade)

    expect(argsOf("session.deleteMany")[0]).toEqual({ where: { impersonatedBy: "u-1" } });
    expect(argsOf("invitation.deleteMany")[0]).toEqual({ where: { email: { equals: "me@example.com", mode: "insensitive" } } });
    expect(argsOf("verification.deleteMany")[0]).toEqual({ where: userVerificationWhere("u-1", "me@example.com") });
    expect(argsOf("appRateLimit.deleteMany")[0]).toEqual({
      where: { OR: [{ key: { endsWith: ":u-1" } }, { key: emailKey("email-send", "me@example.com") }] },
    });
    expect(argsOf("rateLimit.deleteMany")[0]).toEqual({ where: { key: emailKey("email-send", "me@example.com") } });
  });

  it("invitationHeir: the oldest owner, else the oldest admin, not banned unless nobody else is left", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    const m = (userId: string, role: string, banned = false, banExpires: Date | null = null) => ({ userId, role, user: { banned, banExpires } });
    expect(invitationHeir([m("a1", "admin"), m("o1", "owner")], now)?.userId).toBe("o1");
    expect(invitationHeir([m("o1", "owner", true), m("o2", "owner"), m("a1", "admin")], now)?.userId).toBe("o2");
    expect(invitationHeir([m("o1", "owner", true), m("a1", "admin")], now)?.userId).toBe("a1"); // an active admin first
    expect(invitationHeir([m("o1", "owner", true, new Date("2026-10-01T00:00:00Z"))], now)?.userId).toBe("o1"); // ban over
    expect(invitationHeir([m("o1", "owner", true), m("a1", "admin", true)], now)?.userId).toBe("o1"); // all banned
    expect(invitationHeir([m("x", "admin,owner")], now)?.userId).toBe("x");
    expect(invitationHeir([m("e", "examiner")], now)).toBeNull();
    expect(invitationHeir([], now)).toBeNull();
  });

  it("verification rows: Better Auth's e-mail codes for the address and our account-delete code", () => {
    expect(userVerificationWhere("u-1", "Me@Example.com")).toEqual({
      OR: [{ value: "u-1" }, { identifier: { contains: "u-1" } }, { identifier: { endsWith: "-otp-me@example.com" } }],
    });
    expect(userVerificationWhere("u-1", null)).toEqual({ OR: [{ value: "u-1" }, { identifier: { contains: "u-1" } }] });
  });
});
