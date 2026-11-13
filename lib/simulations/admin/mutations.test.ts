import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScenarioContent } from "./content";

/**
 * The editor's writes against an in-memory stand-in for the Prisma calls they make. Checks the integrity rules:
 * attempted scenarios are never edited in place, a stale editor never overwrites, protocols and steps stay within the
 * owner, publishing one version unpublishes the others, a new version is a full unpublished copy, only drafts are
 * deleted, and every change writes its audit row inside the transaction.
 */

type Option = { textAr: string; textEn: string; isCorrect: boolean; isCritical: boolean; stepId: string | null; feedbackAr: string; feedbackEn: string };
type Stage = { kind: "single" | "multi"; contextAr: string | null; contextEn: string | null; promptAr: string; promptEn: string; options: Option[] };
type Row = {
  id: string;
  slug: string;
  organizationId: string | null;
  protocolId: string;
  isPublished: boolean;
  updatedAt: Date;
  titleAr: string;
  titleEn: string;
  introAr: string;
  introEn: string;
  settingAr: string;
  settingEn: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  stages: Stage[];
};

const db = vi.hoisted(() => ({
  scenarios: [] as Row[],
  attempts: [] as Array<{ scenarioId: string; status: "in_progress" | "completed" | "abandoned" }>,
  protocols: [] as Array<{ id: string; organizationId: string | null; steps: Array<{ id: string }> }>,
  orgs: [] as string[],
  audits: [] as Array<{ action: string; target: { type: string; id?: string | null }; meta: unknown; inTx: boolean }>,
  locks: [] as string[],
  seq: 0,
  clock: 1_000,
  uniqueFail: false,
}));

const client = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock("@/lib/prisma", () => ({ prisma: client }));
vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn(async (_ctx: unknown, action: string, target: { type: string; id?: string | null }, meta: unknown, options?: { tx?: unknown }) => {
    db.audits.push({ action, target, meta, inTx: !!options?.tx });
  }),
}));

function protocolMatches(p: (typeof db.protocols)[number], where: Record<string, unknown>): boolean {
  const and = (where.AND as Array<Record<string, unknown>> | undefined) ?? [where];
  return and.every((w) => {
    if (typeof w.id === "string" && p.id !== w.id) return false;
    if ("organizationId" in w && p.organizationId !== w.organizationId) return false;
    if (Array.isArray(w.OR)) return (w.OR as Array<Record<string, unknown>>).some((o) => p.organizationId === o.organizationId);
    return true;
  });
}

function familyMatches(row: Row, where: Record<string, unknown>): boolean {
  if ("organizationId" in where && row.organizationId !== where.organizationId) return false;
  const or = where.OR as Array<{ slug: string | { startsWith: string } }> | undefined;
  if (!or) return true;
  return or.some((o) => (typeof o.slug === "string" ? row.slug === o.slug : row.slug.startsWith(o.slug.startsWith)));
}

const attemptsOf = (id: string) => db.attempts.filter((a) => a.scenarioId === id).length;
const withRelations = (row: Row) => ({
  ...row,
  protocol: db.protocols.find((p) => p.id === row.protocolId),
  _count: { attempts: attemptsOf(row.id) },
});
const touch = (row: Row) => {
  db.clock += 1000;
  row.updatedAt = new Date(db.clock);
};

const tx = {
  $queryRaw: async (_strings: TemplateStringsArray, id: string) => {
    const row = db.scenarios.find((s) => s.id === id);
    db.locks.push(`row:${id}`);
    return row ? [{ id: row.id, slug: row.slug, organizationId: row.organizationId, updatedAt: row.updatedAt, isPublished: row.isPublished }] : [];
  },
  $executeRaw: async (_strings: TemplateStringsArray, key: string) => {
    db.locks.push(`family:${key}`);
    return 1;
  },
  scenario: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = db.scenarios.find((s) => s.id === where.id);
      return row ? withRelations(row) : null;
    },
    findMany: async ({ where }: { where: Record<string, unknown> }) => db.scenarios.filter((s) => familyMatches(s, where)).map(withRelations),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (db.uniqueFail) throw Object.assign(new Error("unique"), { code: "P2002" });
      const stages = ((data.stages as { create?: unknown[] } | undefined)?.create ?? []) as Array<Stage & { options: { create: Option[] } }>;
      const row = {
        ...(data as unknown as Row),
        id: `new-${++db.seq}`,
        updatedAt: new Date((db.clock += 1000)),
        stages: stages.map((s) => ({ ...s, options: s.options.create })),
      };
      db.scenarios.push(row);
      return { id: row.id };
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = db.scenarios.find((s) => s.id === where.id)!;
      const { stages, ...fields } = data as { stages?: { create: Array<Stage & { options: { create: Option[] } }> } };
      Object.assign(row, fields);
      if (stages) row.stages = stages.create.map((s) => ({ ...s, options: s.options.create }));
      touch(row);
      return { updatedAt: row.updatedAt };
    },
    updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: Partial<Row> }) => {
      for (const row of db.scenarios.filter((s) => where.id.in.includes(s.id))) {
        Object.assign(row, data);
        touch(row);
      }
      return { count: where.id.in.length };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      db.scenarios = db.scenarios.filter((s) => s.id !== where.id);
    },
  },
  scenarioStage: {
    deleteMany: async ({ where }: { where: { scenarioId: string } }) => {
      db.scenarios.find((s) => s.id === where.scenarioId)!.stages = [];
    },
  },
  simulationAttempt: {
    count: async ({ where }: { where: { scenarioId: string; status?: string } }) =>
      db.attempts.filter((a) => a.scenarioId === where.scenarioId && (!where.status || a.status === where.status)).length,
    updateMany: async ({ where, data }: { where: { scenarioId: { in: string[] }; status: string }; data: { status: "abandoned" } }) => {
      const rows = db.attempts.filter((a) => where.scenarioId.in.includes(a.scenarioId) && a.status === where.status);
      rows.forEach((a) => Object.assign(a, data));
      return { count: rows.length };
    },
  },
  protocol: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => db.protocols.find((p) => protocolMatches(p, where)) ?? null,
  },
};

Object.assign(client, {
  ...tx,
  organization: { findUnique: async ({ where }: { where: { id: string } }) => (db.orgs.includes(where.id) ? { id: where.id } : null) },
  $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
});

const { createScenario, createVersion, deleteDraft, publishScenario, saveScenario, unpublishScenario } = await import("./mutations");

const ctx = { user: { id: "admin" }, session: { impersonatedBy: null } } as never;

function option(over: Partial<Option> = {}): Option {
  return { textAr: "خيار", textEn: "Option", isCorrect: false, isCritical: false, stepId: null, feedbackAr: "شرح", feedbackEn: "Why", ...over };
}
function stage(over: Partial<Stage> = {}): Stage {
  return {
    kind: "single",
    contextAr: null,
    contextEn: null,
    promptAr: "سؤال",
    promptEn: "Question",
    options: [option({ isCorrect: true, stepId: "g-1" }), option({ stepId: "g-1", isCritical: true })],
    ...over,
  };
}
function scenario(over: Partial<Row> = {}): Row {
  return {
    id: "sc",
    slug: "spill",
    organizationId: null,
    protocolId: "global",
    isPublished: false,
    updatedAt: new Date(500),
    titleAr: "عنوان",
    titleEn: "Title",
    introAr: "مقدمة",
    introEn: "Intro",
    settingAr: "الموقف",
    settingEn: "Setting",
    difficulty: "beginner",
    estimatedMinutes: 5,
    stages: [stage()],
    ...over,
  };
}
function content(over: Partial<ScenarioContent> = {}): ScenarioContent {
  return {
    titleAr: "عنوان جديد",
    titleEn: "New title",
    introAr: "مقدمة",
    introEn: "Intro",
    settingAr: "الموقف",
    settingEn: "Setting",
    protocolId: "global",
    difficulty: "intermediate",
    estimatedMinutes: 7,
    stages: [{ ...stage(), contextAr: "", contextEn: "" }],
    ...over,
  };
}
const meta = {
  titleAr: "عنوان",
  titleEn: "Title",
  introAr: "مقدمة",
  introEn: "Intro",
  settingAr: "الموقف",
  settingEn: "Setting",
  difficulty: "beginner" as const,
  estimatedMinutes: 5,
};

beforeEach(() => {
  db.scenarios = [];
  db.attempts = [];
  db.audits = [];
  db.locks = [];
  db.orgs = ["org-a", "org-b"];
  db.uniqueFail = false;
  db.seq = 0;
  db.protocols = [
    { id: "global", organizationId: null, steps: [{ id: "g-1" }, { id: "g-2" }] },
    { id: "own-a", organizationId: "org-a", steps: [{ id: "a-1" }] },
  ];
});

describe("createScenario", () => {
  it("creates an unpublished draft and audits it in the transaction", async () => {
    const r = await createScenario(ctx, { ...meta, slug: "new-one", protocolId: "global", organizationId: null });
    expect(r).toEqual({ ok: true, id: "new-1" });
    expect(db.scenarios[0]).toMatchObject({ slug: "new-one", isPublished: false, organizationId: null });
    expect(db.audits).toEqual([{ action: "scenario.create", target: { type: "scenario", id: "new-1" }, meta: expect.objectContaining({ slug: "new-one" }), inTx: true }]);
  });

  it("keeps protocols within the owner", async () => {
    expect(await createScenario(ctx, { ...meta, slug: "x", protocolId: "own-a", organizationId: null })).toEqual({ ok: false, error: "protocol_not_allowed" });
    expect(await createScenario(ctx, { ...meta, slug: "x", protocolId: "own-a", organizationId: "org-b" })).toEqual({ ok: false, error: "protocol_not_allowed" });
    expect((await createScenario(ctx, { ...meta, slug: "x", protocolId: "own-a", organizationId: "org-a" })).ok).toBe(true);
    expect((await createScenario(ctx, { ...meta, slug: "y", protocolId: "global", organizationId: "org-b" })).ok).toBe(true);
  });

  it("refuses an unknown institution and a taken address", async () => {
    expect(await createScenario(ctx, { ...meta, slug: "x", protocolId: "global", organizationId: "gone" })).toEqual({ ok: false, error: "organization_not_found" });
    db.uniqueFail = true;
    expect(await createScenario(ctx, { ...meta, slug: "x", protocolId: "global", organizationId: null })).toEqual({ ok: false, error: "slug_taken" });
    expect(db.audits).toEqual([]);
  });
});

describe("saveScenario", () => {
  const expected = new Date(500).toISOString();

  it("replaces the content of a scenario nobody attempted, under a row lock, with an audit row", async () => {
    db.scenarios = [scenario()];
    const r = await saveScenario(ctx, { id: "sc", expectedUpdatedAt: expected, content: content() });
    expect(r.ok).toBe(true);
    expect(db.locks).toEqual(["row:sc"]);
    expect(db.scenarios[0]).toMatchObject({ titleEn: "New title", difficulty: "intermediate", estimatedMinutes: 7 });
    expect(db.scenarios[0].stages[0]).toMatchObject({ order: 1, contextAr: null, contextEn: null });
    expect(db.audits.map((a) => [a.action, a.inTx])).toEqual([["scenario.update", true]]);
    if (r.ok) expect(r.updatedAt).toBe(db.scenarios[0].updatedAt.toISOString());
  });

  it("never edits an attempted scenario in place, whatever the attempt's status", async () => {
    for (const status of ["in_progress", "completed", "abandoned"] as const) {
      db.scenarios = [scenario()];
      db.attempts = [{ scenarioId: "sc", status }];
      expect(await saveScenario(ctx, { id: "sc", expectedUpdatedAt: expected, content: content() })).toEqual({ ok: false, error: "has_attempts" });
      expect(db.scenarios[0].titleEn).toBe("Title");
    }
    expect(db.audits).toEqual([]);
  });

  it("refuses a stale editor instead of overwriting", async () => {
    db.scenarios = [scenario()];
    expect(await saveScenario(ctx, { id: "sc", expectedUpdatedAt: new Date(400).toISOString(), content: content() })).toEqual({
      ok: false,
      error: "stale",
    });
  });

  it("re-checks the protocol and its steps against the owner", async () => {
    db.scenarios = [scenario()];
    expect(await saveScenario(ctx, { id: "sc", expectedUpdatedAt: expected, content: content({ protocolId: "own-a" }) })).toEqual({
      ok: false,
      error: "protocol_not_allowed",
    });
    const foreign = content({ stages: [{ ...stage({ options: [option({ isCorrect: true, stepId: "a-1" }), option()] }), contextAr: "", contextEn: "" }] });
    expect(await saveScenario(ctx, { id: "sc", expectedUpdatedAt: expected, content: foreign })).toEqual({ ok: false, error: "invalid_content" });
  });

  it("keeps a published scenario playable (it cannot lose all its stages)", async () => {
    db.scenarios = [scenario({ isPublished: true })];
    expect(await saveScenario(ctx, { id: "sc", expectedUpdatedAt: expected, content: content({ stages: [] }) })).toEqual({
      ok: false,
      error: "cannot_publish",
      issues: ["needsStage"],
    });
  });

  it("answers not_found for a missing scenario", async () => {
    expect(await saveScenario(ctx, { id: "nope", expectedUpdatedAt: expected, content: content() })).toEqual({ ok: false, error: "not_found" });
  });
});

describe("publish and unpublish", () => {
  it("publishes a valid scenario and unpublishes the other versions of its family", async () => {
    db.scenarios = [
      scenario({ id: "v1", slug: "spill", isPublished: true }),
      scenario({ id: "v2", slug: "spill-v2" }),
      scenario({ id: "other", slug: "spill-room", isPublished: true }),
      scenario({ id: "org", slug: "spill-v3", organizationId: "org-a", isPublished: true }),
    ];
    // A trainee is half-way through version 1; another finished it; version 2 has an attempt of its own (a preview
    // never makes one, but the rule must not touch other versions).
    db.attempts = [
      { scenarioId: "v1", status: "in_progress" },
      { scenarioId: "v1", status: "completed" },
      { scenarioId: "other", status: "in_progress" },
    ];
    const r = await publishScenario(ctx, "v2");
    expect(r).toEqual({ ok: true, replaced: ["v1"], abandoned: 1 });
    // The open attempt on the replaced version is closed as unfinished (it can never be finished); history stays.
    expect(db.attempts.map((a) => [a.scenarioId, a.status])).toEqual([
      ["v1", "abandoned"],
      ["v1", "completed"],
      ["other", "in_progress"],
    ]);
    expect(db.audits[0].meta).toEqual({ slug: "spill-v2", replaced: ["v1"], abandoned: 1 });
    expect(db.scenarios.map((s) => [s.id, s.isPublished])).toEqual([
      ["v1", false],
      ["v2", true],
      ["other", true],
      ["org", true],
    ]);
    // The family lock comes before the row lock (no deadlock between two publishes).
    expect(db.locks).toEqual(["family:scenario-family:global:spill", "row:v2"]);
    expect(db.audits.map((a) => [a.action, a.target.id, a.inTx])).toEqual([
      ["scenario.publish", "v2", true],
      ["scenario.unpublish", "v1", true],
    ]);
  });

  it("refuses to publish a scenario without stages or with broken content", async () => {
    db.scenarios = [scenario({ stages: [] })];
    expect(await publishScenario(ctx, "sc")).toEqual({ ok: false, error: "cannot_publish", issues: ["needsStage"] });
    db.scenarios = [scenario({ stages: [stage({ options: [option({ isCorrect: true }), option({ isCorrect: true })] })] })];
    expect(await publishScenario(ctx, "sc")).toEqual({ ok: false, error: "invalid_content" });
    expect(db.scenarios[0].isPublished).toBe(false);
  });

  it("is idempotent for the published version (no audit row)", async () => {
    db.scenarios = [scenario({ isPublished: true })];
    expect(await publishScenario(ctx, "sc")).toEqual({ ok: true, replaced: [], abandoned: 0 });
    expect(db.audits).toEqual([]);
  });

  it("unpublishes with the number of open attempts in the audit row", async () => {
    db.scenarios = [scenario({ isPublished: true })];
    db.attempts = [
      { scenarioId: "sc", status: "in_progress" },
      { scenarioId: "sc", status: "completed" },
    ];
    expect(await unpublishScenario(ctx, "sc")).toEqual({ ok: true });
    expect(db.scenarios[0].isPublished).toBe(false);
    expect(db.audits).toEqual([{ action: "scenario.unpublish", target: { type: "scenario", id: "sc" }, meta: { slug: "spill", inProgress: 1 }, inTx: true }]);
    db.audits = [];
    expect(await unpublishScenario(ctx, "sc")).toEqual({ ok: true });
    expect(db.audits).toEqual([]);
  });
});

describe("createVersion", () => {
  it("copies the whole scenario into the next version, unpublished, and audits where it came from", async () => {
    db.scenarios = [scenario({ id: "v1", isPublished: true, organizationId: "org-a", protocolId: "global" }), scenario({ id: "v4", slug: "spill-v4", organizationId: "org-a", isPublished: false })];
    db.attempts = [
      { scenarioId: "v1", status: "completed" },
      { scenarioId: "v4", status: "completed" },
    ];
    const r = await createVersion(ctx, "v1");
    expect(r).toEqual({ ok: true, id: "new-1", version: 5, existing: false });
    const copy = db.scenarios.find((s) => s.id === "new-1")!;
    expect(copy).toMatchObject({ slug: "spill-v5", isPublished: false, organizationId: "org-a", protocolId: "global", titleEn: "Title" });
    expect(copy.stages).toHaveLength(1);
    expect(copy.stages[0].options.map((o) => [o.isCorrect, o.isCritical, o.stepId])).toEqual([
      [true, false, "g-1"],
      [false, true, "g-1"],
    ]);
    expect(db.audits).toEqual([
      {
        action: "scenario.version",
        target: { type: "scenario", id: "new-1" },
        meta: { fromId: "v1", fromSlug: "spill", slug: "spill-v5", version: 5 },
        inTx: true,
      },
    ]);
  });

  it("opens the existing draft of the next version instead of making another copy", async () => {
    db.scenarios = [scenario({ id: "v1", isPublished: true }), scenario({ id: "v2", slug: "spill-v2" })];
    db.attempts = [{ scenarioId: "v1", status: "completed" }];
    expect(await createVersion(ctx, "v1")).toEqual({ ok: true, id: "v2", version: 2, existing: true });
    expect(db.scenarios).toHaveLength(2);
    expect(db.audits).toEqual([]);
  });
});

describe("deleteDraft", () => {
  it("deletes an unpublished draft nobody attempted", async () => {
    db.scenarios = [scenario()];
    expect(await deleteDraft(ctx, "sc")).toEqual({ ok: true });
    expect(db.scenarios).toEqual([]);
    expect(db.audits.map((a) => a.action)).toEqual(["scenario.delete"]);
  });

  it("refuses published scenarios and history", async () => {
    db.scenarios = [scenario({ isPublished: true })];
    expect(await deleteDraft(ctx, "sc")).toEqual({ ok: false, error: "not_draft" });
    db.scenarios = [scenario()];
    db.attempts = [{ scenarioId: "sc", status: "abandoned" }];
    expect(await deleteDraft(ctx, "sc")).toEqual({ ok: false, error: "not_draft" });
    expect(db.scenarios).toHaveLength(1);
  });
});
