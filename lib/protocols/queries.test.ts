import { describe, expect, it, vi } from "vitest";

// The where-clauses are the security boundary of the library: check what reaches Prisma.
const db = vi.hoisted(() => ({
  protocolRows: [] as unknown[],
  scenarioRows: [] as unknown[],
  /** Protocol rows with versionOfId: the version links between global protocols (lib/protocols/versions.ts). */
  versionRows: [] as Array<{ id: string; versionOfId: string }>,
  calls: [] as Array<{ model: string; method: string; args: unknown }>,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    protocol: {
      findMany: async (args: unknown) => {
        // loadGlobalVersionEdges reads the version links from the same table.
        if ((args as { where?: { versionOfId?: unknown } })?.where?.versionOfId !== undefined) {
          db.calls.push({ model: "versions", method: "findMany", args });
          return db.versionRows;
        }
        db.calls.push({ model: "protocol", method: "findMany", args });
        return db.protocolRows;
      },
      findFirst: async (args: unknown) => {
        db.calls.push({ model: "protocol", method: "findFirst", args });
        return db.protocolRows[0] ?? null;
      },
    },
    scenario: {
      findMany: async (args: unknown) => {
        db.calls.push({ model: "scenario", method: "findMany", args });
        return db.scenarioRows;
      },
    },
  },
}));

/** A version link: `to` is a new version of `from` (Protocol.versionOfId). */
const versionRow = (from: string, to: string) => ({ id: to, versionOfId: from });

const { getProtocolDetail, getProtocolLibrary, getTrainingScenarios, pickTrainingScenarios, replacedSources } = await import("./queries");

const trainee = { userId: "u1", organizationId: null, orgRole: null, isPlatformAdmin: false };
const manager = { userId: "u2", organizationId: "org1", orgRole: "admin" as const, isPlatformAdmin: false };

const row = (over: Record<string, unknown>) => ({
  id: "p1",
  slug: "p1",
  organizationId: null,
  sourceProtocolId: null,
  category: "hygiene",
  icon: "hand",
  titleAr: "عنوان",
  titleEn: "Title",
  summaryAr: "ملخص",
  summaryEn: "Summary",
  descriptionAr: "وصف",
  descriptionEn: "Description",
  steps: [],
  ...over,
});

describe("getProtocolLibrary", () => {
  it("only asks for readable AND published protocols (managers' drafts stay out)", async () => {
    db.calls = [];
    db.protocolRows = [];
    await getProtocolLibrary(manager, { category: null, q: "" }, "ar");
    const where = (db.calls[0].args as { where: { AND: unknown[] } }).where;
    expect(where.AND).toContainEqual({ isPublished: true });
    expect(JSON.stringify(where.AND[0])).toContain('"organizationId":"org1"');
  });

  it("marks the institution's own protocols and names a source only when it is in the readable set", async () => {
    db.versionRows = [];
    db.protocolRows = [
      row({ id: "g1", slug: "global", titleEn: "Global" }),
      row({ id: "g2", slug: "other-global", titleEn: "Other global" }),
      row({ id: "c1", slug: "copy", organizationId: "org1", sourceProtocolId: "g1", titleEn: "Copy" }),
      row({ id: "c2", slug: "orphan", organizationId: "org1", sourceProtocolId: "hidden", titleEn: "Orphan" }),
    ];
    const result = await getProtocolLibrary(manager, { category: null, q: "" }, "en");
    const bySlug = new Map(result.items.map((c) => [c.slug, c]));
    expect(bySlug.get("copy")).toMatchObject({ own: true, source: { slug: "global" } });
    expect(bySlug.get("orphan")).toMatchObject({ own: true, source: null });
    expect(bySlug.get("other-global")).toMatchObject({ own: false, source: null });
    // The institution published its own version of "global": members see that one only (it names its source).
    expect(bySlug.has("global")).toBe(false);
    expect(result.items.map((c) => c.slug)).toEqual(["copy", "orphan", "other-global"]);
    expect(result.total).toBe(3);
  });

  it("keeps every global protocol for users outside the institution", async () => {
    db.calls = [];
    db.protocolRows = [row({ id: "g1", slug: "global" }), row({ id: "c9", slug: "theirs", organizationId: "org9", sourceProtocolId: "g1" })];
    const result = await getProtocolLibrary(trainee, { category: null, q: "" }, "en");
    expect(result.items.map((c) => c.slug)).toContain("global");
    // Nobody here has a copy of their own: the version links are not even read.
    expect(db.calls.filter((c) => c.model === "versions")).toEqual([]);
  });

  it("a newer global version of a protocol the institution replaced stays out of its library too", async () => {
    db.versionRows = [versionRow("g1aaaaaaaa", "g2aaaaaaaa"), versionRow("g2aaaaaaaa", "g3aaaaaaaa")];
    db.protocolRows = [
      row({ id: "g1aaaaaaaa", slug: "hand-hygiene", titleEn: "Hand hygiene" }),
      row({ id: "g3aaaaaaaa", slug: "hand-hygiene-v3", titleEn: "Hand hygiene" }),
      row({ id: "c1aaaaaaaa", slug: "copy", organizationId: "org1", sourceProtocolId: "g1aaaaaaaa", titleEn: "Hand hygiene" }),
      row({ id: "o1aaaaaaaa", slug: "other", titleEn: "Other" }),
    ];
    const members = await getProtocolLibrary(manager, { category: null, q: "" }, "en");
    expect(members.items.map((c) => c.slug)).toEqual(["copy", "other"]);
    const where = (db.calls.find((c) => c.model === "versions")!.args as { where: unknown }).where;
    expect(where).toEqual({ organizationId: null, versionOfId: { not: null } });
    // Everyone else still sees the global versions as they are (their readable set has no copy of org1).
    db.protocolRows = (db.protocolRows as Array<{ organizationId: string | null }>).filter((r) => r.organizationId === null);
    const others = await getProtocolLibrary(trainee, { category: null, q: "" }, "en");
    expect(others.items.map((c) => c.slug).sort()).toEqual(["hand-hygiene", "hand-hygiene-v3", "other"]);
  });

  it("replacedSources: only the active institution's copies replace their source", () => {
    const rows = [
      { organizationId: null, sourceProtocolId: null },
      { organizationId: "org1", sourceProtocolId: "g1" },
      { organizationId: "org1", sourceProtocolId: null },
      { organizationId: "org2", sourceProtocolId: "g2" },
    ];
    expect([...replacedSources(rows, "org1")]).toEqual(["g1"]);
    expect(replacedSources(rows, null).size).toBe(0);
    // With version links: every version of the copied protocol, older and newer, not unrelated ones.
    const edges = [
      { from: "g0", to: "g1" },
      { from: "g1", to: "g1-v2" },
      { from: "g2", to: "g2-v2" },
    ];
    expect([...replacedSources(rows, "org1", edges)].sort()).toEqual(["g0", "g1", "g1-v2"]);
  });

  it("summarises the steps of each card", async () => {
    db.protocolRows = [
      row({
        steps: [
          { textAr: "أ", textEn: "a", isMandatory: true, isCritical: true, visualCheck: false },
          { textAr: "ب", textEn: "b", isMandatory: false, isCritical: false, visualCheck: true },
        ],
      }),
    ];
    const result = await getProtocolLibrary(trainee, { category: null, q: "" }, "ar");
    expect(result.items[0].steps).toEqual({ total: 2, mandatory: 1, critical: 1, visual: 1 });
  });
});

describe("getProtocolDetail", () => {
  it("never queries for a slug the editors could not have saved", async () => {
    db.calls = [];
    for (const slug of ["", "../x", "UPPER", "a b", "x".repeat(81)]) {
      expect(await getProtocolDetail(trainee, slug)).toBeNull();
    }
    expect(db.calls).toHaveLength(0);
  });

  it("looks the slug up inside readable AND published", async () => {
    db.calls = [];
    db.protocolRows = [row({})];
    await getProtocolDetail(trainee, "sharps-safety");
    const where = (db.calls[0].args as { where: { AND: unknown[] } }).where;
    expect(where.AND).toContainEqual({ isPublished: true });
    expect(where.AND).toContainEqual({ slug: "sharps-safety" });
  });
});

describe("training scenarios", () => {
  const scenario = (id: string, protocolId: string, organizationId: string | null) => ({
    id,
    slug: id,
    protocolId,
    organizationId,
    titleAr: id,
    titleEn: id,
    introAr: "",
    introEn: "",
    difficulty: "beginner" as const,
    estimatedMinutes: 5,
    _count: { stages: 3 },
  });

  it("asks for playable scenarios of the protocol, its source and the source's newer versions, on published protocols only", async () => {
    db.calls = [];
    db.scenarioRows = [];
    db.versionRows = [versionRow("g1aaaaaaaa", "g2aaaaaaaa")];
    await getTrainingScenarios(manager, "c1aaaaaaaa", "g1aaaaaaaa");
    const where = (db.calls.find((c) => c.model === "scenario")!.args as { where: { AND: unknown[] } }).where;
    expect(where.AND).toContainEqual({ protocolId: { in: ["c1aaaaaaaa", "g1aaaaaaaa", "g2aaaaaaaa"] } });
    expect(where.AND).toContainEqual({ protocol: { is: { isPublished: true } } });
  });

  it("a global protocol (no source) reads no version links", async () => {
    db.calls = [];
    await getTrainingScenarios(trainee, "g1aaaaaaaa", null);
    expect(db.calls.map((c) => c.model)).toEqual(["scenario"]);
  });

  it("prefers the protocol's own scenarios, the institution's first, keeping the query order otherwise", () => {
    const rows = [scenario("global-easy", "p1", null), scenario("source", "g1", null), scenario("org", "p1", "org1")];
    const result = pickTrainingScenarios(rows, "p1", "org1");
    expect(result.fromSource).toBe(false);
    expect(result.scenarios.map((s) => [s.slug, s.own])).toEqual([
      ["org", true],
      ["global-easy", false],
    ]);
    expect(result.scenarios[0].stages).toBe(3);
  });

  it("falls back to the source protocol's scenarios when the copy has none", () => {
    const result = pickTrainingScenarios([scenario("source", "g1", null)], "c1", "org1", ["g1"]);
    expect(result).toMatchObject({ fromSource: true, scenarios: [{ slug: "source", own: false }] });
  });

  it("then to the newest newer version that has scenarios (moved there, or the source is unpublished)", () => {
    const rows = [scenario("v2", "g2", null), scenario("v3", "g3", null)];
    expect(pickTrainingScenarios(rows, "c1", "org1", ["g1", "g3", "g2"]).scenarios.map((s) => s.slug)).toEqual(["v3"]);
    // The source keeps priority while it has published scenarios of its own.
    const withSource = [scenario("source", "g1", null), ...rows];
    expect(pickTrainingScenarios(withSource, "c1", "org1", ["g1", "g3", "g2"]).scenarios.map((s) => s.slug)).toEqual(["source"]);
    // Scenarios of protocols outside the fallback list are never shown.
    expect(pickTrainingScenarios([scenario("stranger", "x9", null)], "c1", "org1", ["g1"])).toEqual({ scenarios: [], fromSource: false });
  });

  it("is empty (not 'from source') when there is nothing to play", () => {
    expect(pickTrainingScenarios([], "p1", null)).toEqual({ scenarios: [], fromSource: false });
  });
});
