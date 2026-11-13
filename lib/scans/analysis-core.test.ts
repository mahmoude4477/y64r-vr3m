import { describe, expect, it } from "vitest";
import { analysisGate, statusAfterFailure, stepResultUpdates } from "./analysis-core";
import { ANALYSIS_STALE_MS } from "./constants";

describe("stepResultUpdates", () => {
  it("maps each verdict to its ScanStepResult fields", () => {
    expect(
      stepResultUpdates([
        { stepId: "s1", verdict: "compliant", confidence: 0.91234, evidenceAr: " الغطاء مغلق ", evidenceEn: "Lid closed" },
        { stepId: "s2", verdict: "not_visible", confidence: 1.7, evidenceAr: "", evidenceEn: "   " },
        { stepId: "s3", verdict: "non_compliant", confidence: Number.NaN, evidenceAr: "x", evidenceEn: "y" },
      ]),
    ).toEqual([
      { stepId: "s1", aiVerdict: "compliant", aiConfidence: 0.912, evidenceAr: "الغطاء مغلق", evidenceEn: "Lid closed" },
      { stepId: "s2", aiVerdict: "not_visible", aiConfidence: 1, evidenceAr: null, evidenceEn: null },
      { stepId: "s3", aiVerdict: "non_compliant", aiConfidence: 0, evidenceAr: "x", evidenceEn: "y" },
    ]);
  });

  it("caps very long evidence", () => {
    const [r] = stepResultUpdates([{ stepId: "s", verdict: "compliant", confidence: 0.5, evidenceAr: "a".repeat(5000), evidenceEn: "b" }]);
    expect(r.evidenceAr).toHaveLength(1000);
    expect(r.evidenceAr?.endsWith("…")).toBe(true);
  });
});

describe("analysisGate", () => {
  const now = new Date("2026-10-29T10:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("lets draft and failed scans be analysed", () => {
    expect(analysisGate({ status: "draft", updatedAt: now }, now)).toEqual({ ok: true, previous: "draft" });
    expect(analysisGate({ status: "failed", updatedAt: now }, now)).toEqual({ ok: true, previous: "failed" });
  });

  it("refuses a running, reviewed or finalised scan", () => {
    expect(analysisGate({ status: "analyzing", updatedAt: ago(10_000) }, now)).toMatchObject({ ok: false, status: 409, error: "analysis_running" });
    expect(analysisGate({ status: "review", updatedAt: now }, now)).toMatchObject({ ok: false, error: "already_analyzed" });
    expect(analysisGate({ status: "finalized", updatedAt: now }, now)).toMatchObject({ ok: false, error: "finalized" });
  });

  it("takes over a scan stuck in analyzing (a crashed request)", () => {
    expect(analysisGate({ status: "analyzing", updatedAt: ago(ANALYSIS_STALE_MS + 1) }, now)).toEqual({ ok: true, previous: "failed" });
  });
});

describe("statusAfterFailure", () => {
  it("puts the scan back when no model call happened, else marks it failed", () => {
    for (const code of ["not_configured", "daily_limit", "too_many_requests"]) {
      expect(statusAfterFailure(code, "draft")).toBe("draft");
      expect(statusAfterFailure(code, "failed")).toBe("failed");
    }
    for (const code of ["refused", "timeout", "overloaded", "invalid_output", "unknown"]) {
      expect(statusAfterFailure(code, "draft")).toBe("failed");
    }
  });
});
