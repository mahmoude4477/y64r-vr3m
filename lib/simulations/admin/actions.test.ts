import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Server Action layer of the scenario editor: locale check, platform-admin authorisation (never a redirect, a
 * "forbidden" code), validation with translated messages (the editor's own rules from simulations.admin.issues), and
 * the router refresh after a change. The database work is mocked (./mutations has its own tests).
 */

const state = vi.hoisted(() => ({
  admin: true as boolean,
  refreshed: 0,
  revalidated: [] as string[],
  saved: [] as unknown[],
  created: [] as unknown[],
  steps: new Set(["g-1"]) as Set<string> | null,
}));

vi.mock("./authorize", () => ({
  platformAdminOrNull: async () => (state.admin ? { user: { id: "admin" }, session: { impersonatedBy: null }, isPlatformAdmin: true } : null),
}));
vi.mock("next/cache", () => ({
  refresh: () => {
    state.refreshed++;
  },
  revalidatePath: (path: string) => {
    state.revalidated.push(path);
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => {
    const t = (key: string, values?: Record<string, unknown>) => `${namespace}.${key}${values ? JSON.stringify(values) : ""}`;
    return Object.assign(t, { has: () => true });
  },
}));
vi.mock("./mutations", () => ({
  scenarioOwner: async (id: string) => (id === "sc" ? { organizationId: null } : undefined),
  eligibleProtocolSteps: async (protocolId: string) => (protocolId === "global" ? state.steps : null),
  saveScenario: async (_ctx: unknown, input: unknown) => {
    state.saved.push(input);
    return { ok: true, updatedAt: "2026-10-29T10:00:00.000Z" };
  },
  createScenario: async (_ctx: unknown, input: unknown) => {
    state.created.push(input);
    return { ok: true, id: "new" };
  },
  publishScenario: async () => ({ ok: false, error: "cannot_publish", issues: ["needsStage"] }),
  unpublishScenario: async () => ({ ok: true }),
  createVersion: async () => ({ ok: true, id: "v2", version: 2, existing: false }),
  deleteDraft: async () => ({ ok: true }),
}));

const actions = await import("./actions");

const meta = {
  titleAr: "عنوان",
  titleEn: "Title",
  introAr: "مقدمة",
  introEn: "Intro",
  settingAr: "الموقف",
  settingEn: "Setting",
  protocolId: "global",
  difficulty: "beginner",
  estimatedMinutes: 5,
};
const option = (over: Record<string, unknown> = {}) => ({
  textAr: "خيار",
  textEn: "Option",
  isCorrect: false,
  isCritical: false,
  stepId: null,
  feedbackAr: "شرح",
  feedbackEn: "Why",
  ...over,
});
const stage = (options: unknown[]) => ({ kind: "single", contextAr: "", contextEn: "", promptAr: "سؤال", promptEn: "Question", options });
const save = (content: unknown) => ({ id: "sc", expectedUpdatedAt: "2026-10-29T09:00:00.000Z", content });

beforeEach(() => {
  state.admin = true;
  state.refreshed = 0;
  state.revalidated = [];
  state.saved = [];
  state.created = [];
  state.steps = new Set(["g-1"]);
});

describe("scenario editor actions", () => {
  it("answer forbidden for anyone but a platform admin, before reading the input", async () => {
    state.admin = false;
    expect(await actions.createScenarioAction("ar", { nonsense: true })).toEqual({ ok: false, error: "forbidden" });
    expect(await actions.saveScenarioAction("ar", save({ ...meta, stages: [] }))).toEqual({ ok: false, error: "forbidden" });
    expect(await actions.publishScenarioAction("ar", { id: "sc" })).toEqual({ ok: false, error: "forbidden" });
    expect(await actions.unpublishScenarioAction("ar", { id: "sc" })).toEqual({ ok: false, error: "forbidden" });
    expect(await actions.createVersionAction("ar", { id: "sc" })).toEqual({ ok: false, error: "forbidden" });
    expect(await actions.deleteDraftAction("ar", { id: "sc" })).toEqual({ ok: false, error: "forbidden" });
    expect(state.saved).toEqual([]);
    expect(state.created).toEqual([]);
  });

  it("refuses an unknown locale", async () => {
    expect(await actions.publishScenarioAction("fr", { id: "sc" })).toEqual({ ok: false, error: "bad_locale" });
  });

  it("validates a new scenario and returns translated field issues", async () => {
    const r = await actions.createScenarioAction("en", { ...meta, slug: "spill-v2", organizationId: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("invalid_input");
    expect(r.fieldIssues).toContainEqual({ path: "slug", message: "simulations.admin.issues.slugVersionSuffix" });
    const ok = await actions.createScenarioAction("en", { ...meta, slug: "spill", organizationId: null });
    expect(ok).toEqual({ ok: true, id: "new" });
    expect(state.revalidated).toEqual(["/en/admin/scenarios"]);
  });

  it("checks the save against the steps of the chosen protocol", async () => {
    const foreign = save({ ...meta, stages: [stage([option({ isCorrect: true, stepId: "other" }), option()])] });
    const r = await actions.saveScenarioAction("ar", foreign);
    expect(r).toMatchObject({ ok: false, error: "invalid_input" });
    if (!r.ok) expect(r.fieldIssues).toContainEqual({ path: "stages.0.options.0.stepId", message: "simulations.admin.issues.stepNotInProtocol" });
    expect(state.saved).toEqual([]);

    const valid = save({ ...meta, stages: [stage([option({ isCorrect: true, stepId: "g-1" }), option()])] });
    expect(await actions.saveScenarioAction("ar", valid)).toEqual({ ok: true, updatedAt: "2026-10-29T10:00:00.000Z" });
    expect(state.saved).toHaveLength(1);
    expect(state.refreshed).toBe(1);
  });

  it("refuses a protocol the owner may not use and a scenario that does not exist", async () => {
    expect(await actions.saveScenarioAction("ar", save({ ...meta, protocolId: "own-b", stages: [] }))).toEqual({ ok: false, error: "protocol_not_allowed" });
    expect(await actions.saveScenarioAction("ar", { ...save({ ...meta, stages: [] }), id: "gone" })).toEqual({ ok: false, error: "not_found" });
    expect(await actions.saveScenarioAction("ar", { id: "sc", expectedUpdatedAt: "yesterday", content: {} })).toEqual({ ok: false, error: "invalid_input" });
  });

  it("passes publish failures through without refreshing", async () => {
    expect(await actions.publishScenarioAction("ar", { id: "sc" })).toEqual({ ok: false, error: "cannot_publish", issues: ["needsStage"] });
    expect(state.refreshed).toBe(0);
    expect(await actions.unpublishScenarioAction("ar", { id: "sc" })).toEqual({ ok: true });
    expect(state.refreshed).toBe(1);
  });

  it("refuses malformed ids", async () => {
    expect(await actions.createVersionAction("ar", { id: "" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await actions.deleteDraftAction("ar", { id: "x".repeat(65) })).toEqual({ ok: false, error: "invalid_input" });
  });
});
