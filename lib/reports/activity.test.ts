import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/reports/activity.ts with Prisma mocked: every query is scoped through @/lib/authz, and the rows are shaped the
// way the dashboard expects.
const db = vi.hoisted(() => ({
  calls: [] as Array<{ model: string; args: Record<string, unknown> }>,
  scanGroups: [] as unknown[],
  scanRows: {} as Record<string, unknown[]>,
  attempts: [] as unknown[],
  unfinished: null as unknown,
  scenario: null as unknown,
  members: 0,
  invitations: 0,
  organization: null as unknown,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    scan: {
      groupBy: async (args: Record<string, unknown>) => (db.calls.push({ model: "scan.groupBy", args }), db.scanGroups),
      findMany: async (args: Record<string, unknown>) => {
        db.calls.push({ model: "scan.findMany", args });
        return db.scanRows[JSON.stringify((args.where as { AND: unknown[] }).AND[1])] ?? [];
      },
    },
    simulationAttempt: {
      findMany: async (args: Record<string, unknown>) => (db.calls.push({ model: "attempt.findMany", args }), db.attempts),
      findFirst: async (args: Record<string, unknown>) => (db.calls.push({ model: "attempt.findFirst", args }), db.unfinished),
    },
    scenario: {
      findFirst: async (args: Record<string, unknown>) => (db.calls.push({ model: "scenario.findFirst", args }), db.scenario),
    },
    member: { count: async (args: Record<string, unknown>) => (db.calls.push({ model: "member.count", args }), db.members) },
    invitation: { count: async (args: Record<string, unknown>) => (db.calls.push({ model: "invitation.count", args }), db.invitations) },
    organization: {
      findFirst: async (args: Record<string, unknown>) => (db.calls.push({ model: "organization.findFirst", args }), db.organization),
    },
  },
}));

const activity = await import("./activity");
const { ownAttempts } = await import("./personal");

const examiner = { userId: "staff-1", organizationId: "org-1", orgRole: "examiner" as const, isPlatformAdmin: false };
const inst = { scope: examiner, organizationId: "org-1" };
const trainee = { userId: "u-1", organizationId: "org-1", orgRole: "trainee" as const, isPlatformAdmin: false };
const individual = { userId: "u-2", organizationId: null, orgRole: null, isPlatformAdmin: false };

const scan = (id: string, status: string) => ({
  id,
  areaLabel: `Area ${id}`,
  status,
  updatedAt: new Date("2026-10-20T10:00:00Z"),
  examinerId: "staff-1",
  examiner: { name: "Examiner" },
  protocol: { titleAr: "ب", titleEn: "P", icon: "hand" },
});

const calls = (model: string) => db.calls.filter((c) => c.model === model);

beforeEach(() => {
  db.calls = [];
  db.scanGroups = [];
  db.scanRows = {};
  db.attempts = [];
  db.unfinished = null;
  db.scenario = null;
  db.members = 0;
  db.invitations = 0;
  db.organization = null;
});

describe("openScans", () => {
  it("counts every open status of the active institution and lists actionable scans first", async () => {
    db.scanGroups = [
      { status: "review", _count: { _all: 3 } },
      { status: "draft", _count: { _all: 2 } },
      { status: "failed", _count: { _all: 1 } },
    ];
    db.scanRows = {
      [JSON.stringify({ status: { in: ["review", "failed"] } })]: [scan("r1", "review"), scan("f1", "failed")],
      [JSON.stringify({ status: { in: ["draft", "analyzing"] } })]: [scan("d1", "draft"), scan("d2", "draft")],
    };
    const { counts, rows } = await activity.openScans(inst, 3);
    expect(counts).toEqual({ review: 3, failed: 1, draft: 2, analyzing: 0, total: 6 });
    expect(rows.map((r) => r.id)).toEqual(["r1", "f1", "d1"]);
    // Every query starts from scansReadable: staff of the active organization.
    for (const c of [...calls("scan.groupBy"), ...calls("scan.findMany")]) {
      expect((c.args.where as { AND: unknown[] }).AND[0]).toEqual({ organizationId: "org-1" });
    }
    expect((calls("scan.groupBy")[0].args.where as { AND: unknown[] }).AND[1]).toEqual({
      status: { in: ["review", "failed", "draft", "analyzing"] },
    });
  });

  it("is empty with zero counts when nothing is open", async () => {
    const { counts, rows } = await activity.openScans(inst);
    expect(counts.total).toBe(0);
    expect(rows).toEqual([]);
  });

  it("a demoted examiner (now a trainee) matches nothing", async () => {
    await activity.openScans({ scope: trainee, organizationId: "org-1" });
    for (const c of calls("scan.findMany")) {
      expect((c.args.where as { AND: unknown[] }).AND[0]).toEqual({ id: { in: [] } });
    }
  });
});

describe("latest results", () => {
  it("finalised scans: the institution's own, newest first", async () => {
    await activity.latestFinalizedScans(inst, 5);
    const [c] = calls("scan.findMany");
    expect(c.args.where).toEqual({ AND: [{ organizationId: "org-1" }, { status: "finalized", finalizedAt: { not: null } }] });
    expect(c.args.orderBy).toEqual([{ finalizedAt: "desc" }, { id: "asc" }]);
    expect(c.args.take).toBe(5);
  });

  it("completed attempts: made in the institution, newest first", async () => {
    await activity.latestCompletedAttempts(inst, 4);
    const [c] = calls("attempt.findMany");
    expect(c.args.where).toEqual({
      AND: [
        { OR: [{ organizationId: "org-1" }, { userId: "staff-1" }] },
        { organizationId: "org-1", status: "completed", completedAt: { not: null } },
      ],
    });
    expect(c.args.take).toBe(4);
  });
});

describe("latestUnfinishedAttempt", () => {
  it("is the subject's own newest attempt in progress", async () => {
    db.unfinished = { id: "a1", startedAt: new Date(), scenario: { slug: "s", titleAr: "س", titleEn: "S" } };
    expect(await activity.latestUnfinishedAttempt(ownAttempts(individual))).toMatchObject({ id: "a1" });
    const [c] = calls("attempt.findFirst");
    expect(c.args.where).toEqual({ AND: [{ userId: "u-2" }, { status: "in_progress" }] });
    expect(c.args.orderBy).toEqual([{ startedAt: "desc" }, { id: "asc" }]);
  });
});

describe("untriedScenario", () => {
  const row = (id: string) => ({
    id,
    slug: id,
    titleAr: id,
    titleEn: id,
    difficulty: "beginner",
    estimatedMinutes: 5,
    protocol: { titleAr: "ب", titleEn: "P", icon: "hand" },
  });

  it("a playable scenario the user never completed: the institution's own first, then the easiest, then the oldest", async () => {
    db.scenario = row("own");
    expect((await activity.untriedScenario(trainee))?.slug).toBe("own");
    const [c] = calls("scenario.findFirst");
    const and = (c.args.where as { AND: unknown[] }).AND;
    expect(and[1]).toEqual({ attempts: { none: { userId: "u-1", status: "completed" } } });
    // scenariosReadable: published global ones (organizationId null) and the active institution's published ones, so
    // "nulls last" on the organization puts the institution's own first.
    expect(JSON.stringify(and[0])).toContain('"organizationId":"org-1","isPublished":true');
    expect(c.args.orderBy).toEqual([
      { organizationId: { sort: "asc", nulls: "last" } },
      { difficulty: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });

  it("is null when every playable scenario was completed", async () => {
    db.scenario = null;
    expect(await activity.untriedScenario(individual)).toBeNull();
    const and = (calls("scenario.findFirst")[0].args.where as { AND: unknown[] }).AND;
    expect(JSON.stringify(and[0])).not.toContain("org-1");
  });
});

describe("institutionHeadcount", () => {
  it("counts members and invitations still open", async () => {
    db.members = 3;
    db.invitations = 2;
    const now = new Date("2026-10-29T12:00:00Z");
    expect(await activity.institutionHeadcount(inst, now)).toEqual({ members: 3, pendingInvitations: 2 });
    expect(calls("member.count")[0].args.where).toEqual({ organizationId: "org-1" });
    expect(calls("invitation.count")[0].args.where).toEqual({ organizationId: "org-1", status: "pending", expiresAt: { gt: now } });
  });
});

describe("activeInstitutionName", () => {
  it("reads the active institution only, and nothing without one", async () => {
    db.organization = { name: "مستشفى", nameEn: "Hospital" };
    expect(await activity.activeInstitutionName(trainee)).toEqual({ name: "مستشفى", nameEn: "Hospital" });
    expect(calls("organization.findFirst")[0].args.where).toEqual({ id: "org-1" });
    expect(await activity.activeInstitutionName(individual)).toBeNull();
    expect(calls("organization.findFirst")).toHaveLength(1);
  });
});
