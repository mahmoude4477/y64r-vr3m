import { beforeEach, describe, expect, it, vi } from "vitest";

// getSettingsData: every read is scoped to the signed-in user, session rows are read without token or IP, the
// current session comes from the request itself, and only invitations the user can accept now are listed.

const db = vi.hoisted(() => ({
  calls: {} as Record<string, unknown[]>,
  credential: { updatedAt: new Date("2026-10-01T10:00:00Z") } as { updatedAt: Date } | null,
  sessions: [] as unknown[],
  sessionCount: 0,
  memberships: [] as unknown[],
  invitations: [] as unknown[],
  inviters: [] as unknown[],
}));

function record(name: string, args: unknown) {
  (db.calls[name] ??= []).push(args);
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: { findFirst: async (args: unknown) => (record("account.findFirst", args), db.credential) },
    session: {
      findMany: async (args: unknown) => (record("session.findMany", args), db.sessions),
      count: async (args: unknown) => (record("session.count", args), db.sessionCount),
    },
    member: {
      findMany: async (args: { where: { OR?: unknown } }) => {
        if (args.where.OR) {
          record("member.inviters", args);
          return db.inviters;
        }
        record("member.findMany", args);
        return db.memberships;
      },
    },
    invitation: { findMany: async (args: unknown) => (record("invitation.findMany", args), db.invitations) },
  },
}));

const { getSettingsData, OTHER_SESSIONS_SHOWN } = await import("./queries");

const now = new Date("2026-10-29T09:00:00Z");
const chrome =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function ctx(overrides: { impersonatedBy?: string | null; organizationId?: string | null } = {}) {
  return {
    session: {
      id: "s-current",
      token: "current-token",
      ipAddress: "203.0.113.9",
      createdAt: new Date("2026-10-28T08:00:00Z"),
      updatedAt: new Date("2026-10-29T07:00:00Z"),
      expiresAt: new Date("2026-11-05T08:00:00Z"),
      userAgent: chrome,
      userId: "u-1",
      impersonatedBy: overrides.impersonatedBy ?? null,
    },
    user: {
      id: "u-1",
      name: "سارة",
      email: "Sara@Example.com",
      emailVerified: true,
      profession: "",
      locale: "en",
      createdAt: new Date("2026-09-01T10:00:00Z"),
    },
    isPlatformAdmin: false,
    organizationId: overrides.organizationId === undefined ? "org-a" : overrides.organizationId,
    orgRole: "examiner",
    memberId: "m-1",
  } as unknown as Parameters<typeof getSettingsData>[0];
}

const org = (id: string, suspended: boolean | null = false) => ({ id, name: `مؤسسة ${id}`, nameEn: `Org ${id}`, type: "hospital", suspended });

beforeEach(() => {
  db.calls = {};
  db.credential = { updatedAt: new Date("2026-10-01T10:00:00Z") };
  db.sessions = [];
  db.sessionCount = 0;
  db.memberships = [];
  db.invitations = [];
  db.inviters = [];
});

describe("getSettingsData", () => {
  it("scopes every read to the user and never selects the session token or IP", async () => {
    await getSettingsData(ctx(), now);
    const [sessions] = db.calls["session.findMany"] as Array<{ where: Record<string, unknown>; select: Record<string, boolean>; take: number }>;
    expect(sessions.where).toMatchObject({ userId: "u-1", id: { not: "s-current" }, expiresAt: { gt: now } });
    expect(Object.keys(sessions.select).sort()).toEqual(["createdAt", "id", "impersonatedBy", "updatedAt", "userAgent"]);
    expect(sessions.take).toBe(OTHER_SESSIONS_SHOWN);
    expect((db.calls["session.count"] as Array<{ where: unknown }>)[0].where).toMatchObject({ userId: "u-1", id: { not: "s-current" } });
    expect((db.calls["account.findFirst"] as Array<{ where: unknown }>)[0].where).toEqual({ userId: "u-1", providerId: "credential" });
    expect((db.calls["member.findMany"] as Array<{ where: unknown }>)[0].where).toEqual({ userId: "u-1" });
    expect((db.calls["invitation.findMany"] as Array<{ where: unknown }>)[0].where).toMatchObject({
      email: { equals: "Sara@Example.com", mode: "insensitive" },
      status: "pending",
      expiresAt: { gt: now },
    });
  });

  it("builds the current session from the request and the others from the rows", async () => {
    db.sessions = [
      { id: "s-2", createdAt: new Date("2026-10-20T08:00:00Z"), updatedAt: new Date("2026-10-27T08:00:00Z"), userAgent: null, impersonatedBy: null },
    ];
    db.sessionCount = 24;
    const data = await getSettingsData(ctx(), now);
    expect(data.sessions.current).toMatchObject({ id: "s-current", current: true, browser: "Chrome", os: "Windows", lastActiveDays: 0 });
    expect(data.sessions.others).toEqual([expect.objectContaining({ id: "s-2", current: false, lastActiveDays: 2 })]);
    expect(data.sessions.hiddenCount).toBe(23);
    expect(JSON.stringify(data)).not.toContain("current-token");
    expect(JSON.stringify(data)).not.toContain("203.0.113.9");
  });

  it("reports impersonation, the profile and the password date", async () => {
    const data = await getSettingsData(ctx({ impersonatedBy: "admin-1" }), now);
    expect(data.impersonating).toBe(true);
    expect(data.sessions.current.impersonated).toBe(true);
    expect(data.profile).toEqual({
      name: "سارة",
      email: "Sara@Example.com",
      emailVerified: true,
      profession: null, // "" is shown as "not set"
      locale: "en",
      createdAt: new Date("2026-09-01T10:00:00Z"),
      isPlatformAdmin: false,
    });
    expect(data.passwordUpdatedAt).toEqual(new Date("2026-10-01T10:00:00Z"));
    db.credential = null;
    expect((await getSettingsData(ctx(), now)).passwordUpdatedAt).toBeNull();
  });

  it("marks the active institution and the suspended ones", async () => {
    db.memberships = [
      { role: "examiner", createdAt: new Date("2026-09-02T00:00:00Z"), organization: org("org-a") },
      { role: "trainee,admin", createdAt: new Date("2026-09-03T00:00:00Z"), organization: org("org-b", null) },
      { role: "owner", createdAt: new Date("2026-09-04T00:00:00Z"), organization: org("org-c", true) },
    ];
    const data = await getSettingsData(ctx(), now);
    expect(data.memberships.map((m) => [m.organizationId, m.role, m.active, m.suspended])).toEqual([
      ["org-a", "examiner", true, false],
      ["org-b", "admin", false, false],
      ["org-c", "owner", false, true],
    ]);
    const personal = await getSettingsData(ctx({ organizationId: null }), now);
    expect(personal.memberships.every((m) => !m.active)).toBe(true);
  });

  it("lists only invitations the user can accept now", async () => {
    db.memberships = [{ role: "examiner", createdAt: now, organization: org("org-a") }];
    const inv = (id: string, organization: ReturnType<typeof org>, inviterId = "inviter") => ({
      id,
      email: "sara@example.com",
      role: "trainee",
      status: "pending",
      expiresAt: new Date("2026-11-02T00:00:00Z"),
      inviterId,
      organization,
    });
    db.invitations = [
      inv("open", org("org-x")),
      inv("member-already", org("org-a")),
      inv("suspended", org("org-y", true)),
      inv("inviter-left", org("org-z"), "gone"),
    ];
    db.inviters = [
      { organizationId: "org-x", userId: "inviter" },
      { organizationId: "org-a", userId: "inviter" },
      { organizationId: "org-y", userId: "inviter" },
    ];
    const data = await getSettingsData(ctx(), now);
    expect(data.invitations).toEqual([
      { id: "open", organizationName: "مؤسسة org-x", organizationNameEn: "Org org-x", role: "trainee", expiresAt: new Date("2026-11-02T00:00:00Z") },
    ]);
    const [inviters] = db.calls["member.inviters"] as Array<{ where: { OR: unknown[] } }>;
    expect(inviters.where.OR).toHaveLength(4);
  });

  it("skips the inviter query when there is no invitation", async () => {
    await getSettingsData(ctx(), now);
    expect(db.calls["member.inviters"]).toBeUndefined();
  });
});
