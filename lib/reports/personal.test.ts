import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/reports/personal.ts with Prisma mocked: the where-clauses it builds and how it turns grouped rows into results.
const db = vi.hoisted(() => ({
  calls: [] as Array<{ model: string; args: unknown }>,
  aggregate: {} as unknown,
  riskGroups: [] as unknown[],
  inProgress: 0,
  latest: null as unknown,
  stepGroups: [] as unknown[],
  steps: [] as Array<{ id: string; protocolId: string }>,
  scenarios: [] as unknown[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    simulationAttempt: {
      aggregate: async (args: unknown) => (db.calls.push({ model: "aggregate", args }), db.aggregate),
      groupBy: async (args: unknown) => (db.calls.push({ model: "attemptGroupBy", args }), db.riskGroups),
      count: async (args: unknown) => (db.calls.push({ model: "count", args }), db.inProgress),
      findFirst: async (args: unknown) => (db.calls.push({ model: "findFirst", args }), db.latest),
    },
    simulationStepResult: {
      groupBy: async (args: unknown) => (db.calls.push({ model: "stepGroupBy", args }), db.stepGroups),
    },
    protocolStep: {
      findMany: async (args: { where: { id: { in: string[] } } }) => db.steps.filter((s) => args.where.id.in.includes(s.id)),
    },
    protocol: { findMany: async () => [] },
    scenario: { findMany: async () => db.scenarios },
  },
}));

const { attemptSummary, ownAttempts, traineeAttempts, weakSteps } = await import("./personal");

const trainee = { userId: "u-1", organizationId: null, orgRole: null, isPlatformAdmin: false };
const examiner = { userId: "staff-1", organizationId: "org-1", orgRole: "examiner" as const, isPlatformAdmin: false };

beforeEach(() => {
  db.calls = [];
  db.aggregate = { _count: { _all: 0, score: 0 }, _sum: { score: null }, _max: { score: null } };
  db.riskGroups = [];
  db.inProgress = 0;
  db.latest = null;
  db.stepGroups = [];
  db.steps = [];
  db.scenarios = [];
});

describe("subjects", () => {
  it("my results are every attempt of the signed-in user (attemptsOwn)", () => {
    expect(ownAttempts(trainee).where).toEqual({ userId: "u-1" });
  });

  it("a trainee's results for staff are that person's attempts in the active institution only", () => {
    const subject = traineeAttempts({ scope: examiner, organizationId: "org-1" }, "u-9");
    expect(subject.where).toEqual({
      AND: [{ OR: [{ organizationId: "org-1" }, { userId: "staff-1" }] }, { organizationId: "org-1", userId: "u-9" }],
    });
  });
});

describe("attemptSummary", () => {
  it("averages scored attempts only and counts not-assessable results apart", async () => {
    db.aggregate = { _count: { _all: 4, score: 3 }, _sum: { score: 200 }, _max: { score: 90 } };
    db.riskGroups = [
      { riskLevel: "low", _count: { _all: 1 } },
      { riskLevel: "medium", _count: { _all: 2 } },
      { riskLevel: null, _count: { _all: 1 } },
    ];
    db.inProgress = 2;
    const s = await attemptSummary(ownAttempts(trainee));
    expect(s).toMatchObject({ completed: 4, inProgress: 2, average: 67, best: 90, risk: { low: 1, medium: 2, high: 0, notAssessable: 1 } });
    expect(s.latest).toBeNull();
    // Completed attempts of the subject only.
    const aggregate = db.calls.find((c) => c.model === "aggregate")?.args as { where: unknown };
    expect(aggregate.where).toEqual({ AND: [{ userId: "u-1" }, { status: "completed" }] });
  });

  it("has no average without a scored attempt", async () => {
    db.aggregate = { _count: { _all: 1, score: 0 }, _sum: { score: null }, _max: { score: null } };
    const s = await attemptSummary(ownAttempts(trainee));
    expect(s.average).toBeNull();
    expect(s.best).toBeNull();
  });
});

describe("weakSteps", () => {
  const step = (id: string, protocolId: string) => ({
    id,
    textAr: id,
    textEn: id,
    rationaleAr: "",
    rationaleEn: "",
    weight: 1,
    isMandatory: true,
    isCritical: false,
    protocolId,
    protocol: { titleAr: protocolId, titleEn: protocolId, icon: "syringe" },
  });

  it("orders by misses, then miss rate; drops steps never missed; marks critical misses; links a scenario", async () => {
    db.stepGroups = [
      { stepId: "a", compliant: false, critical: false, _count: { _all: 2 } },
      { stepId: "a", compliant: true, critical: false, _count: { _all: 2 } },
      { stepId: "b", compliant: false, critical: true, _count: { _all: 1 } },
      { stepId: "b", compliant: false, critical: false, _count: { _all: 1 } },
      { stepId: "c", compliant: true, critical: false, _count: { _all: 5 } },
      { stepId: "d", compliant: false, critical: false, _count: { _all: 1 } },
      { stepId: "d", compliant: true, critical: false, _count: { _all: 3 } },
    ];
    db.steps = [step("a", "p1"), step("b", "p2"), step("c", "p1"), step("d", "p1")];
    db.scenarios = [
      { id: "sc1", slug: "sink", protocolId: "p1", organizationId: null, titleAr: "", titleEn: "", difficulty: "beginner", estimatedMinutes: 5 },
    ];
    const rows = await weakSteps(ownAttempts(trainee));
    // b: 2 of 2 missed (100 %) ties a: 2 of 4 on misses and wins on rate; c was never missed.
    expect(rows.map((r) => [r.step.id, r.violated, r.assessed, r.critical, r.scenario?.slug ?? null])).toEqual([
      ["b", 2, 2, true, null],
      ["a", 2, 4, false, "sink"],
      ["d", 1, 4, false, "sink"],
    ]);
    // Only the subject's completed attempts are grouped.
    const group = db.calls.find((c) => c.model === "stepGroupBy")?.args as { where: unknown };
    expect(group.where).toEqual({ attempt: { is: { AND: [{ userId: "u-1" }, { status: "completed" }] } } });
  });

  it("returns nothing when no step was ever missed", async () => {
    db.stepGroups = [{ stepId: "a", compliant: true, critical: false, _count: { _all: 3 } }];
    expect(await weakSteps(ownAttempts(trainee))).toEqual([]);
  });
});
