import { describe, expect, it } from "vitest";
import { scanStepDecision } from "./scan-decision";

describe("scanStepDecision (read-only scan report)", () => {
  it("on a finalised scan, an AI verdict the examiner left alone is the accepted decision, never 'not decided'", () => {
    // The case the review found: a critical non-compliant step that drove the High risk.
    expect(scanStepDecision({ finalized: true, aiVerdict: "non_compliant", finalVerdict: null })).toEqual({
      kind: "aiAccepted",
      verdict: "non_compliant",
    });
    expect(scanStepDecision({ finalized: true, aiVerdict: "compliant", finalVerdict: null })).toEqual({ kind: "aiAccepted", verdict: "compliant" });
  });

  it("says 'answered' (not 'changed') for a step the AI gave no verdict on", () => {
    expect(scanStepDecision({ finalized: true, aiVerdict: null, finalVerdict: "compliant" })).toEqual({
      kind: "examiner",
      verdict: "compliant",
      relation: "answered",
    });
    expect(scanStepDecision({ finalized: true, aiVerdict: "not_visible", finalVerdict: "not_applicable" })).toMatchObject({ relation: "answered" });
  });

  it("tells a confirmed AI verdict from a changed one", () => {
    expect(scanStepDecision({ finalized: true, aiVerdict: "compliant", finalVerdict: "compliant" })).toMatchObject({ relation: "confirmed" });
    expect(scanStepDecision({ finalized: true, aiVerdict: "compliant", finalVerdict: "non_compliant" })).toMatchObject({ relation: "changed" });
    expect(scanStepDecision({ finalized: false, aiVerdict: "non_compliant", finalVerdict: "not_applicable" })).toMatchObject({
      kind: "examiner",
      relation: "changed",
    });
  });

  it("is pending only before finalisation, and unresolved when nothing usable was answered", () => {
    expect(scanStepDecision({ finalized: false, aiVerdict: "compliant", finalVerdict: null })).toEqual({ kind: "pending" });
    expect(scanStepDecision({ finalized: false, aiVerdict: null, finalVerdict: null })).toEqual({ kind: "pending" });
    expect(scanStepDecision({ finalized: true, aiVerdict: "not_visible", finalVerdict: null })).toEqual({ kind: "unresolved" });
    expect(scanStepDecision({ finalized: true, aiVerdict: null, finalVerdict: null })).toEqual({ kind: "unresolved" });
  });
});
