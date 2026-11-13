import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/authz";

/**
 * The AI debrief of an attempt: the facts are loaded for the OWNER only (attemptsOwn), in the rule-based priority
 * order, and the route never reaches the model for anybody else, for a bad body, or when a debrief is stored.
 */

const state = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  authorize: vi.fn(),
  stream: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { simulationAttempt: { findFirst: state.findFirst, updateMany: state.updateMany } },
}));
vi.mock("@/lib/session", () => ({ authorizeApi: state.authorize }));
vi.mock("@/lib/ai/debrief", () => ({ streamDebrief: state.stream }));

const { debriefContext, saveDebrief, MAX_DEBRIEF_CHARS } = await import("./debrief");
const { POST } = await import("@/app/api/simulations/attempts/[id]/debrief/route");

const scope: Scope = { userId: "u1", organizationId: "org1", orgRole: "trainee", isPlatformAdmin: false };

function step(id: string, order: number, extra: Partial<{ isCritical: boolean; isMandatory: boolean; weight: number }> = {}) {
  return {
    id,
    order,
    textAr: `خطوة ${id}`,
    textEn: `Step ${id}`,
    rationaleAr: `لأن ${id}`,
    rationaleEn: `Because ${id}`,
    weight: extra.weight ?? 1,
    isMandatory: extra.isMandatory ?? false,
    isCritical: extra.isCritical ?? false,
  };
}

const attemptRow = {
  organizationId: "org1",
  score: 40,
  riskLevel: "high",
  debriefAr: null,
  debriefEn: null,
  scenario: { titleAr: "سيناريو", titleEn: "Scenario", protocol: { titleAr: "بروتوكول", titleEn: "Protocol" } },
  stepResults: [
    { compliant: false, critical: false, step: step("optional", 1) },
    { compliant: true, critical: false, step: step("done", 2) },
    { compliant: false, critical: true, step: step("recap", 3) },
    { compliant: false, critical: false, step: step("mandatory", 4, { isMandatory: true }) },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  state.findFirst.mockResolvedValue(attemptRow);
  state.updateMany.mockResolvedValue({ count: 1 });
  state.authorize.mockResolvedValue({
    ok: true,
    ctx: { user: { id: "u1" }, organizationId: "org1", orgRole: "trainee", isPlatformAdmin: false },
  });
  state.stream.mockResolvedValue({ ok: true, response: new Response("streamed") });
});

describe("debriefContext", () => {
  it("reads the caller's own completed attempt only", async () => {
    await debriefContext(scope, "a1", "en");
    const where = state.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ AND: [{ id: "a1", status: "completed" }, { userId: "u1" }] });
  });

  it("lists violations critical first, then mandatory, with strengths, in the requested language", async () => {
    const ctx = await debriefContext(scope, "a1", "en");
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return;
    expect(ctx.stored).toBeNull();
    expect(ctx.organizationId).toBe("org1");
    expect(ctx.facts).toMatchObject({ locale: "en", scenarioTitle: "Scenario", protocolTitle: "Protocol", score: 40, riskLevel: "high" });
    expect(ctx.facts.violations).toEqual([
      { step: "Step recap", rationale: "Because recap", critical: true },
      { step: "Step mandatory", rationale: "Because mandatory", critical: false },
      { step: "Step optional", rationale: "Because optional", critical: false },
    ]);
    expect(ctx.facts.strengths).toEqual(["Step done"]);
  });

  it("returns a stored debrief of that language, and refuses missing or unscored attempts", async () => {
    state.findFirst.mockResolvedValueOnce({ ...attemptRow, debriefAr: "ملخص محفوظ" });
    const stored = await debriefContext(scope, "a1", "ar");
    expect(stored.ok && stored.stored).toBe("ملخص محفوظ");

    state.findFirst.mockResolvedValueOnce(null);
    expect(await debriefContext(scope, "a1", "ar")).toEqual({ ok: false, error: "not_found", status: 404 });

    state.findFirst.mockResolvedValueOnce({ ...attemptRow, score: null, riskLevel: null });
    expect(await debriefContext(scope, "a1", "ar")).toEqual({ ok: false, error: "not_assessable", status: 422 });
  });

  it("writes no new debrief for an attempt of an institution that is not the active one, but reads a stored one", async () => {
    // Made in org2; the owner has left it (or switched): no model call logged for org2, no text stored on its attempt.
    state.findFirst.mockResolvedValueOnce({ ...attemptRow, organizationId: "org2" });
    expect(await debriefContext(scope, "a1", "en")).toEqual({ ok: false, error: "not_found", status: 404 });
    state.findFirst.mockResolvedValueOnce({ ...attemptRow, organizationId: "org2", debriefEn: "Stored." });
    expect(await debriefContext(scope, "a1", "en")).toMatchObject({ ok: true, stored: "Stored." });
    // An attempt of no institution is the user's own wherever they are.
    state.findFirst.mockResolvedValueOnce({ ...attemptRow, organizationId: null });
    expect(await debriefContext(scope, "a1", "en")).toMatchObject({ ok: true, stored: null });
  });
});

describe("saveDebrief", () => {
  it("stores the trimmed text in its language column, for the owner only, and skips empty text", async () => {
    await saveDebrief(scope, "a1", "en", `  ${"x".repeat(MAX_DEBRIEF_CHARS + 10)}  `);
    const args = state.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ AND: [{ id: "a1" }, { userId: "u1" }, { OR: [{ organizationId: null }, { organizationId: "org1" }] }] });
    expect(args.data).toEqual({ debriefEn: "x".repeat(MAX_DEBRIEF_CHARS) });

    await saveDebrief(scope, "a1", "ar", "   ");
    expect(state.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/simulations/attempts/[id]/debrief", () => {
  const call = (body: unknown, id = "a1", headers: Record<string, string> = { "content-type": "application/json" }) =>
    POST(
      new Request("http://127.0.0.1/api/simulations/attempts/a1/debrief", {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) } as never,
    );

  it("answers the auth response for guests, without reading anything", async () => {
    state.authorize.mockResolvedValueOnce({ ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) });
    const res = await call({ locale: "ar" });
    expect(res.status).toBe(401);
    expect(state.findFirst).not.toHaveBeenCalled();
  });

  it("refuses a bad body or id before any read", async () => {
    expect((await call("not json")).status).toBe(400);
    expect((await call({ locale: "fr" })).status).toBe(400);
    expect((await call({ locale: "ar" }, "x".repeat(65))).status).toBe(404);
    expect(state.findFirst).not.toHaveBeenCalled();
    expect(state.stream).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON (415) or is too large (413) before parsing it or reaching the database", async () => {
    // A cross-site form can post text/plain without a CORS preflight; the route only takes application/json.
    const plain = await call(JSON.stringify({ locale: "ar" }), "a1", { "content-type": "text/plain" });
    expect(plain.status).toBe(415);
    expect(await plain.json()).toEqual({ error: "unsupported_media_type" });
    // A huge body (the debrief needs a few dozen bytes) is refused, whatever its declared length.
    const big = await call({ locale: "ar", pad: "a".repeat(10_000) });
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: "too_large" });
    expect(state.findFirst).not.toHaveBeenCalled();
    expect(state.stream).not.toHaveBeenCalled();
  });

  it("is not found for an attempt that is not the caller's own", async () => {
    state.findFirst.mockResolvedValueOnce(null);
    const res = await call({ locale: "en" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(state.stream).not.toHaveBeenCalled();
  });

  it("streams a stored debrief back without a model call", async () => {
    state.findFirst.mockResolvedValueOnce({ ...attemptRow, debriefEn: "Stored summary." });
    const res = await call({ locale: "en" });
    expect(res.ok).toBe(true);
    expect(await res.text()).toContain("Stored summary.");
    expect(state.stream).not.toHaveBeenCalled();
  });

  it("asks the model for the owner and stores the text when it completes", async () => {
    const res = await call({ locale: "en" });
    expect(await res.text()).toBe("streamed");
    const input = state.stream.mock.calls[0][0];
    expect(input).toMatchObject({ locale: "en", userId: "u1", organizationId: "org1", attemptId: "a1", score: 40 });
    await input.onComplete("A short summary.");
    expect(state.updateMany.mock.calls[0][0].data).toEqual({ debriefEn: "A short summary." });
  });

  it("passes an AI failure through as JSON with its status", async () => {
    state.stream.mockResolvedValueOnce({ ok: false, code: "not_configured", retryable: false, status: 503 });
    const res = await call({ locale: "ar" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
  });
});
