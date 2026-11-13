import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStep, type EditorValues } from "./editor-form";

// The protocol editor's Server Actions: who may call them (scope -> gate), the order of checks, optimistic
// concurrency, the history rules, the audit row inside the transaction, and the error codes the editor shows.
// Prisma, the session helpers, the audit writer and the rate limiter are fakes; no database.

const s = vi.hoisted(() => ({
  admin: true,
  /** user.role "protocol_editor" (not a platform admin). */
  editor: false,
  orgRole: "owner" as string | null,
  rateLimitOk: true,
  audit: [] as Array<{ action: string; target: { type: string; id?: string | null }; meta: unknown; inTx: boolean }>,
  revalidated: 0,
  calls: [] as Array<{ op: string; args: unknown }>,
  protocol: null as null | Record<string, unknown>,
  updateCount: 1,
  deleteCount: 1,
  stepDeleteCount: 0,
  count: 0,
  createError: null as unknown,
  sourceRow: null as null | Record<string, unknown>,
  takenSlugs: [] as Array<{ slug: string }>,
}));

vi.mock("next-intl", () => ({ hasLocale: (locales: readonly string[], l: unknown) => locales.includes(l as string) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => `[${key}]`, { has: () => true }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => void s.revalidated++ }));
vi.mock("@/i18n/routing", () => ({ routing: { locales: ["ar", "en"], defaultLocale: "ar" } }));
vi.mock("@/lib/session", () => {
  const ctx = () => ({
    user: { id: "u-1" },
    session: { impersonatedBy: null },
    isPlatformAdmin: s.admin,
    isContentEditor: s.admin || s.editor,
    organizationId: s.orgRole ? "org-1" : null,
    orgRole: s.orgRole,
    memberId: s.orgRole ? "m-1" : null,
  });
  return {
    requireContentEditor: async () => {
      if (!s.admin && !s.editor) throw new Error("NEXT_NOT_FOUND");
      return ctx();
    },
    requireOrgRole: async (roles: readonly string[]) => {
      if (!s.orgRole || !roles.includes(s.orgRole)) throw new Error("NEXT_NOT_FOUND");
      return ctx();
    },
  };
});
vi.mock("@/lib/app-rate-limit", () => ({ takeAppRateLimit: async () => s.rateLimitOk }));
vi.mock("@/lib/audit", () => ({
  writeAudit: async (_: unknown, action: string, target: { type: string; id?: string }, meta: unknown, options?: { tx?: unknown }) =>
    void s.audit.push({ action, target, meta, inTx: !!options?.tx }),
}));
vi.mock("@/lib/log", () => ({ log: { error: () => {}, warn: () => {}, info: () => {} } }));
vi.mock("@/lib/prisma", () => {
  const rec = (op: string) => (args: unknown) => {
    s.calls.push({ op, args });
  };
  const protocol = {
    findFirst: async (args: { where: unknown }) => {
      rec("protocol.findFirst")(args);
      const where = JSON.stringify(args.where);
      if (where.includes('"isPublished":true') && where.includes('"organizationId":null')) return s.sourceRow;
      return s.protocol;
    },
    findMany: async (args: unknown) => {
      rec("protocol.findMany")(args);
      return s.takenSlugs;
    },
    findUniqueOrThrow: async (args: unknown) => {
      rec("protocol.findUniqueOrThrow")(args);
      return { ...s.protocol, updatedAt: new Date("2026-10-29T10:00:05.000Z") };
    },
    updateMany: async (args: unknown) => {
      rec("protocol.updateMany")(args);
      return { count: s.updateCount };
    },
    deleteMany: async (args: unknown) => {
      rec("protocol.deleteMany")(args);
      return { count: s.deleteCount };
    },
    count: async (args: unknown) => {
      rec("protocol.count")(args);
      return s.count;
    },
    create: async (args: { data: { slug: string } }) => {
      rec("protocol.create")(args);
      if (s.createError) throw s.createError;
      return { id: "new-protocol-1", slug: args.data.slug };
    },
  };
  const protocolStep = {
    deleteMany: async (args: unknown) => {
      rec("protocolStep.deleteMany")(args);
      return { count: s.stepDeleteCount };
    },
    update: async (args: unknown) => rec("protocolStep.update")(args),
    create: async (args: unknown) => rec("protocolStep.create")(args),
  };
  // pg_advisory_xact_lock (assertInstitutionRoom): recorded, so tests can check it runs before the count.
  const $executeRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    rec("$executeRaw")({ sql: strings.join("?"), values });
    return 1;
  };
  const client = { protocol, protocolStep, $executeRaw };
  return { prisma: { ...client, $transaction: async (fn: (tx: unknown) => unknown) => fn(client) } };
});

const {
  copyGlobalProtocol,
  createProtocol,
  createProtocolVersion,
  deleteProtocolDraft,
  saveProtocol,
  setProtocolPublished,
} = await import("./editor-actions");

const VERSION = "2026-10-29T10:00:00.000Z";
const none = { scanResults: 0, simulationResults: 0, options: 0 };

const values = (over: Partial<EditorValues> = {}): EditorValues => ({
  slug: "",
  category: "safety",
  icon: "hand",
  titleAr: "استخدام القفازات",
  titleEn: "Glove use",
  summaryAr: "ملخص",
  summaryEn: "Summary",
  descriptionAr: "وصف",
  descriptionEn: "Description",
  steps: [
    { ...emptyStep("wear-gloves"), id: "s-1", textAr: "ارتدِ القفازات", textEn: "Wear gloves", rationaleAr: "سبب", rationaleEn: "Why" },
    { ...emptyStep("new-abc12345"), textAr: "اخلعها", textEn: "Take them off safely", rationaleAr: "سبب", rationaleEn: "Why" },
  ],
  ...over,
});

const savedProtocol = (over: Record<string, unknown> = {}) => ({
  id: "p-1",
  slug: "glove-use",
  organizationId: null,
  sourceProtocolId: null,
  isPublished: false,
  updatedAt: new Date(VERSION),
  category: "safety",
  icon: "hand",
  titleAr: "استخدام القفازات",
  titleEn: "Glove use",
  summaryAr: "ملخص",
  summaryEn: "Summary",
  descriptionAr: "وصف",
  descriptionEn: "Description",
  _count: { scans: 0, scenarios: 0, copies: 0 },
  steps: [
    {
      id: "s-1",
      key: "wear-gloves",
      order: 1,
      textAr: "ارتدِ القفازات",
      textEn: "Wear gloves",
      rationaleAr: "سبب",
      rationaleEn: "Why",
      criteriaAr: null,
      criteriaEn: null,
      referenceLabel: null,
      referenceUrl: null,
      isMandatory: true,
      isCritical: false,
      weight: 1,
      visualCheck: false,
      _count: none,
    },
  ],
  ...over,
});

const ops = (op: string) => s.calls.filter((c) => c.op === op);

beforeEach(() => {
  s.admin = true;
  s.editor = false;
  s.orgRole = "owner";
  s.rateLimitOk = true;
  s.audit = [];
  s.revalidated = 0;
  s.calls = [];
  s.protocol = savedProtocol();
  s.updateCount = 1;
  s.deleteCount = 1;
  s.stepDeleteCount = 0;
  s.count = 0;
  s.createError = null;
  s.sourceRow = null;
  s.takenSlugs = [];
});

describe("gates", () => {
  it("a protocol editor passes the global gate but gets no institution powers", async () => {
    s.admin = false;
    s.editor = true;
    s.orgRole = null;
    expect(await saveProtocol("ar", "global", { id: "p1234567", version: VERSION, values: values() })).not.toMatchObject({ error: "bad_input" });
    s.calls.length = 0;
    await expect(createProtocol("ar", "institution", values())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(s.calls).toEqual([]);
  });

  it("global actions need a platform admin or protocol editor; institution actions need an owner or admin", async () => {
    s.admin = false;
    await expect(saveProtocol("ar", "global", { id: "p1234567", version: VERSION, values: values() })).rejects.toThrow("NEXT_NOT_FOUND");
    s.orgRole = "examiner";
    await expect(saveProtocol("ar", "institution", { id: "p1234567", version: VERSION, values: values() })).rejects.toThrow("NEXT_NOT_FOUND");
    s.orgRole = "trainee";
    await expect(copyGlobalProtocol("ar", { sourceProtocolId: "g1234567" })).rejects.toThrow("NEXT_NOT_FOUND");
    s.orgRole = null;
    await expect(createProtocol("ar", "institution", values())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(s.calls).toEqual([]);
  });

  it("refuses an unknown locale or scope before touching anything", async () => {
    expect(await saveProtocol("fr", "global", { id: "p1234567", version: VERSION, values: values() })).toMatchObject({ ok: false, error: "bad_input" });
    expect(await saveProtocol("ar", "org" as never, { id: "p1234567", version: VERSION, values: values() })).toMatchObject({
      ok: false,
      error: "bad_input",
    });
    expect(s.calls).toEqual([]);
  });

  it("stops at the per-user write limit", async () => {
    s.rateLimitOk = false;
    expect(await setProtocolPublished("en", "global", { id: "p1234567", publish: true })).toMatchObject({
      ok: false,
      error: "too_many_requests",
      message: "[tooManyRequests]",
    });
    expect(s.calls).toEqual([]);
  });
});

describe("saveProtocol", () => {
  it("returns translated field errors and writes nothing for invalid content", async () => {
    const bad = values();
    bad.steps[1] = { ...bad.steps[1]!, visualCheck: true };
    bad.titleEn = "";
    const r = await saveProtocol("ar", "global", { id: "p1234567", version: VERSION, values: bad });
    expect(r).toMatchObject({ ok: false, error: "invalid_input" });
    expect(Object.keys((r as { fieldErrors: object }).fieldErrors).sort()).toEqual(["steps.1.criteriaAr", "steps.1.criteriaEn", "titleEn"]);
    expect(s.calls).toEqual([]);
  });

  it("refuses forged shapes", async () => {
    expect(await saveProtocol("ar", "global", { id: "p1234567", version: VERSION, values: { steps: "x" } })).toMatchObject({ error: "bad_input" });
    expect(await saveProtocol("ar", "global", { id: "../etc", version: VERSION, values: values() })).toMatchObject({ error: "bad_input" });
    expect(await saveProtocol("ar", "global", { id: "p1234567", version: "yesterday", values: values() })).toMatchObject({ error: "bad_input" });
  });

  it("says conflict when someone saved since the editor loaded, and writes nothing", async () => {
    s.protocol = savedProtocol({ updatedAt: new Date("2026-10-29T10:00:01.000Z") });
    expect(await saveProtocol("ar", "global", { id: "p1234567", version: VERSION, values: values() })).toMatchObject({ error: "conflict" });
    expect(ops("protocol.updateMany")).toEqual([]);
    expect(s.audit).toEqual([]);
  });

  it("says conflict when the claim loses a race", async () => {
    s.updateCount = 0;
    expect(await saveProtocol("ar", "global", { id: "p1234567", version: VERSION, values: values() })).toMatchObject({ error: "conflict" });
    expect(s.audit).toEqual([]);
  });

  it("refuses to drop a step with history", async () => {
    const p = savedProtocol();
    (p.steps as Array<Record<string, unknown>>)[0]!._count = { scanResults: 2, simulationResults: 0, options: 0 };
    s.protocol = p;
    const r = await saveProtocol("ar", "global", { id: "p1234567", version: VERSION, values: values({ steps: [values().steps[1]!] }) });
    expect(r).toMatchObject({ error: "step_has_history" });
    expect(ops("protocol.updateMany")).toEqual([]);
  });

  it("updates saved steps in place, creates new ones with readable keys, audits inside the transaction", async () => {
    const r = await saveProtocol("en", "global", { id: "p1234567", version: VERSION, values: values() });
    expect(r).toMatchObject({ ok: true, id: "p-1", version: "2026-10-29T10:00:05.000Z" });
    const claim = ops("protocol.updateMany")[0]!.args as { where: { id: string; updatedAt: Date } };
    expect(claim.where).toEqual({ id: "p1234567", updatedAt: new Date(VERSION) });
    expect(ops("protocolStep.update")).toHaveLength(1);
    expect(ops("protocolStep.update")[0]!.args).toMatchObject({ where: { id: "s-1" }, data: { order: 1, textEn: "Wear gloves" } });
    expect(ops("protocolStep.create")[0]!.args).toMatchObject({ data: { protocolId: "p1234567", key: "take-them-off-safely", order: 2 } });
    expect(s.audit).toEqual([
      {
        action: "protocol.update",
        target: { type: "protocol", id: "p1234567" },
        meta: { scope: "global", slug: "glove-use", steps: { total: 2, created: 1, removed: 0 } },
        inTx: true,
      },
    ]);
    expect(s.revalidated).toBeGreaterThan(0);
  });

  it("institution scope reads through protocolsEditable of the active institution", async () => {
    s.protocol = savedProtocol({ organizationId: "org-1" });
    await saveProtocol("ar", "institution", { id: "p1234567", version: VERSION, values: values() });
    const find = ops("protocol.findFirst")[0]!.args as { where: unknown };
    expect(JSON.stringify(find.where)).toContain('"organizationId":"org-1"');
    expect(s.audit[0]).toMatchObject({ meta: { scope: "institution", organizationId: "org-1" } });
  });

  it("deletes dropped steps without history, guarded again in the delete itself", async () => {
    const p = savedProtocol();
    (p.steps as unknown[]).push({ ...(p.steps as Array<Record<string, unknown>>)[0]!, id: "s-2", key: "old" });
    s.protocol = p;
    s.stepDeleteCount = 1;
    const r = await saveProtocol("ar", "global", { id: "p1234567", version: VERSION, values: values() });
    expect(r).toMatchObject({ ok: true });
    expect(JSON.stringify(ops("protocolStep.deleteMany")[0]!.args)).toContain('"scanResults":{"none":{}}');
    s.calls = [];
    s.audit = [];
    s.stepDeleteCount = 0; // a result appeared meanwhile
    expect(await saveProtocol("ar", "global", { id: "p1234567", version: VERSION, values: values() })).toMatchObject({ error: "step_has_history" });
    expect(s.audit).toEqual([]);
  });

  it("not found for a protocol outside the editor's scope", async () => {
    s.protocol = null;
    expect(await saveProtocol("ar", "global", { id: "p1234567", version: VERSION, values: values() })).toMatchObject({
      error: "not_found",
      message: "[notFound]",
    });
  });
});

describe("saveProtocol: steps with results keep their meaning", () => {
  const withResults = (over: Record<string, unknown> = {}) => {
    const p = savedProtocol();
    const first = (p.steps as Array<Record<string, unknown>>)[0]!;
    Object.assign(first, { _count: { scanResults: 1, simulationResults: 0, options: 0 }, ...over });
    return p;
  };

  it("refuses to change mandatory, critical, weight or photo check of a step with results, and writes nothing", async () => {
    s.protocol = withResults();
    const v = values({ steps: [{ ...values().steps[0]!, isCritical: true, weight: 3 }] });
    const r = await saveProtocol("en", "global", { id: "p1234567", version: VERSION, values: v });
    expect(r).toMatchObject({ ok: false, error: "step_locked", message: "[stepLocked]" });
    // Critical also makes the step mandatory (normalised), which was already true: two fields changed.
    expect((r as { fieldErrors: Record<string, string> }).fieldErrors).toEqual({ "steps.0.isCritical": "[lockedField]", "steps.0.weight": "[lockedField]" });
    expect(ops("protocol.updateMany")).toEqual([]);
    expect(ops("protocolStep.update")).toEqual([]);
    expect(s.audit).toEqual([]);
  });

  it("lets a step that only scenarios link to change its meaning (a link is not a result)", async () => {
    s.protocol = withResults({ _count: { scanResults: 0, simulationResults: 0, options: 2 } });
    const v = values({ steps: [{ ...values().steps[0]!, isCritical: true }] });
    expect(await saveProtocol("en", "global", { id: "p1234567", version: VERSION, values: v })).toMatchObject({ ok: true });
  });

  it("rewording a step with results needs confirmWording: without it nothing is written and the steps are named", async () => {
    s.protocol = withResults();
    const v = values({ steps: [{ ...values().steps[0]!, textEn: "Remove gloves" }] });
    const r = await saveProtocol("en", "global", { id: "p1234567", version: VERSION, values: v });
    expect(r).toMatchObject({ ok: false, error: "wording_confirm", message: "[wordingConfirm]", wordingSteps: [1] });
    expect(ops("protocol.updateMany")).toEqual([]);
    expect(ops("protocolStep.update")).toEqual([]);
    expect(s.audit).toEqual([]);
    // Exactly true (a Server Action can be called with anything).
    const forged = await saveProtocol("en", "global", { id: "p1234567", version: VERSION, values: v, confirmWording: "yes" as unknown as boolean });
    expect(forged).toMatchObject({ ok: false, error: "wording_confirm" });
  });

  it("allows confirmed wording fixes on a step with results and records the old wording in the audit row", async () => {
    s.protocol = withResults();
    const v = values({ steps: [{ ...values().steps[0]!, textEn: "Wear clean gloves" }] });
    expect(await saveProtocol("en", "global", { id: "p1234567", version: VERSION, values: v, confirmWording: true })).toMatchObject({ ok: true });
    expect(s.audit[0]!.meta).toMatchObject({
      changedSteps: [{ id: "s-1", key: "wear-gloves", fields: ["textEn"], before: { textEn: "Wear gloves" } }],
      rewordedWithResults: 1,
    });
  });

  it("a new reference on a step with results needs no confirmation (a citation, not what past reports show)", async () => {
    s.protocol = withResults();
    const reference = { referenceLabel: "CDC – Hand Hygiene", referenceUrl: "https://www.cdc.gov/clean-hands/" };
    const v = values({ steps: [{ ...values().steps[0]!, ...reference }] });
    expect(await saveProtocol("en", "global", { id: "p1234567", version: VERSION, values: v })).toMatchObject({ ok: true });
    expect(s.audit[0]!.meta).not.toHaveProperty("rewordedWithResults");
  });

  it("a locked meaning is refused before any wording question", async () => {
    s.protocol = withResults();
    const v = values({ steps: [{ ...values().steps[0]!, textEn: "Remove gloves", weight: 3 }] });
    expect(await saveProtocol("en", "global", { id: "p1234567", version: VERSION, values: v })).toMatchObject({ ok: false, error: "step_locked" });
  });

  it("a title made only of invisible characters is required, and invisible characters are dropped from text", async () => {
    const blank = await saveProtocol("en", "global", { id: "p1234567", version: VERSION, values: values({ titleEn: "​​" }) });
    expect(blank).toMatchObject({ ok: false, error: "invalid_input", fieldErrors: { titleEn: expect.any(String) } });
    const r = await saveProtocol("en", "global", { id: "p1234567", version: VERSION, values: values({ titleEn: "Glove‮ use⁦" }) });
    expect(r).toMatchObject({ ok: true });
    expect(ops("protocol.updateMany")[0]!.args).toMatchObject({ data: { titleEn: "Glove use" } });
  });

  it("records which steps changed and which were removed, without old texts for steps that have no results", async () => {
    const p = savedProtocol();
    (p.steps as unknown[]).push({ ...(p.steps as Array<Record<string, unknown>>)[0]!, id: "s-2", key: "old-step" });
    s.protocol = p;
    s.stepDeleteCount = 1;
    const v = values({ steps: [{ ...values().steps[0]!, weight: 2 }] });
    expect(await saveProtocol("en", "global", { id: "p1234567", version: VERSION, values: v })).toMatchObject({ ok: true });
    expect(s.audit[0]!.meta).toMatchObject({
      changedSteps: [{ id: "s-1", key: "wear-gloves", fields: ["weight"] }],
      removedSteps: [{ id: "s-2", key: "old-step" }],
    });
    expect((s.audit[0]!.meta as { changedSteps: Array<Record<string, unknown>> }).changedSteps[0]).not.toHaveProperty("before");
  });

  it("saves pasted text with control characters, without them", async () => {
    const r = await saveProtocol("en", "global", {
      id: "p1234567",
      version: VERSION,
      values: values({ titleEn: "Glove\u0000 use", steps: [{ ...values().steps[0]!, textEn: "Wear\u0000 gloves" }] }),
    });
    expect(r).toMatchObject({ ok: true });
    expect(ops("protocol.updateMany")[0]!.args).toMatchObject({ data: { titleEn: "Glove use" } });
    expect(ops("protocolStep.update")[0]!.args).toMatchObject({ data: { textEn: "Wear gloves" } });
  });
});

describe("createProtocol", () => {
  it("global: the admin's address, a draft, keys from the English text, an audit row", async () => {
    const r = await createProtocol("ar", "global", values({ slug: "glove-use" }));
    expect(r).toEqual({ ok: true, id: "new-protocol-1" });
    const data = (ops("protocol.create")[0]!.args as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ slug: "glove-use", organizationId: null, isPublished: false, createdById: "u-1" });
    expect((data.steps as { create: Array<{ key: string }> }).create.map((st) => st.key)).toEqual(["wear-gloves", "take-them-off-safely"]);
    expect(s.audit[0]).toMatchObject({ action: "protocol.create", inTx: true });
  });

  it("global: a taken address comes back as a field error", async () => {
    s.createError = Object.assign(new Error("unique"), { code: "P2002" });
    expect(await createProtocol("ar", "global", values({ slug: "glove-use" }))).toMatchObject({
      ok: false,
      error: "slug_taken",
      fieldErrors: { slug: "[slugTaken]" },
    });
  });

  it("institution: a generated address in the active institution, within the limit", async () => {
    const r = await createProtocol("ar", "institution", values());
    expect(r).toMatchObject({ ok: true });
    const data = (ops("protocol.create")[0]!.args as { data: Record<string, unknown> }).data;
    expect(data.organizationId).toBe("org-1");
    expect(String(data.slug)).toMatch(/^glove-use-[a-z0-9]{6}$/);
    s.count = 200;
    expect(await createProtocol("ar", "institution", values())).toMatchObject({ error: "limit" });
  });

  it("institution: counts under a per-institution lock, so parallel creates cannot pass the cap", async () => {
    await createProtocol("ar", "institution", values());
    const order = s.calls.map((c) => c.op).filter((op) => op === "$executeRaw" || op === "protocol.count" || op === "protocol.create");
    expect(order).toEqual(["$executeRaw", "protocol.count", "protocol.create"]);
    const lock = ops("$executeRaw")[0]!.args as { sql: string; values: unknown[] };
    expect(lock.sql).toContain("pg_advisory_xact_lock");
    expect(lock.values).toEqual(["org-1"]);
  });
});

describe("setProtocolPublished", () => {
  it("publishes complete content with an audit row; the same state twice is a no-op", async () => {
    expect(await setProtocolPublished("ar", "global", { id: "p1234567", version: VERSION, publish: true })).toMatchObject({ ok: true });
    expect(s.audit.map((a) => a.action)).toEqual(["protocol.publish"]);
    s.audit = [];
    s.protocol = savedProtocol({ isPublished: true });
    expect(await setProtocolPublished("ar", "global", { id: "p1234567", publish: true })).toMatchObject({ ok: true, isPublished: true });
    expect(s.audit).toEqual([]);
  });

  it("refuses a stale version and incomplete content", async () => {
    expect(await setProtocolPublished("ar", "global", { id: "p1234567", version: "2026-10-28T10:00:00.000Z", publish: true })).toMatchObject({
      error: "conflict",
    });
    s.protocol = savedProtocol({ steps: [] });
    expect(await setProtocolPublished("ar", "global", { id: "p1234567", publish: true })).toMatchObject({ error: "invalid_input" });
    expect(s.audit).toEqual([]);
  });

  it("unpublishes with its own audit action", async () => {
    s.protocol = savedProtocol({ isPublished: true });
    expect(await setProtocolPublished("ar", "global", { id: "p1234567", publish: false })).toMatchObject({ ok: true });
    expect(s.audit.map((a) => a.action)).toEqual(["protocol.unpublish"]);
  });
});

describe("deleteProtocolDraft", () => {
  it("deletes an unused draft; refuses published ones and ones with history", async () => {
    expect(await deleteProtocolDraft("ar", "global", { id: "p1234567" })).toEqual({ ok: true });
    expect(s.audit.map((a) => a.action)).toEqual(["protocol.delete"]);
    s.audit = [];
    s.protocol = savedProtocol({ isPublished: true });
    expect(await deleteProtocolDraft("ar", "global", { id: "p1234567" })).toMatchObject({ error: "published" });
    s.protocol = savedProtocol({ _count: { scans: 0, scenarios: 1, copies: 0 } });
    expect(await deleteProtocolDraft("ar", "global", { id: "p1234567" })).toMatchObject({ error: "has_history" });
    s.protocol = savedProtocol();
    s.deleteCount = 0; // something appeared between the check and the delete
    expect(await deleteProtocolDraft("ar", "global", { id: "p1234567" })).toMatchObject({ error: "has_history" });
    expect(s.audit).toEqual([]);
  });
});

describe("copyGlobalProtocol", () => {
  it("copies a published global protocol into the active institution as a draft", async () => {
    s.sourceRow = savedProtocol({ id: "g-1", slug: "sharps-safety", isPublished: true });
    const r = await copyGlobalProtocol("ar", { sourceProtocolId: "g1234567" });
    expect(r).toEqual({ ok: true, id: "new-protocol-1" });
    const data = (ops("protocol.create")[0]!.args as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ organizationId: "org-1", sourceProtocolId: "g-1", isPublished: false });
    expect(String(data.slug)).toMatch(/^sharps-safety-[a-z0-9]{6}$/);
    expect((data.steps as { create: Array<{ key: string; order: number }> }).create).toMatchObject([{ key: "wear-gloves", order: 1 }]);
    expect(s.audit[0]).toMatchObject({ action: "protocol.copy", meta: { sourceProtocolId: "g-1", organizationId: "org-1" }, inTx: true });
  });

  it("refuses sources that are not published global protocols", async () => {
    s.sourceRow = null;
    expect(await copyGlobalProtocol("ar", { sourceProtocolId: "g1234567" })).toMatchObject({ error: "source_unavailable" });
    expect(ops("protocol.create")).toEqual([]);
  });
});

describe("createProtocolVersion", () => {
  it("copies the protocol under the next free -v<n> address and records where it came from", async () => {
    s.protocol = savedProtocol({ slug: "glove-use", isPublished: true });
    s.takenSlugs = [{ slug: "glove-use" }, { slug: "glove-use-v2" }];
    const r = await createProtocolVersion("ar", "global", { id: "p1234567" });
    expect(r).toEqual({ ok: true, id: "new-protocol-1" });
    const data = (ops("protocol.create")[0]!.args as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ slug: "glove-use-v3", organizationId: null, isPublished: false });
    expect(s.audit[0]).toMatchObject({ action: "protocol.version", meta: { fromProtocolId: "p-1", fromSlug: "glove-use" } });
  });
});
