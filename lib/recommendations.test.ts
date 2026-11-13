import { describe, expect, it, vi } from "vitest";
import { protocolSchema, protocolStepSchema, protocolStepsSchema } from "./validation/protocol";

const db = vi.hoisted(() => ({
  rows: [] as unknown[],
  where: null as unknown,
  copies: [] as Array<{ id: string; sourceProtocolId: string | null }>,
  versions: [] as Array<{ id: string; versionOfId: string }>,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    protocol: {
      findMany: async (args: { where: { id?: { in: string[] }; versionOfId?: unknown } }) =>
        args.where.versionOfId !== undefined ? db.versions : db.copies.filter((p) => args.where.id?.in.includes(p.id)),
    },
    scenario: {
      findMany: async (args: { where: unknown }) => {
        db.where = args.where;
        // like Postgres: only rows whose protocolId is in the queried list
        const ids = JSON.stringify(args.where);
        return (db.rows as Array<{ protocolId: string }>).filter((r) => ids.includes(`"${r.protocolId}"`));
      },
    },
  },
}));

const { buildRecommendations, recommendationsFor, scenarioFallbackChain } = await import("./recommendations");

const scope = { userId: "u1", organizationId: "o1", orgRole: "trainee" as const, isPlatformAdmin: false };
const scenario = (id: string, protocolId: string, organizationId: string | null) => ({
  id,
  slug: id,
  protocolId,
  organizationId,
  titleAr: id,
  titleEn: id,
  difficulty: "beginner" as const,
  estimatedMinutes: 5,
});

describe("recommendations", () => {
  const steps = [
    { id: "opt", protocolId: "p2", weight: 1, isMandatory: false, isCritical: false },
    { id: "crit", protocolId: "p1", weight: 1, isMandatory: true, isCritical: true },
    { id: "sim-crit", protocolId: "p3", weight: 1, isMandatory: false, isCritical: false },
  ];

  it("orders violated steps and attaches one scenario per protocol", () => {
    const recs = buildRecommendations(steps, ["sim-crit"], new Map([["p1", { ...scenario("s1", "p1", null) }]]));
    expect(recs.map((r) => [r.step.id, r.critical, r.scenario?.id ?? null])).toEqual([
      ["crit", true, "s1"],
      ["sim-crit", true, null],
      ["opt", false, null],
    ]);
  });

  it("queries only readable scenarios and prefers the organization's own", async () => {
    db.rows = [scenario("global-p1", "p1", null), scenario("own-p1", "p1", "o1"), scenario("global-p2", "p2", null)];
    const recs = await recommendationsFor(scope, steps);
    expect(Object.fromEntries(recs.map((r) => [r.step.id, r.scenario?.id ?? null]))).toEqual({
      crit: "own-p1",
      opt: "global-p2",
      "sim-crit": null,
    });
    expect(JSON.stringify(db.where)).toContain('"isPublished":true'); // scenariosReadable is applied
    expect(await recommendationsFor(scope, [])).toEqual([]);
  });

  it("a custom protocol without its own scenario gets its source protocol's scenario", async () => {
    // custom-1 is o1's copy of global p1 (no own scenario); custom-2 is a copy of p2 that has its own scenario
    db.copies = [
      { id: "custom-1", sourceProtocolId: "p1" },
      { id: "custom-2", sourceProtocolId: "p2" },
    ];
    db.rows = [scenario("global-p1", "p1", null), scenario("global-p2", "p2", null), scenario("own-custom-2", "custom-2", "o1")];
    const custom = [
      { id: "c1-step", protocolId: "custom-1", weight: 1, isMandatory: true, isCritical: false },
      { id: "c2-step", protocolId: "custom-2", weight: 1, isMandatory: true, isCritical: false },
      { id: "p3-step", protocolId: "p3", weight: 1, isMandatory: true, isCritical: false },
    ];
    const recs = await recommendationsFor(scope, custom);
    expect(Object.fromEntries(recs.map((r) => [r.step.id, r.scenario?.id ?? null]))).toEqual({
      "c1-step": "global-p1",
      "c2-step": "own-custom-2",
      "p3-step": null,
    });
    expect(JSON.stringify(db.where)).toContain('"p1"'); // the source protocol is queried too
    db.copies = [];
  });
});

describe("scenarioFallbackChain", () => {
  const links = (sourceOf: Record<string, string>, versionOf: Record<string, string>) => {
    const versionsOf = new Map<string, string[]>();
    for (const [v, of] of Object.entries(versionOf)) versionsOf.set(of, [...(versionsOf.get(of) ?? []), v]);
    return { sourceOf: new Map(Object.entries(sourceOf)), versionOf: new Map(Object.entries(versionOf)), versionsOf };
  };
  it("a new version falls back to the versions it replaced, newest first", () => {
    expect(scenarioFallbackChain("v3", links({}, { v2: "v1", v3: "v2" }))).toEqual(["v3", "v2", "v1"]);
  });
  it("a copy falls back to its source, then the source's newer versions (newest first), then its older ones", () => {
    const l = links({ c: "v2" }, { v2: "v1", v3: "v2", v4: "v3" });
    expect(scenarioFallbackChain("c", l)).toEqual(["c", "v2", "v4", "v3", "v1"]);
  });
  it("never loops on a bad cycle", () => {
    expect(scenarioFallbackChain("a", links({}, { a: "b", b: "a" }))).toEqual(["a", "b"]);
  });
});

describe("recommendedScenarios with versions", () => {
  it("a step of a new version gets the scenario of the version it replaced", async () => {
    db.copies = [];
    db.versions = [{ id: "p2", versionOfId: "p1" }];
    db.rows = [scenario("s-old", "p1", null)];
    const recs = await recommendationsFor(scope, [{ id: "st1", protocolId: "p2", isMandatory: true, isCritical: false, weight: 1 }]);
    expect(recs[0]?.scenario?.id).toBe("s-old");
    db.versions = [];
  });
});

describe("protocol validation (shared by the seed and both protocol editors)", () => {
  const step = {
    key: "no-recap",
    textAr: "أ",
    textEn: "A",
    rationaleAr: "ب",
    rationaleEn: "B",
    criteriaAr: null,
    criteriaEn: null,
    referenceLabel: null,
    referenceUrl: "https://www.who.int/x",
    isMandatory: true,
    isCritical: true,
    weight: 3,
    visualCheck: false,
  };
  const i18nKeys = (r: { success: boolean; error?: { issues: Array<{ code: string; params?: Record<string, unknown> }> } }) =>
    (r.error?.issues ?? []).map((i) => (i.code === "custom" ? i.params?.i18n : i.code));

  it("accepts a valid step and enforces weight, key format and https references", () => {
    expect(protocolStepSchema.safeParse(step).success).toBe(true);
    expect(protocolStepSchema.safeParse({ ...step, weight: 4 }).success).toBe(false);
    expect(protocolStepSchema.safeParse({ ...step, weight: 0 }).success).toBe(false);
    expect(i18nKeys(protocolStepSchema.safeParse({ ...step, key: "No Recap" }))).toEqual(["slug"]);
    expect(protocolStepSchema.safeParse({ ...step, referenceUrl: "http://example.com" }).success).toBe(false);
  });

  it("visual steps need criteria in both languages", () => {
    const r = protocolStepSchema.safeParse({ ...step, visualCheck: true, criteriaEn: "Lid closed" });
    expect(i18nKeys(r)).toEqual(["visualCriteriaRequired"]);
    expect(protocolStepSchema.safeParse({ ...step, visualCheck: true, criteriaEn: "x", criteriaAr: "س" }).success).toBe(true);
  });

  it("step keys are unique and a protocol needs at least one step", () => {
    expect(i18nKeys(protocolStepsSchema.safeParse([step, step]))).toEqual(["duplicateStepKey"]);
    const protocol = {
      slug: "sharps-safety",
      category: "safety",
      titleAr: "أ",
      titleEn: "A",
      summaryAr: "أ",
      summaryEn: "A",
      descriptionAr: "أ",
      descriptionEn: "A",
      icon: "syringe",
      steps: [step],
    };
    expect(protocolSchema.safeParse(protocol).success).toBe(true);
    expect(protocolSchema.safeParse({ ...protocol, steps: [] }).success).toBe(false);
  });
});
