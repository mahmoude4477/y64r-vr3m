import { describe, expect, it } from "vitest";
import {
  AI_ERROR_CODES,
  AI_PENDING_STALE_MS,
  aiCallState,
  aiCallWhere,
  aiErrorCodeKey,
  aiTargetHref,
  parseAiCallFilters,
  settingSource,
} from "./ai-display";

const NOW = new Date("2026-10-29T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("AI call display", () => {
  it("splits pending calls into running and stalled (same window as the in-flight limit)", () => {
    expect(aiCallState({ status: "pending", createdAt: ago(60_000) }, NOW)).toBe("running");
    expect(aiCallState({ status: "pending", createdAt: ago(AI_PENDING_STALE_MS) }, NOW)).toBe("running");
    expect(aiCallState({ status: "pending", createdAt: ago(AI_PENDING_STALE_MS + 1) }, NOW)).toBe("stalled");
    expect(aiCallState({ status: "ok", createdAt: ago(10 * AI_PENDING_STALE_MS) }, NOW)).toBe("ok");
    expect(aiCallState({ status: "refused", createdAt: NOW }, NOW)).toBe("refused");
    expect(aiCallState({ status: "error", createdAt: NOW }, NOW)).toBe("error");
  });

  it("knows every error code of lib/ai/errors.ts and shows anything else as unknown", () => {
    for (const code of AI_ERROR_CODES) expect(aiErrorCodeKey(code)).toBe(code);
    expect(aiErrorCodeKey(null)).toBeNull();
    expect(aiErrorCodeKey("")).toBeNull();
    expect(aiErrorCodeKey("brand_new_code")).toBe("unknown");
  });

  it("links scan and attempt targets to their admin pages", () => {
    expect(aiTargetHref("scan", "s1")).toBe("/admin/assessments/scans/s1");
    expect(aiTargetHref("simulation_attempt", "a1")).toBe("/admin/assessments/attempts/a1");
    expect(aiTargetHref("scan", null)).toBeNull();
    expect(aiTargetHref("report", "r1")).toBeNull();
  });

  it("names where a setting comes from", () => {
    expect(settingSource(true, true)).toBe("panel");
    expect(settingSource(false, true)).toBe("environment");
    expect(settingSource(false, false)).toBe("default");
  });
});

describe("AI call filters", () => {
  it("parses the URL", () => {
    expect(parseAiCallFilters({})).toEqual({ status: "all", kind: "all", org: "", page: 1 });
    expect(parseAiCallFilters({ status: "stalled", kind: "scan_analysis", org: "o1", page: "2" })).toEqual({
      status: "stalled",
      kind: "scan_analysis",
      org: "o1",
      page: 2,
    });
    expect(parseAiCallFilters({ status: "pending", kind: "chat", org: "all" })).toEqual({ status: "all", kind: "all", org: "", page: 1 });
  });

  it("builds the where-clause", () => {
    const stale = new Date(NOW.getTime() - AI_PENDING_STALE_MS);
    expect(aiCallWhere({ status: "all", kind: "all", org: "" }, NOW)).toEqual({});
    expect(aiCallWhere({ status: "failed", kind: "all", org: "" }, NOW)).toEqual({
      AND: [{ OR: [{ status: { in: ["error", "refused"] } }, { status: "pending", createdAt: { lt: stale } }] }],
    });
    expect(aiCallWhere({ status: "running", kind: "simulation_debrief", org: "o1" }, NOW)).toEqual({
      AND: [{ status: "pending", createdAt: { gte: stale } }, { kind: "simulation_debrief" }, { organizationId: "o1" }],
    });
    expect(aiCallWhere({ status: "stalled", kind: "all", org: "" }, NOW)).toEqual({ AND: [{ status: "pending", createdAt: { lt: stale } }] });
    expect(aiCallWhere({ status: "ok", kind: "all", org: "" }, NOW)).toEqual({ AND: [{ status: "ok" }] });
  });
});
