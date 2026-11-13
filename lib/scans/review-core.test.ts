import { describe, expect, it } from "vitest";
import { ANALYSIS_STALE_MS } from "./constants";
import {
  aiNeedsReview,
  confidenceLevel,
  decisionFields,
  deleteGate,
  effectiveStatus,
  finalizePlan,
  isReviewable,
  reportDecision,
  reportOutcome,
  riskReason,
  selectedVerdict,
  stepReviewState,
} from "./review-core";

const now = new Date("2026-10-29T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

// The sharps-safety shape: critical + mandatory, visual and non-visual steps, weights 3 / 2.
const steps = [
  { id: "recap", weight: 3, isMandatory: true, isCritical: true }, // non-visual
  { id: "dispose", weight: 3, isMandatory: true, isCritical: true }, // visual
  { id: "container", weight: 2, isMandatory: true, isCritical: false }, // visual
  { id: "fill", weight: 2, isMandatory: true, isCritical: false }, // visual
  { id: "carry", weight: 2, isMandatory: true, isCritical: false }, // non-visual
  { id: "label", weight: 1, isMandatory: false, isCritical: false }, // non-visual, optional
];

describe("effectiveStatus / isReviewable", () => {
  it("treats a crashed analysis as failed, a running one as running", () => {
    expect(effectiveStatus({ status: "analyzing", updatedAt: ago(ANALYSIS_STALE_MS + 1000) }, now)).toBe("failed");
    expect(effectiveStatus({ status: "analyzing", updatedAt: ago(1000) }, now)).toBe("analyzing");
    expect(effectiveStatus({ status: "review", updatedAt: ago(ANALYSIS_STALE_MS * 10) }, now)).toBe("review");
  });

  it("allows the review in draft, review and failed only", () => {
    expect(["draft", "review", "failed"].every((s) => isReviewable(s as "draft"))).toBe(true);
    expect(isReviewable("analyzing")).toBe(false);
    expect(isReviewable("finalized")).toBe(false);
  });
});

describe("decisionFields", () => {
  it("records who decided, a confirmation of the AI's own verdict included (the report says who checked it)", () => {
    expect(decisionFields("compliant", "u1")).toEqual({ finalVerdict: "compliant", overriddenById: "u1" });
    expect(decisionFields("not_applicable", "u1")).toEqual({ finalVerdict: "not_applicable", overriddenById: "u1" });
  });

  it("clears the decision and its author", () => {
    expect(decisionFields(null, "u1")).toEqual({ finalVerdict: null, overriddenById: null });
  });
});

describe("reportDecision", () => {
  const base = { aiVerdict: "compliant" as const, aiConfidence: 0.92, finalVerdict: "compliant" as const, decidedBy: null };
  it("tells a person's check from an AI verdict nobody looked at", () => {
    expect(reportDecision({ ...base, decidedBy: "Sara" })).toBe("confirmed");
    expect(reportDecision(base)).toBe("accepted");
    // Under the review threshold (0.6) and accepted by finalising: nobody checked it.
    expect(reportDecision({ ...base, aiConfidence: 0.55 })).toBe("acceptedUnsure");
    expect(reportDecision({ ...base, aiConfidence: 0.55, decidedBy: "Sara" })).toBe("confirmed");
  });

  it("names a change, a hand decision and a step without a result", () => {
    expect(reportDecision({ ...base, finalVerdict: "non_compliant", decidedBy: "Sara" })).toBe("changed");
    expect(reportDecision({ ...base, finalVerdict: "non_compliant" })).toBe("changed");
    expect(reportDecision({ ...base, aiVerdict: "not_visible", aiConfidence: 0.35, decidedBy: "Sara" })).toBe("decided");
    expect(reportDecision({ ...base, aiVerdict: null, aiConfidence: null, decidedBy: "Sara" })).toBe("decided");
    expect(reportDecision({ ...base, aiVerdict: "not_visible", finalVerdict: null })).toBe("none");
  });
});

describe("selectedVerdict / stepReviewState", () => {
  it("shows the examiner's verdict first, else a decisive AI verdict", () => {
    expect(selectedVerdict({ aiVerdict: "compliant", finalVerdict: null })).toBe("compliant");
    expect(selectedVerdict({ aiVerdict: "compliant", finalVerdict: "non_compliant" })).toBe("non_compliant");
    expect(selectedVerdict({ aiVerdict: "not_visible", finalVerdict: null })).toBeNull();
    expect(selectedVerdict({ aiVerdict: null, finalVerdict: null })).toBeNull();
  });

  it("names every state of a step", () => {
    expect(stepReviewState({ aiVerdict: "compliant", finalVerdict: null })).toBe("ai_accepted");
    expect(stepReviewState({ aiVerdict: "compliant", finalVerdict: "compliant" })).toBe("ai_confirmed");
    expect(stepReviewState({ aiVerdict: "compliant", finalVerdict: "not_applicable" })).toBe("changed");
    expect(stepReviewState({ aiVerdict: "not_visible", finalVerdict: "compliant" })).toBe("resolved");
    expect(stepReviewState({ aiVerdict: null, finalVerdict: "compliant" })).toBe("answered");
    expect(stepReviewState({ aiVerdict: "not_visible", finalVerdict: null })).toBe("unresolved");
    expect(stepReviewState({ aiVerdict: null, finalVerdict: null })).toBe("unanswered");
  });
});

describe("confidence", () => {
  it("uses the analysis threshold for low confidence", () => {
    expect(confidenceLevel(0.92)).toBe("high");
    expect(confidenceLevel(0.8)).toBe("high");
    expect(confidenceLevel(0.6)).toBe("medium");
    expect(confidenceLevel(0.55)).toBe("low");
    expect(aiNeedsReview("compliant", 0.55)).toBe(true);
    expect(aiNeedsReview("compliant", 0.92)).toBe(false);
    expect(aiNeedsReview("not_visible", 0.9)).toBe(true);
    expect(aiNeedsReview(null, null)).toBe(false);
  });
});

describe("finalizePlan", () => {
  it("refuses while a mandatory or critical step has no answer at all", () => {
    const plan = finalizePlan(steps, [
      { stepId: "dispose", aiVerdict: "compliant", finalVerdict: null },
      { stepId: "container", aiVerdict: "non_compliant", finalVerdict: null },
      { stepId: "fill", aiVerdict: "not_visible", finalVerdict: null },
      { stepId: "recap", aiVerdict: null, finalVerdict: null },
      { stepId: "carry", aiVerdict: null, finalVerdict: null },
      { stepId: "label", aiVerdict: null, finalVerdict: null },
    ]);
    // The optional step and the not-visible one do not block; the two unanswered mandatory steps do.
    expect(plan).toEqual({ ok: false, missing: ["recap", "carry"] });
  });

  it("scores with lib/scoring, writes accepted AI verdicts and keeps not-visible steps unresolved", () => {
    const plan = finalizePlan(steps, [
      { stepId: "recap", aiVerdict: null, finalVerdict: "compliant" },
      { stepId: "dispose", aiVerdict: "compliant", finalVerdict: null }, // accepted
      { stepId: "container", aiVerdict: "non_compliant", finalVerdict: "compliant" }, // overridden
      { stepId: "fill", aiVerdict: "not_visible", finalVerdict: null }, // unresolved
      { stepId: "carry", aiVerdict: null, finalVerdict: "non_compliant" },
      { stepId: "label", aiVerdict: null, finalVerdict: null }, // optional, unanswered
    ]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // applicable 3 + 3 + 2 + 2 = 10, compliant 8 -> 80 %, a mandatory step violated -> medium.
    expect(plan.score).toBe(80);
    expect(plan.riskLevel).toBe("medium");
    expect(plan.acceptAi).toEqual([{ stepId: "dispose", finalVerdict: "compliant" }]);
    expect(plan.result.unresolved).toEqual(["fill", "label"]);
    expect(plan.result.mandatoryViolations).toEqual(["carry"]);
  });

  it("stores no score and no risk when nothing is assessable", () => {
    const plan = finalizePlan(
      [{ id: "a", weight: 1, isMandatory: true, isCritical: false }],
      [{ stepId: "a", aiVerdict: "not_visible", finalVerdict: null }],
    );
    expect(plan).toMatchObject({ ok: true, score: null, riskLevel: null, acceptAi: [] });
  });

  it("a critical violation is high risk whatever the score", () => {
    const plan = finalizePlan(steps.slice(0, 2), [
      { stepId: "recap", aiVerdict: null, finalVerdict: "compliant" },
      { stepId: "dispose", aiVerdict: "non_compliant", finalVerdict: null },
    ]);
    expect(plan).toMatchObject({ ok: true, score: 50, riskLevel: "high", acceptAi: [{ stepId: "dispose", finalVerdict: "non_compliant" }] });
  });

  it("counts the unsure AI verdicts that finalising accepts without a check (the audit row records it)", () => {
    const plan = finalizePlan(steps.slice(1, 4), [
      { stepId: "dispose", aiVerdict: "compliant", finalVerdict: null, aiConfidence: 0.55 }, // unsure, unchecked
      { stepId: "container", aiVerdict: "compliant", finalVerdict: "compliant", aiConfidence: 0.5 }, // unsure, confirmed
      { stepId: "fill", aiVerdict: "non_compliant", finalVerdict: null, aiConfidence: 0.92 },
    ]);
    expect(plan).toMatchObject({ ok: true, unsureUnchecked: 1 });
  });
});

describe("riskReason", () => {
  const base = { assessable: true, score: 100, criticalViolations: [], mandatoryViolations: [], violated: [] as string[] };
  it("explains the risk level in the scoring order", () => {
    expect(riskReason({ ...base, assessable: false, score: 0 })).toBe("notAssessable");
    expect(riskReason({ ...base, score: 90, criticalViolations: ["a"], violated: ["a"] })).toBe("critical");
    expect(riskReason({ ...base, score: 40, violated: ["a"] })).toBe("lowScore");
    expect(riskReason({ ...base, score: 90, mandatoryViolations: ["a"], violated: ["a"] })).toBe("mandatory");
    expect(riskReason({ ...base, score: 70, violated: ["a"] })).toBe("mediumScore");
    expect(riskReason({ ...base, score: 90, violated: ["a"] })).toBe("minorGaps");
    expect(riskReason(base)).toBe("allCompliant");
  });
});

describe("reportOutcome (the report agrees with the stored risk)", () => {
  const none = { criticalViolations: [] as string[], mandatoryViolations: [] as string[], violated: [] as string[] };

  it("matches riskReason while the step flags are unchanged", () => {
    expect(reportOutcome({ ...none, criticalViolations: ["a"], violated: ["a"] }, { score: 86, riskLevel: "high" }).reason).toBe("critical");
    expect(reportOutcome({ ...none, violated: ["a"] }, { score: 40, riskLevel: "high" }).reason).toBe("lowScore");
    expect(reportOutcome({ ...none, mandatoryViolations: ["a"], violated: ["a"] }, { score: 86, riskLevel: "medium" }).reason).toBe("mandatory");
    expect(reportOutcome({ ...none, violated: ["a"] }, { score: 70, riskLevel: "medium" }).reason).toBe("mediumScore");
    expect(reportOutcome({ ...none, violated: ["a"] }, { score: 90, riskLevel: "low" }).reason).toBe("minorGaps");
    expect(reportOutcome(none, { score: 100, riskLevel: "low" }).reason).toBe("allCompliant");
    expect(reportOutcome(none, { score: null, riskLevel: null }).reason).toBe("notAssessable");
  });

  it("never contradicts the stored risk after a step's flags changed", () => {
    // Stored medium (a mandatory violation), the step was made critical later: still "mandatory", no critical badge.
    const nowCritical = { criticalViolations: ["a"], mandatoryViolations: ["a"], violated: ["a"] };
    expect(reportOutcome(nowCritical, { score: 86, riskLevel: "medium" })).toEqual({
      reason: "mandatory",
      criticalViolations: [],
      mandatoryViolations: ["a"],
    });
    // Stored high at 86 % (only a critical violation does that), the flag was removed later: still "critical".
    expect(reportOutcome({ ...none, violated: ["a"] }, { score: 86, riskLevel: "high" }).reason).toBe("critical");
    // Stored medium at 86 % (only a mandatory violation does that), the step became optional: still "mandatory".
    expect(reportOutcome({ ...none, violated: ["a"] }, { score: 86, riskLevel: "medium" }).reason).toBe("mandatory");
    // Stored low: neither list can be non-empty in the report.
    expect(reportOutcome(nowCritical, { score: 95, riskLevel: "low" })).toEqual({
      reason: "minorGaps",
      criticalViolations: [],
      mandatoryViolations: [],
    });
  });
});

describe("deleteGate", () => {
  const examiner = { userId: "u1", manager: false };
  const manager = { userId: "m1", manager: true };
  const draft = { status: "draft" as const, updatedAt: ago(1000), examinerId: "u1" };

  it("lets an examiner delete their own unfinished scan, a manager any", () => {
    expect(deleteGate(examiner, draft, now)).toEqual({ ok: true });
    expect(deleteGate(examiner, { ...draft, examinerId: "u2" }, now)).toEqual({ ok: false, error: "forbidden" });
    expect(deleteGate(manager, { ...draft, examinerId: "u2", status: "review" }, now)).toEqual({ ok: true });
    expect(deleteGate(manager, { ...draft, examinerId: null, status: "failed" }, now)).toEqual({ ok: true });
  });

  it("never deletes a finalised scan or one being analysed", () => {
    expect(deleteGate(manager, { ...draft, status: "finalized" }, now)).toEqual({ ok: false, error: "finalized" });
    expect(deleteGate(manager, { ...draft, status: "analyzing" }, now)).toEqual({ ok: false, error: "analysis_running" });
    // A crashed analysis may be deleted.
    expect(deleteGate(examiner, { ...draft, status: "analyzing", updatedAt: ago(ANALYSIS_STALE_MS + 1) }, now)).toEqual({ ok: true });
  });
});
