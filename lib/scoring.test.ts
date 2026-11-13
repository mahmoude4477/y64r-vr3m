import { describe, expect, it } from "vitest";
import {
  canFinalizeScan,
  computeScore,
  isStageAnswerCorrect,
  normalizeWeight,
  prioritizeViolations,
  riskLevelFor,
  type ScoredStep,
  scanStepOutcome,
  scoreScan,
  scoreSimulation,
  simulationStepOutcomes,
  type SimOption,
  type StepMeta,
} from "./scoring";

const step = (over: Partial<ScoredStep> & Pick<ScoredStep, "stepId" | "outcome">): ScoredStep => ({
  weight: 1,
  isMandatory: false,
  isCritical: false,
  ...over,
});

describe("normalizeWeight", () => {
  it("clamps to 1..3 and rounds", () => {
    expect(normalizeWeight(1)).toBe(1);
    expect(normalizeWeight(3)).toBe(3);
    expect(normalizeWeight(0)).toBe(1);
    expect(normalizeWeight(-4)).toBe(1);
    expect(normalizeWeight(7)).toBe(3);
    expect(normalizeWeight(2.4)).toBe(2);
    expect(normalizeWeight(Number.NaN)).toBe(1);
    expect(normalizeWeight(undefined)).toBe(1);
    expect(normalizeWeight(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("computeScore", () => {
  it("scores 100 and low risk when everything applicable is compliant", () => {
    const r = computeScore([step({ stepId: "a", outcome: "compliant" }), step({ stepId: "b", outcome: "compliant" })]);
    expect(r).toMatchObject({ score: 100, riskLevel: "low", assessable: true, violated: [] });
  });

  it("returns 0 (not assessable) when nothing is applicable", () => {
    const r = computeScore([
      step({ stepId: "a", outcome: "not_applicable" }),
      step({ stepId: "b", outcome: "not_applicable", unresolved: true }),
    ]);
    expect(r.score).toBe(0);
    expect(r.assessable).toBe(false);
    expect(r.applicableWeight).toBe(0);
    expect(r.notApplicable).toEqual(["a", "b"]);
    expect(r.unresolved).toEqual(["b"]);
    // Not assessable is not "high": riskLevel is null (persisted as null, shown as "not assessable").
    expect(r.riskLevel).toBeNull();
  });

  it("returns 0 for an empty step list", () => {
    expect(computeScore([])).toMatchObject({ score: 0, assessable: false, riskLevel: null });
  });

  it("a scan where every visual step came back not_visible is not assessable, not high risk", () => {
    const steps: StepMeta[] = [
      { id: "v1", weight: 3, isMandatory: true, isCritical: true },
      { id: "v2", weight: 1, isMandatory: true, isCritical: false },
    ];
    const r = scoreScan(steps, [
      { stepId: "v1", aiVerdict: "not_visible" },
      { stepId: "v2", aiVerdict: "not_visible" },
    ]);
    expect(r).toMatchObject({ assessable: false, score: 0, riskLevel: null, unresolved: ["v1", "v2"], unanswered: [] });
  });

  it("weights steps and rounds", () => {
    // 3 / (3 + 2 + 2) = 42.86 -> 43
    const r = computeScore([
      step({ stepId: "a", weight: 3, outcome: "compliant" }),
      step({ stepId: "b", weight: 2, outcome: "non_compliant" }),
      step({ stepId: "c", weight: 2, outcome: "non_compliant" }),
      step({ stepId: "d", weight: 3, outcome: "not_applicable" }),
    ]);
    expect(r.applicableWeight).toBe(7);
    expect(r.compliantWeight).toBe(3);
    expect(r.score).toBe(43);
    expect(r.riskLevel).toBe("high");
  });

  it("never goes above 100 even with out-of-range weights", () => {
    const r = computeScore([
      step({ stepId: "a", weight: 99, outcome: "compliant" }),
      step({ stepId: "b", weight: -5, outcome: "compliant" }),
    ]);
    expect(r.score).toBe(100);
    expect(r.applicableWeight).toBe(4); // 3 + 1
  });

  it("a critical violation is high risk even with a high score", () => {
    const steps = Array.from({ length: 19 }, (_, i) => step({ stepId: `ok${i}`, outcome: "compliant" }));
    steps.push(step({ stepId: "recap", isCritical: true, outcome: "non_compliant" }));
    const r = computeScore(steps);
    expect(r.score).toBe(95);
    expect(r.riskLevel).toBe("high");
    expect(r.criticalViolations).toEqual(["recap"]);
  });

  it("a critical wrong option marks a non-critical step as a critical violation", () => {
    const r = computeScore([
      step({ stepId: "a", outcome: "compliant", weight: 3 }),
      step({ stepId: "b", outcome: "compliant", weight: 3 }),
      step({ stepId: "c", outcome: "non_compliant", criticalViolation: true }),
    ]);
    expect(r.criticalViolations).toEqual(["c"]);
    expect(r.riskLevel).toBe("high");
  });

  it("a mandatory violation is at least medium risk", () => {
    const steps = Array.from({ length: 9 }, (_, i) => step({ stepId: `ok${i}`, outcome: "compliant" }));
    steps.push(step({ stepId: "m", isMandatory: true, outcome: "non_compliant" }));
    const r = computeScore(steps);
    expect(r.score).toBe(90);
    expect(r.riskLevel).toBe("medium");
    expect(r.mandatoryViolations).toEqual(["m"]);
  });

  it("an optional violation with score >= 80 stays low", () => {
    const steps = Array.from({ length: 9 }, (_, i) => step({ stepId: `ok${i}`, outcome: "compliant" }));
    steps.push(step({ stepId: "opt", outcome: "non_compliant" }));
    expect(computeScore(steps)).toMatchObject({ score: 90, riskLevel: "low" });
  });

  it("uses the score thresholds 50 and 80", () => {
    expect(riskLevelFor({ score: 49, criticalViolation: false, mandatoryViolation: false })).toBe("high");
    expect(riskLevelFor({ score: 50, criticalViolation: false, mandatoryViolation: false })).toBe("medium");
    expect(riskLevelFor({ score: 79, criticalViolation: false, mandatoryViolation: false })).toBe("medium");
    expect(riskLevelFor({ score: 80, criticalViolation: false, mandatoryViolation: false })).toBe("low");
    expect(riskLevelFor({ score: 100, criticalViolation: true, mandatoryViolation: false })).toBe("high");
    expect(riskLevelFor({ score: 100, criticalViolation: false, mandatoryViolation: true })).toBe("medium");
  });
});

describe("scans", () => {
  it("final verdict wins over the AI verdict", () => {
    expect(scanStepOutcome({ aiVerdict: "compliant", finalVerdict: "non_compliant" })).toEqual({
      outcome: "non_compliant",
      unresolved: false,
    });
    expect(scanStepOutcome({ aiVerdict: "non_compliant", finalVerdict: "not_applicable" })).toEqual({
      outcome: "not_applicable",
      unresolved: false,
    });
  });

  it("unreviewed AI verdicts stand; not_visible and missing count as not applicable + unresolved", () => {
    expect(scanStepOutcome({ aiVerdict: "compliant" })).toEqual({ outcome: "compliant", unresolved: false });
    expect(scanStepOutcome({ aiVerdict: "not_visible" })).toEqual({ outcome: "not_applicable", unresolved: true });
    expect(scanStepOutcome({})).toEqual({ outcome: "not_applicable", unresolved: true });
  });

  it("scores a scan from protocol steps and results", () => {
    const steps: StepMeta[] = [
      { id: "s1", weight: 2, isMandatory: true, isCritical: false },
      { id: "s2", weight: 1, isMandatory: true, isCritical: false },
      { id: "s3", weight: 1, isMandatory: false, isCritical: false },
      { id: "s4", weight: 3, isMandatory: true, isCritical: true }, // non-visual, never answered
    ];
    const r = scoreScan(steps, [
      { stepId: "s1", aiVerdict: "compliant" },
      { stepId: "s2", aiVerdict: "not_visible", finalVerdict: "compliant" },
      { stepId: "s3", aiVerdict: "not_visible" },
    ]);
    expect(r.score).toBe(100);
    expect(r.notApplicable).toEqual(["s3", "s4"]);
    expect(r.unresolved).toEqual(["s3", "s4"]);
    expect(r.unanswered).toEqual(["s4"]); // s3 got an AI answer (not_visible); s4 got nothing
    expect(r.riskLevel).toBe("low");
    // ...but this scan cannot be finalised: the critical, mandatory non-visual s4 was never answered
    expect(
      canFinalizeScan(steps, [
        { stepId: "s1", aiVerdict: "compliant" },
        { stepId: "s2", aiVerdict: "not_visible", finalVerdict: "compliant" },
        { stepId: "s3", aiVerdict: "not_visible" },
      ]),
    ).toEqual({ ok: false, missing: ["s4"] });
  });

  it("canFinalizeScan needs an answer for every mandatory or critical step", () => {
    const steps: StepMeta[] = [
      { id: "visual", weight: 1, isMandatory: true, isCritical: false },
      { id: "nonvisual", weight: 1, isMandatory: true, isCritical: false },
      { id: "critical-optional", weight: 1, isMandatory: false, isCritical: true },
      { id: "optional", weight: 1, isMandatory: false, isCritical: false },
    ];
    // a row with no verdict at all (e.g. created when the AI call failed) is still unanswered
    expect(canFinalizeScan(steps, [{ stepId: "visual", aiVerdict: "not_visible" }, { stepId: "nonvisual" }]).missing).toEqual([
      "nonvisual",
      "critical-optional",
    ]);
    expect(
      canFinalizeScan(steps, [
        { stepId: "visual", aiVerdict: "not_visible" },
        { stepId: "nonvisual", finalVerdict: "compliant" },
        { stepId: "critical-optional", finalVerdict: "not_applicable" },
      ]),
    ).toEqual({ ok: true, missing: [] });
  });
});

describe("simulations", () => {
  // stage A (single): a1 correct -> hh, a2 wrong -> hh, a3 wrong + critical -> recap
  // stage B (multi): b1, b2 correct -> ppe, b3 wrong -> ppe, b4 wrong without a step
  const options: SimOption[] = [
    { id: "a1", stageId: "A", stepId: "hh", isCorrect: true, isCritical: false },
    { id: "a2", stageId: "A", stepId: "hh", isCorrect: false, isCritical: false },
    { id: "a3", stageId: "A", stepId: "recap", isCorrect: false, isCritical: true },
    { id: "b1", stageId: "B", stepId: "ppe", isCorrect: true, isCritical: false },
    { id: "b2", stageId: "B", stepId: "ppe", isCorrect: true, isCritical: false },
    { id: "b3", stageId: "B", stepId: "ppe", isCorrect: false, isCritical: false },
    { id: "b4", stageId: "B", stepId: null, isCorrect: false, isCritical: false },
  ];
  const steps: StepMeta[] = [
    { id: "hh", weight: 2, isMandatory: true, isCritical: false },
    { id: "recap", weight: 3, isMandatory: true, isCritical: false },
    { id: "ppe", weight: 1, isMandatory: true, isCritical: false },
    { id: "untouched", weight: 3, isMandatory: true, isCritical: true },
  ];

  it("checks stage answers as exact sets", () => {
    const stageB = options.filter((o) => o.stageId === "B");
    expect(isStageAnswerCorrect(stageB, ["b1", "b2"])).toBe(true);
    expect(isStageAnswerCorrect(stageB, ["b2", "b1"])).toBe(true);
    expect(isStageAnswerCorrect(stageB, ["b1"])).toBe(false);
    expect(isStageAnswerCorrect(stageB, ["b1", "b2", "b3"])).toBe(false);
    expect(isStageAnswerCorrect(stageB, ["b1", "b2", "zzz"])).toBe(false);
    expect(isStageAnswerCorrect(stageB, [])).toBe(false);
  });

  it("all correct -> every mapped step compliant, untouched steps not applicable", () => {
    const outcomes = simulationStepOutcomes({
      options,
      answers: [
        { stageId: "A", optionIds: ["a1"] },
        { stageId: "B", optionIds: ["b1", "b2"] },
      ],
    });
    expect(outcomes).toEqual(
      expect.arrayContaining([
        { stepId: "hh", compliant: true, critical: false },
        { stepId: "recap", compliant: true, critical: false },
        { stepId: "ppe", compliant: true, critical: false },
      ]),
    );
    expect(outcomes).toHaveLength(3);
    const r = scoreSimulation(steps, outcomes);
    expect(r).toMatchObject({ score: 100, riskLevel: "low", notApplicable: ["untouched"] });
  });

  it("choosing a critical wrong option violates its step critically -> high risk", () => {
    const outcomes = simulationStepOutcomes({
      options,
      answers: [
        { stageId: "A", optionIds: ["a3"] },
        { stageId: "B", optionIds: ["b1", "b2"] },
      ],
    });
    expect(outcomes.find((o) => o.stepId === "recap")).toEqual({ stepId: "recap", compliant: false, critical: true });
    // a1 (correct) was not chosen -> hh violated too
    expect(outcomes.find((o) => o.stepId === "hh")).toEqual({ stepId: "hh", compliant: false, critical: false });
    const r = scoreSimulation(steps, outcomes);
    expect(r.criticalViolations).toEqual(["recap"]);
    expect(r.riskLevel).toBe("high");
    expect(r.score).toBe(17); // 1 / (2 + 3 + 1)
  });

  it("missing a correct option in a multi stage violates its step (mandatory -> medium)", () => {
    const outcomes = simulationStepOutcomes({
      options,
      answers: [
        { stageId: "A", optionIds: ["a1"] },
        { stageId: "B", optionIds: ["b1"] },
      ],
    });
    expect(outcomes.find((o) => o.stepId === "ppe")?.compliant).toBe(false);
    const r = scoreSimulation(steps, outcomes);
    expect(r.score).toBe(83); // 5 / 6
    expect(r.riskLevel).toBe("medium");
  });

  it("an unanswered stage counts as nothing chosen", () => {
    const outcomes = simulationStepOutcomes({ options, answers: [{ stageId: "A", optionIds: ["a1"] }] });
    expect(outcomes.find((o) => o.stepId === "ppe")?.compliant).toBe(false);
  });

  it("a scenario without mapped steps is not assessable", () => {
    const r = scoreSimulation(steps, simulationStepOutcomes({ options: [], answers: [] }));
    expect(r).toMatchObject({ score: 0, assessable: false });
  });
});

describe("prioritizeViolations", () => {
  it("orders critical, then mandatory, then weight, keeping input order for ties", () => {
    const v: StepMeta[] = [
      { id: "opt-1", weight: 1, isMandatory: false, isCritical: false },
      { id: "mand-1", weight: 1, isMandatory: true, isCritical: false },
      { id: "opt-3", weight: 3, isMandatory: false, isCritical: false },
      { id: "crit", weight: 1, isMandatory: true, isCritical: true },
      { id: "mand-3", weight: 3, isMandatory: true, isCritical: false },
      { id: "sim-crit", weight: 1, isMandatory: false, isCritical: false },
    ];
    expect(prioritizeViolations(v, ["sim-crit"]).map((s) => s.id)).toEqual([
      "crit",
      "sim-crit",
      "mand-3",
      "mand-1",
      "opt-3",
      "opt-1",
    ]);
  });
});
