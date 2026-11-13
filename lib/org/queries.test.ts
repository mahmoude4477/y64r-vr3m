import { describe, expect, it, vi } from "vitest";

// The org reads with a fake Prisma client: what each query is scoped to and how rows are shaped for the pages.
const db = vi.hoisted(() => ({
  calls: [] as Array<{ model: string; op: string; args: unknown }>,
  organization: null as unknown,
  members: [] as unknown[],
  teams: [] as unknown[],
  invitations: [] as unknown[],
  invitation: null as unknown,
  memberLookup: new Map<string, unknown>(),
  teamCount: 0,
  invitationCount: 0,
}));

vi.mock("@/lib/prisma", () => {
  const record = (model: string, op: string, result: (args: never) => unknown) => async (args: never) => {
    db.calls.push({ model, op, args });
    return result(args);
  };
  return {
    prisma: {
      organization: { findUnique: record("organization", "findUnique", () => db.organization) },
      member: {
        findMany: record("member", "findMany", () => db.members),
        findFirst: record("member", "findFirst", (args: { where: { userId: string } }) => db.memberLookup.get(args.where.userId) ?? null),
      },
      team: {
        count: record("team", "count", () => db.teamCount),
        findMany: record("team", "findMany", () => db.teams),
      },
      invitation: {
        count: record("invitation", "count", () => db.invitationCount),
        findMany: record("invitation", "findMany", () => db.invitations),
        findUnique: record("invitation", "findUnique", () => db.invitation),
      },
    },
  };
});

const { departmentsOf, getInvitationForPage, getOrgSummary, listMembers, listPendingInvitations } = await import("./queries");

function reset() {
  db.calls = [];
  db.organization = null;
  db.members = [];
  db.teams = [];
  db.invitations = [];
  db.invitation = null;
  db.memberLookup = new Map();
  db.teamCount = 0;
  db.invitationCount = 0;
}

const where = (model: string, op: string) =>
  (db.calls.find((c) => c.model === model && c.op === op)?.args as { where?: Record<string, unknown> } | undefined)?.where;

describe("departmentsOf", () => {
  const teams = new Map([
    ["t1", { id: "t1", name: "الطوارئ" }],
    ["t2", { id: "t2", name: "المختبر" }],
  ]);

  it("reads Better Auth's comma list and drops deleted departments", () => {
    expect(departmentsOf("t1", teams)).toEqual([{ id: "t1", name: "الطوارئ" }]);
    expect(departmentsOf("t2, t1,gone", teams).map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(departmentsOf(null, teams)).toEqual([]);
    expect(departmentsOf("", teams)).toEqual([]);
  });
});

describe("getOrgSummary", () => {
  it("counts members by role, departments and the invitations still waiting, of that institution only", async () => {
    reset();
    const now = new Date("2026-10-29T12:00:00Z");
    const later = new Date("2026-11-05T12:00:00Z");
    db.organization = { id: "o1", name: "مستشفى", nameEn: "Hospital", type: "hospital", createdAt: now };
    db.members = [
      { role: "owner", userId: "u-owner" },
      { role: "examiner,admin", userId: "u-admin" },
      { role: "trainee", userId: "u-t" },
      { role: "member", userId: "u-m" },
    ];
    db.teamCount = 2;
    // The same rule as the members page list: only the live one counts (lib/org/invitation-status.ts).
    db.invitations = [
      { role: "examiner", expiresAt: later, inviterId: "u-owner" }, // live
      { role: "trainee", expiresAt: now, inviterId: "u-owner" }, // expired
      { role: "trainee", expiresAt: later, inviterId: "u-gone" }, // the sender left
      { role: "member", expiresAt: later, inviterId: "u-admin" }, // no Waqaya role
    ];
    const summary = await getOrgSummary("o1", now);
    expect(summary).toMatchObject({ memberCount: 4, departmentCount: 2, pendingInvitationCount: 1, noRoleCount: 1 });
    expect(summary?.roleCounts).toEqual({ owner: 1, admin: 1, examiner: 0, trainee: 1 });
    expect(where("member", "findMany")).toEqual({ organizationId: "o1" });
    expect(where("team", "count")).toEqual({ organizationId: "o1" });
    expect(where("invitation", "findMany")).toEqual({ organizationId: "o1", status: "pending" });
  });

  it("clips names stored around the forms", async () => {
    reset();
    db.organization = { id: "o1", name: "م".repeat(5000), nameEn: "H".repeat(200_000), type: "bogus", createdAt: new Date() };
    const summary = await getOrgSummary("o1");
    expect(summary?.name).toHaveLength(120);
    expect(summary?.nameEn).toHaveLength(120);
    expect(summary?.nameEn?.endsWith("…")).toBe(true);
  });

  it("is null for an institution that does not exist", async () => {
    reset();
    expect(await getOrgSummary("missing")).toBeNull();
  });
});

describe("listMembers", () => {
  it("returns each member's departments in this institution only", async () => {
    reset();
    db.members = [
      {
        id: "m1",
        role: "admin",
        createdAt: new Date("2026-10-01T00:00:00Z"),
        userId: "u1",
        user: { name: "هدى", email: "huda@example.com", teammembers: [{ team: { id: "t1", name: "الطوارئ" } }] },
      },
    ];
    const rows = await listMembers("o1");
    expect(rows).toEqual([
      {
        id: "m1",
        userId: "u1",
        name: "هدى",
        email: "huda@example.com",
        role: "admin",
        joinedAt: new Date("2026-10-01T00:00:00Z"),
        departments: [{ id: "t1", name: "الطوارئ" }],
      },
    ]);
    const args = db.calls.find((c) => c.model === "member" && c.op === "findMany")?.args as {
      where: unknown;
      select: { user: { select: { teammembers: { where: unknown } } } };
    };
    expect(args.where).toEqual({ organizationId: "o1" });
    expect(args.select.user.select.teammembers.where).toEqual({ team: { organizationId: "o1" } });
  });
});

describe("listPendingInvitations", () => {
  it("tells which invitations are still waiting and why the others are not", async () => {
    reset();
    const now = new Date("2026-10-29T12:00:00Z");
    db.invitations = [
      {
        id: "i1",
        email: "a@example.com",
        role: "examiner",
        teamId: "t1",
        createdAt: now,
        expiresAt: new Date("2026-11-05T12:00:00Z"),
        inviterId: "u1",
        user: { name: "Owner" },
      },
      {
        id: "i2",
        email: "b@example.com",
        role: "trainee",
        teamId: null,
        createdAt: now,
        expiresAt: new Date("2026-10-28T12:00:00Z"),
        inviterId: "gone",
        user: { name: "" },
      },
      {
        id: "i3",
        email: "c@example.com",
        role: "member",
        teamId: null,
        createdAt: now,
        expiresAt: new Date("2026-11-05T12:00:00Z"),
        inviterId: "u1",
        user: { name: "Owner" },
      },
    ];
    db.teams = [{ id: "t1", name: "الطوارئ" }];
    db.members = [{ userId: "u1" }];
    const rows = await listPendingInvitations("o1", now);
    expect(rows.map((r) => [r.id, r.health, r.role, r.inviterName, r.departments.length])).toEqual([
      ["i1", "live", "examiner", "Owner", 1],
      ["i2", "expired", "trainee", null, 0],
      ["i3", "invalid_role", null, "Owner", 0],
    ]);
    expect(where("invitation", "findMany")).toEqual({ organizationId: "o1", status: "pending" });
  });
});

describe("getInvitationForPage", () => {
  const invitation = {
    id: "inv1",
    email: "huda@example.com",
    role: "examiner",
    status: "pending",
    expiresAt: new Date("2026-11-05T12:00:00Z"),
    teamId: "t1",
    inviterId: "u-owner",
    user: { name: "Owner" },
    organization: { id: "o1", name: "مستشفى", nameEn: null, type: null, suspended: null },
  };

  it("rejects ids that cannot be ours without a query", async () => {
    reset();
    expect(await getInvitationForPage("", null)).toBeNull();
    expect(await getInvitationForPage("x".repeat(129), null)).toBeNull();
    expect(db.calls).toHaveLength(0);
  });

  it("is null for an unknown invitation", async () => {
    reset();
    expect(await getInvitationForPage("nope", "u1")).toBeNull();
  });

  it("tells whether the sender and the viewer are members, and reads the departments of that institution", async () => {
    reset();
    db.invitation = invitation;
    db.memberLookup.set("u-owner", { id: "m-owner" });
    db.teams = [{ id: "t1", name: "الطوارئ" }];
    const page = await getInvitationForPage("inv1", "u-viewer");
    expect(page).toMatchObject({
      id: "inv1",
      role: "examiner",
      inviterName: "Owner",
      inviterIsMember: true,
      viewerIsMember: false,
      departments: [{ id: "t1", name: "الطوارئ" }],
      organization: { id: "o1", suspended: false },
    });
    expect(where("team", "findMany")).toEqual({ organizationId: "o1" });
  });

  it("a signed-out viewer is never looked up", async () => {
    reset();
    db.invitation = { ...invitation, teamId: null };
    const page = await getInvitationForPage("inv1", null);
    expect(page?.viewerIsMember).toBe(false);
    expect(page?.inviterIsMember).toBe(false);
    expect(db.calls.filter((c) => c.model === "member")).toHaveLength(1); // the inviter only
    expect(db.calls.filter((c) => c.model === "team")).toHaveLength(0);
  });
});
