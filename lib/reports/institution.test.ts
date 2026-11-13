import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/reports institution queries with Prisma mocked: raw SQL answers are picked by a marker in the query text.
type RawHandler = { match: string; rows: unknown[] };
const db = vi.hoisted(() => ({
  raw: [] as RawHandler[],
  rawTexts: [] as string[],
  teams: [] as Array<{ id: string; name: string }>,
  steps: [] as unknown[],
  scenarios: [] as unknown[],
  members: [] as unknown[],
  teamMembers: [] as unknown[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      // Flatten nested Prisma.Sql fragments into one text for matching.
      const text = strings.reduce((acc, s, i) => {
        const v = values[i - 1] as { text?: string } | undefined;
        return acc + (v && typeof v === "object" && "text" in v ? String(v.text) : "?") + s;
      });
      db.rawTexts.push(text);
      const handler = db.raw.find((h) => text.includes(h.match));
      return handler ? handler.rows : [];
    },
    team: { findMany: async () => db.teams },
    protocolStep: { findMany: async (args: { where: { id: { in: string[] } } }) => (db.steps as Array<{ id: string }>).filter((s) => args.where.id.in.includes(s.id)) },
    protocol: { findMany: async () => [] },
    scenario: { findMany: async () => db.scenarios },
    member: { findMany: async () => db.members },
    teamMember: { findMany: async () => db.teamMembers },
  },
}));

const { complianceByDepartment, institutionSummary, topGaps, resolveFilters } = await import("./institution");
const { traineeProgress } = await import("./trainees");
const { parseReportFilters } = await import("./filters");

const scope = { userId: "staff-1", organizationId: "org-1", orgRole: "examiner" as const, isPlatformAdmin: false };
const inst = { scope, organizationId: "org-1" };
const filters = parseReportFilters({}, "2026-10-29");
const row = (n: number, scored: number, sum: number, risk: Partial<Record<"low" | "medium" | "high" | "notAssessable", number>> = {}) => ({
  n,
  scored,
  sum,
  low: risk.low ?? 0,
  medium: risk.medium ?? 0,
  high: risk.high ?? 0,
  notAssessable: risk.notAssessable ?? 0,
});

beforeEach(() => {
  db.raw = [];
  db.rawTexts = [];
  db.teams = [];
  db.steps = [];
  db.scenarios = [];
  db.members = [];
  db.teamMembers = [];
});

describe("institutionSummary", () => {
  it("adds scans and attempts per result and keeps their risk apart", async () => {
    db.raw = [
      { match: `FROM "scan" s`, rows: [{ ...row(2, 2, 100, { low: 1, high: 1 }), people: 1 }] },
      { match: `FROM "simulation_attempt" a`, rows: [{ ...row(3, 2, 180, { low: 2, notAssessable: 1 }), people: 2 }] },
    ];
    const s = await institutionSummary(inst, filters);
    expect(s.scans).toMatchObject({ n: 2, average: 50, people: 1, risk: { low: 1, medium: 0, high: 1, notAssessable: 0 } });
    expect(s.simulations).toMatchObject({ n: 3, average: 90, people: 2 });
    expect(s.combined).toMatchObject({ n: 5, scored: 4, average: 70, risk: { low: 3, medium: 0, high: 1, notAssessable: 1 } });
    // Every query is scoped to the organization.
    expect(db.rawTexts).toHaveLength(2);
    expect(db.rawTexts.every((t) => t.includes(`s."organizationId" = $1`) || t.includes(`a."organizationId" = $1`))).toBe(true);
  });
});

describe("complianceByDepartment", () => {
  it("puts unknown or missing departments under 'no department', last", async () => {
    db.teams = [
      { id: "t1", name: "Emergency" },
      { id: "t2", name: "ICU" },
    ];
    db.raw = [
      {
        match: `GROUP BY s."teamId"`,
        rows: [
          { teamId: "t1", ...row(2, 2, 180) },
          { teamId: "deleted-team", ...row(1, 1, 50) },
          { teamId: null, ...row(1, 1, 70) },
        ],
      },
      { match: `GROUP BY d."teamId"`, rows: [{ teamId: "t2", ...row(2, 2, 100), people: 2 }] },
    ];
    const rows = await complianceByDepartment(inst, filters);
    expect(rows.map((r) => [r.key?.name ?? null, r.combined.n, r.combined.average])).toEqual([
      ["ICU", 2, 50],
      ["Emergency", 2, 90],
      [null, 2, 60],
    ]);
  });

  it("shows only the selected department when filtered", async () => {
    db.teams = [
      { id: "t1", name: "Emergency" },
      { id: "t2", name: "ICU" },
    ];
    db.raw = [{ match: `GROUP BY d."teamId"`, rows: [{ teamId: "t1", ...row(1, 1, 80), people: 1 }, { teamId: "t2", ...row(1, 1, 60), people: 1 }] }];
    const rows = await complianceByDepartment(inst, { ...filters, teamId: "t1" });
    expect(rows.map((r) => r.key?.id)).toEqual(["t1"]);
  });
});

describe("topGaps", () => {
  it("orders by violations and attaches the recommended scenario of each step's protocol", async () => {
    db.raw = [
      { match: `FROM "scan_step_result" r`, rows: [{ stepId: "s1", violated: 1, assessed: 4 }, { stepId: "s2", violated: 0, assessed: 3 }] },
      { match: `FROM "simulation_step_result" r`, rows: [{ stepId: "s3", violated: 5, assessed: 6, critical: 2 }, { stepId: "s1", violated: 1, assessed: 1, critical: 0 }] },
    ];
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
      protocol: { titleAr: protocolId, titleEn: protocolId, icon: "hand", slug: protocolId },
    });
    db.steps = [step("s1", "p1"), step("s3", "p2")];
    db.scenarios = [
      { id: "sc1", slug: "hand-hygiene", protocolId: "p2", organizationId: null, titleAr: "x", titleEn: "x", difficulty: "beginner", estimatedMinutes: 5 },
    ];
    const gaps = await topGaps(inst, filters);
    expect(gaps.map((g) => [g.stepId, g.violated, g.critical, g.scenario?.slug ?? null])).toEqual([
      ["s3", 5, true, "hand-hygiene"], // a critical wrong option was chosen
      ["s1", 2, false, null],
    ]);
  });
});

describe("resolveFilters", () => {
  it("drops ids that are not this organization's options", () => {
    const options = { protocols: [{ id: "p1", titleAr: "", titleEn: "" }], departments: [{ id: "t1", name: "" }] };
    expect(resolveFilters({ ...filters, protocolId: "p1", teamId: "t9" }, options)).toMatchObject({ protocolId: "p1", teamId: null });
    expect(resolveFilters({ ...filters, protocolId: "p9", teamId: "t1" }, options)).toMatchObject({ protocolId: null, teamId: "t1" });
  });
});

describe("traineeProgress", () => {
  it("lists trainees and members with attempts, by name, with latest result and weak steps", async () => {
    db.members = [
      { userId: "u-b", role: "trainee", user: { name: "Basma" } },
      { userId: "u-a", role: "trainee", user: { name: "Amal" } },
      { userId: "u-x", role: "examiner", user: { name: "Examiner without attempts" } },
      { userId: "u-e", role: "examiner", user: { name: "Examiner who trained" } },
    ];
    db.teamMembers = [{ userId: "u-a", teamId: "t1", team: { name: "ICU" } }];
    db.raw = [
      { match: "DISTINCT ON", rows: [{ userId: "u-a", id: "att-9", score: 70, riskLevel: "medium", completedAt: "2026-10-20T08:00:00.000Z" }] },
      { match: `NOT r."compliant"`, rows: [{ userId: "u-a", stepId: "s1", violated: 2 }] },
      { match: `GROUP BY a."userId"`, rows: [{ userId: "u-a", n: 2, scored: 2, sum: 150 }, { userId: "u-e", n: 1, scored: 1, sum: 90 }] },
    ];
    db.steps = [{ id: "s1", textAr: "خطوة", textEn: "Step" }];
    const { rows, info } = await traineeProgress(inst, filters, { locale: "en" });
    expect(info.total).toBe(3);
    expect(rows.map((r) => r.name)).toEqual(["Amal", "Basma", "Examiner who trained"]);
    expect(rows[0]).toMatchObject({
      departments: ["ICU"],
      attempts: 2,
      average: 75,
      latest: { id: "att-9", score: 70, riskLevel: "medium" },
      weakSteps: [{ id: "s1" }],
    });
    expect(rows[1]).toMatchObject({ attempts: 0, average: null, latest: null, weakSteps: [] });
  });

  it("keeps only members of the selected department", async () => {
    db.members = [
      { userId: "u-a", role: "trainee", user: { name: "Amal" } },
      { userId: "u-b", role: "trainee", user: { name: "Basma" } },
    ];
    db.teamMembers = [{ userId: "u-b", teamId: "t2", team: { name: "Lab" } }];
    const { rows } = await traineeProgress(inst, { ...filters, teamId: "t2" }, { locale: "ar" });
    expect(rows.map((r) => r.userId)).toEqual(["u-b"]);
  });
});
