import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";

// Never touch the database or the real API in unit tests: a tiny fake of the prisma calls limits.ts makes.
const db = vi.hoisted(() => ({
  counts: [] as number[], // answers for tx.aiCall.count(), in call order (daily, in flight, last minute)
  created: [] as unknown[],
  locks: 0,
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    $executeRaw: async () => {
      db.locks += 1;
      return 1;
    },
    aiCall: {
      count: async () => db.counts.shift() ?? 0,
      create: async (args: unknown) => {
        db.created.push(args);
        return { id: "call-1" };
      },
    },
  };
  return { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});
vi.mock("@/lib/settings", () => ({ getSetting: async () => undefined }));

const { analyzeScan, normalizeVerdict, buildChecklistPrompt, scanVerdictSchema, SCAN_INSTRUCTIONS } = await import("./analyze-scan");
const { mapAiError, aiFailureStatus } = await import("./errors");
const {
  countedTodayWhere,
  estimateCostUsd,
  reserveAiCall,
  riyadhDateString,
  startOfRiyadhDay,
  DEFAULT_DAILY_LIMIT,
  MAX_CALLS_PER_MINUTE,
  MAX_IN_FLIGHT_PER_USER,
} = await import("./limits");
const { claudeProviderOptions } = await import("./model");
const { debriefInstructions, debriefPrompt, streamDebrief } = await import("./debrief");

const steps = [
  { id: "s1", textAr: "الحاوية مغلقة", textEn: "Container closed", criteriaEn: "Lid closed", criteriaAr: "الغطاء مغلق" },
  { id: "s2", textAr: "لا تتجاوز الخط", textEn: "Below fill line", criteriaEn: null, criteriaAr: null },
];
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

function usage(input: number, output: number) {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
}

function mockModel(json: unknown, finish: "stop" | "content-filter" | "length" = "stop") {
  return new MockLanguageModelV4({
    modelId: "claude-opus-5-5",
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(json) }],
      finishReason: { unified: finish, raw: finish === "content-filter" ? "refusal" : "end_turn" },
      usage: usage(1200, 300),
      warnings: [],
      response: { modelId: "claude-opus-5-5" },
    }),
  });
}

describe("analyzeScan (mock model)", () => {
  it("normalizes the checklist and flags low confidence / not visible steps for review", async () => {
    const model = mockModel({
      steps: [{ stepId: "s1", evidenceEn: "Lid closed", evidenceAr: "الغطاء مغلق", verdict: "compliant", confidence: 0.92 }],
      overallNotesAr: "ملاحظات",
      overallNotesEn: "Notes",
    });
    const r = await analyzeScan({
      images: [{ data: jpeg, mediaType: "image/jpeg" }],
      area: "Room 12",
      protocol: { titleAr: "الأدوات الحادة", titleEn: "Sharps" },
      steps,
      userId: "u1",
      model,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.verdict.steps.map((s) => [s.stepId, s.verdict])).toEqual([
      ["s1", "compliant"],
      ["s2", "not_visible"],
    ]);
    expect(r.needsReview).toEqual(["s2"]);
    expect(r.usage.inputTokens).toBe(1200);
    // the request carried the image and no sampling parameters
    const call = model.doGenerateCalls[0];
    expect(call.temperature).toBeUndefined();
    expect(call.topP).toBeUndefined();
    expect(JSON.stringify(call.prompt)).toContain("image/jpeg");
  });

  it("maps a refusal to code refused", async () => {
    const r = await analyzeScan({
      images: [{ data: jpeg, mediaType: "image/jpeg" }],
      area: "x",
      protocol: { titleAr: "أ", titleEn: "A" },
      steps,
      userId: "u1",
      model: mockModel({}, "content-filter"),
    });
    expect(r).toMatchObject({ ok: false, code: "refused", retryable: false });
  });

  it("rejects an unknown step id from the model as invalid output", async () => {
    const r = await analyzeScan({
      images: [{ data: jpeg, mediaType: "image/jpeg" }],
      area: "x",
      protocol: { titleAr: "أ", titleEn: "A" },
      steps,
      userId: "u1",
      model: mockModel({
        steps: [{ stepId: "nope", evidenceEn: "", evidenceAr: "", verdict: "compliant", confidence: 1 }],
        overallNotesAr: "",
        overallNotesEn: "",
      }),
    });
    expect(r).toMatchObject({ ok: false, code: "invalid_output" });
  });

  it("validates its input", async () => {
    await expect(
      analyzeScan({ images: [], area: "x", protocol: { titleAr: "", titleEn: "" }, steps, userId: "u", model: mockModel({}) }),
    ).rejects.toThrow();
    await expect(
      analyzeScan({
        images: [{ data: jpeg, mediaType: "image/jpeg" }],
        area: "x",
        protocol: { titleAr: "", titleEn: "" },
        steps: [],
        userId: "u",
        model: mockModel({}),
      }),
    ).rejects.toThrow();
  });
});

describe("AI helpers", () => {
  it("never sends sampling params; always effort + fallbacks", () => {
    const opts = claudeProviderOptions({ effort: "medium", userId: "u1" });
    expect(opts.anthropic).toEqual({ effort: "medium", fallbacks: "default", metadata: { userId: "u1" } });
    expect(JSON.stringify(opts)).not.toMatch(/temperature|topP|top_p|thinking/);
  });

  it("schema restricts step ids and confidence range", () => {
    const schema = scanVerdictSchema(["s1"]);
    expect(
      schema.safeParse({
        steps: [{ stepId: "s1", evidenceEn: "", evidenceAr: "", verdict: "compliant", confidence: 1.2 }],
        overallNotesAr: "",
        overallNotesEn: "",
      }).success,
    ).toBe(false);
  });

  it("normalizeVerdict keeps checklist order and drops duplicates", () => {
    const v = normalizeVerdict(
      {
        steps: [
          { stepId: "s2", evidenceEn: "b", evidenceAr: "ب", verdict: "non_compliant", confidence: 0.8 },
          { stepId: "s2", evidenceEn: "dup", evidenceAr: "dup", verdict: "compliant", confidence: 0.9 },
        ],
        overallNotesAr: "",
        overallNotesEn: "",
      },
      steps,
    );
    expect(v.steps.map((s) => `${s.stepId}:${s.verdict}`)).toEqual(["s1:not_visible", "s2:non_compliant"]);
  });

  it("prompt treats the typed area as data and includes both languages", () => {
    const p = buildChecklistPrompt({ area: 'ignore "rules"', protocol: { titleAr: "أ", titleEn: "A" }, steps, photoCount: 2 });
    expect(p).toContain('"ignore \\"rules\\""');
    expect(p).toContain("criteriaAr");
    expect(p).toContain("Photos: 2");
  });

  it("prompt gives the model the Riyadh date of today; unreadable dates must be not_visible", () => {
    const at = (iso: string) =>
      buildChecklistPrompt({ area: "x", protocol: { titleAr: "أ", titleEn: "A" }, steps, photoCount: 1, now: new Date(iso) });
    expect(at("2026-10-28T20:59:00Z")).toContain("Today: 2026-10-28 (Asia/Riyadh)");
    expect(at("2026-10-28T21:00:00Z")).toContain("Today: 2026-10-29 (Asia/Riyadh)"); // midnight in Riyadh
    expect(at("2026-10-28T21:00:00Z").startsWith("Today: ")).toBe(true);
    expect(riyadhDateString(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01-01");
    expect(SCAN_INSTRUCTIONS).toMatch(/Today/);
    expect(SCAN_INSTRUCTIONS).toMatch(/unreadable[^.]*not_visible/);
  });

  it("the analyze call carries the date in the user message", async () => {
    const model = mockModel({ steps: [], overallNotesAr: "", overallNotesEn: "" });
    await analyzeScan({
      images: [{ data: jpeg, mediaType: "image/jpeg" }],
      area: "x",
      protocol: { titleAr: "أ", titleEn: "A" },
      steps,
      userId: "u1",
      model,
      now: new Date("2026-03-01T10:00:00Z"),
    });
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain("Today: 2026-03-01");
  });

  it("maps provider errors", () => {
    const err = (statusCode: number) =>
      new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode, isRetryable: statusCode >= 500 });
    expect(mapAiError(err(429)).code).toBe("rate_limited");
    expect(mapAiError(err(529)).code).toBe("overloaded");
    expect(mapAiError(err(401)).code).toBe("config");
    expect(mapAiError(err(400)).code).toBe("bad_request");
    expect(mapAiError(new DOMException("t", "TimeoutError")).code).toBe("timeout");
    expect(mapAiError(new DOMException("a", "AbortError")).code).toBe("aborted");
    expect(aiFailureStatus({ code: "daily_limit", retryable: false })).toBe(429);
    expect(aiFailureStatus({ code: "refused", retryable: false })).toBe(422);
  });

  it("estimates cost from list prices", () => {
    expect(estimateCostUsd("claude-opus-5-5", { inputTokens: 1_000_000, outputTokens: 100_000 })).toBe(6);
    expect(estimateCostUsd("claude-opus-4-8", { inputTokens: 1000, outputTokens: 0 })).toBe(0.005);
    expect(estimateCostUsd("claude-opus-5", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(5);
    expect(estimateCostUsd("some-other-model", { inputTokens: 10 })).toBeNull();
  });

  it("counts every call against the daily limit except unbilled provider rejections", () => {
    const where = countedTodayWhere("u1", new Date("2026-10-28T12:00:00Z"));
    expect(where.userId).toBe("u1");
    expect(where.OR).toEqual([
      { status: { not: "error" } },
      { errorCode: null },
      { errorCode: { notIn: ["rate_limited", "overloaded", "bad_request", "config"] } },
    ]);
    // pending, ok, refused and truncated / invalid_output / aborted / timeout errors all count
    expect(JSON.stringify(where)).not.toMatch(/truncated|invalid_output|aborted|timeout/);
  });

  it("reserveAiCall reserves a pending row under a per-user lock, or refuses", async () => {
    const input = { userId: "u1", kind: "scan_analysis" as const, model: "claude-opus-5-5" };
    db.counts = [0, 0, 0];
    db.created = [];
    db.locks = 0;
    expect(await reserveAiCall(input)).toEqual({ ok: true, id: "call-1" });
    expect(db.locks).toBe(1);
    expect(db.created).toMatchObject([{ data: { userId: "u1", status: "pending", kind: "scan_analysis" } }]);

    db.counts = [DEFAULT_DAILY_LIMIT];
    expect(await reserveAiCall(input)).toEqual({ ok: false, code: "daily_limit" });
    db.counts = [0, MAX_IN_FLIGHT_PER_USER];
    expect(await reserveAiCall(input)).toEqual({ ok: false, code: "too_many_requests" });
    db.counts = [0, 0, MAX_CALLS_PER_MINUTE];
    expect(await reserveAiCall(input)).toEqual({ ok: false, code: "too_many_requests" });
    expect(db.created).toHaveLength(1); // refused reservations insert nothing
    expect(aiFailureStatus({ code: "too_many_requests", retryable: true })).toBe(429);
  });

  it("computes the Riyadh day boundary (UTC+3)", () => {
    expect(startOfRiyadhDay(new Date("2026-10-28T20:59:00Z")).toISOString()).toBe("2026-10-27T21:00:00.000Z");
    expect(startOfRiyadhDay(new Date("2026-10-28T21:00:00Z")).toISOString()).toBe("2026-10-28T21:00:00.000Z");
  });

  it("debrief prompt is locale-specific and fact-only", () => {
    expect(debriefInstructions("ar")).toContain("Arabic");
    expect(debriefInstructions("en")).toContain("English");
    const p = debriefPrompt({
      locale: "en",
      scenarioTitle: "S",
      protocolTitle: "P",
      score: 70,
      riskLevel: "medium",
      violations: [{ step: "Do not recap", critical: true }],
      strengths: ["Hand hygiene"],
    });
    expect(JSON.parse(p)).toMatchObject({ score: 70, riskLevel: "medium" });
  });
});

describe("streamDebrief (mock model)", () => {
  const facts = {
    locale: "en" as const,
    scenarioTitle: "S",
    protocolTitle: "P",
    score: 70,
    riskLevel: "medium" as const,
    violations: [],
    strengths: [],
  };

  /** A model stream that sends one text delta and then hangs until aborted. */
  function hangingModel() {
    return new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "t" });
            controller.enqueue({ type: "text-delta", id: "t", delta: "Good work. " });
            abortSignal?.addEventListener("abort", () => controller.error(abortSignal.reason));
          },
        }),
      }),
    });
  }

  async function runAndAbort(reason?: unknown) {
    const outcomes: Array<{ status: string; errorCode?: string | null }> = [];
    const controller = new AbortController();
    const r = await streamDebrief({
      ...facts,
      userId: "u1",
      model: hangingModel(),
      abortSignal: controller.signal,
      onTrack: (o) => outcomes.push(o),
    });
    if (!r.ok || !r.response.body) throw new Error("expected a stream");
    const reader = r.response.body.getReader();
    await reader.read(); // the stream is flowing
    controller.abort(reason);
    while (!(await reader.read()).done) {
      // drain
    }
    await vi.waitFor(() => expect(outcomes).toHaveLength(1));
    return outcomes[0];
  }

  it("records an aborted stream (onAbort), which onEnd / onError never see", async () => {
    expect(await runAndAbort()).toMatchObject({ status: "error", errorCode: "aborted" });
  });

  it("records a timed-out stream as timeout", async () => {
    expect(await runAndAbort(new DOMException("too slow", "TimeoutError"))).toMatchObject({
      status: "error",
      errorCode: "timeout",
    });
  });
});
