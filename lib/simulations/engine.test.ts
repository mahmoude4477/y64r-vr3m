import { describe, expect, it } from "vitest";
import {
  activeDurationSeconds,
  attemptOutcome,
  catalogueQuery,
  formatDuration,
  isMistake,
  MAX_ACTIVE_GAP_SEC,
  nextStageIndex,
  optionSeed,
  parseCatalogueFilters,
  reviewStage,
  riskCause,
  safeExternalUrl,
  shuffleOptions,
  validateChoice,
} from "./engine";

const stages = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];

describe("nextStageIndex", () => {
  it("returns the first stage without an answer", () => {
    expect(nextStageIndex(stages, [])).toBe(0);
    expect(nextStageIndex(stages, ["s1"])).toBe(1);
    expect(nextStageIndex(stages, ["s1", "s2"])).toBe(2);
  });
  it("returns the stage count when every stage is answered", () => {
    expect(nextStageIndex(stages, ["s3", "s1", "s2"])).toBe(3);
  });
  it("follows stage order, not answer order (a gap is the next stage)", () => {
    expect(nextStageIndex(stages, ["s2"])).toBe(0);
  });
});

describe("validateChoice", () => {
  const ids = ["a", "b", "c"];
  it("accepts exactly one option for a single stage", () => {
    expect(validateChoice("single", ["b"], ids)).toEqual({ ok: true, optionIds: ["b"] });
    expect(validateChoice("single", ["a", "b"], ids)).toEqual({ ok: false, error: "too_many" });
  });
  it("accepts one or more options for a multi stage and drops duplicates", () => {
    expect(validateChoice("multi", ["a", "c", "a"], ids)).toEqual({ ok: true, optionIds: ["a", "c"] });
  });
  it("rejects an empty choice and options of another stage", () => {
    expect(validateChoice("multi", [], ids)).toEqual({ ok: false, error: "empty" });
    expect(validateChoice("single", ["x"], ids)).toEqual({ ok: false, error: "unknown_option" });
    expect(validateChoice("multi", ["a", "x"], ids)).toEqual({ ok: false, error: "unknown_option" });
  });
  it("a duplicated single choice is still one option", () => {
    expect(validateChoice("single", ["a", "a"], ids)).toEqual({ ok: true, optionIds: ["a"] });
  });
});

describe("shuffleOptions", () => {
  const items = ["a", "b", "c", "d", "e"];
  it("is a permutation of the input and does not mutate it", () => {
    const copy = [...items];
    const shuffled = shuffleOptions(items, "seed");
    expect([...shuffled].sort()).toEqual(copy);
    expect(items).toEqual(copy);
  });
  it("is deterministic for a seed (the server and the browser agree)", () => {
    expect(shuffleOptions(items, optionSeed("att1", "st1"))).toEqual(shuffleOptions(items, optionSeed("att1", "st1")));
  });
  it("gives different orders for different attempts", () => {
    const orders = new Set(Array.from({ length: 20 }, (_, i) => shuffleOptions(items, optionSeed(`att${i}`, "st1")).join("")));
    expect(orders.size).toBeGreaterThan(5);
  });
  it("puts the first option in every position over many seeds", () => {
    const positions = new Set(Array.from({ length: 200 }, (_, i) => shuffleOptions(items, `s${i}`).indexOf("a")));
    expect(positions).toEqual(new Set([0, 1, 2, 3, 4]));
  });
  it("handles empty and single lists", () => {
    expect(shuffleOptions([], "x")).toEqual([]);
    expect(shuffleOptions(["only"], "x")).toEqual(["only"]);
  });
});

describe("attemptOutcome (composes @/lib/scoring)", () => {
  const steps = [
    { id: "recap", weight: 3, isMandatory: true, isCritical: true },
    { id: "dispose", weight: 2, isMandatory: true, isCritical: false },
    { id: "untouched", weight: 1, isMandatory: true, isCritical: false },
  ];
  const options = [
    { id: "o1", stageId: "s1", stepId: "recap", isCorrect: true, isCritical: false },
    { id: "o2", stageId: "s1", stepId: "recap", isCorrect: false, isCritical: true },
    { id: "o3", stageId: "s2", stepId: "dispose", isCorrect: true, isCritical: false },
    { id: "o4", stageId: "s2", stepId: null, isCorrect: false, isCritical: false },
  ];

  it("all right: 100 and low risk; steps no option maps are not applicable", () => {
    const r = attemptOutcome({ options, steps, answers: [{ stageId: "s1", optionIds: ["o1"] }, { stageId: "s2", optionIds: ["o3"] }] });
    expect(r.score).toBe(100);
    expect(r.riskLevel).toBe("low");
    expect(r.outcomes).toEqual([
      { stepId: "recap", compliant: true, critical: false },
      { stepId: "dispose", compliant: true, critical: false },
    ]);
    expect(r.result.notApplicable).toEqual(["untouched"]);
  });

  it("a critical wrong option means high risk whatever the score", () => {
    const r = attemptOutcome({ options, steps, answers: [{ stageId: "s1", optionIds: ["o2"] }, { stageId: "s2", optionIds: ["o3"] }] });
    expect(r.riskLevel).toBe("high");
    expect(r.score).toBe(40); // 2 of 5 weight
    expect(r.outcomes.find((o) => o.stepId === "recap")).toEqual({ stepId: "recap", compliant: false, critical: true });
  });

  it("nothing assessable stores null score and risk (never 0% / high)", () => {
    const r = attemptOutcome({
      options: [{ id: "x", stageId: "s1", stepId: null, isCorrect: true, isCritical: false }],
      steps,
      answers: [{ stageId: "s1", optionIds: ["x"] }],
    });
    expect(r.result.assessable).toBe(false);
    expect(r.score).toBeNull();
    expect(r.riskLevel).toBeNull();
    expect(r.outcomes).toEqual([]);
  });
});

describe("reviewStage", () => {
  const options = [
    { id: "a", isCorrect: true },
    { id: "b", isCorrect: true },
    { id: "c", isCorrect: false },
    { id: "d", isCorrect: false },
  ];
  it("labels every option and judges the stage like the scoring", () => {
    const r = reviewStage("multi", options, ["a", "c"]);
    expect(r.correct).toBe(false);
    expect(r.answered).toBe(true);
    expect(r.options.map((o) => o.state)).toEqual(["chosen_correct", "missed", "chosen_wrong", "avoided"]);
    expect(r.options.filter((o) => isMistake(o.state)).map((o) => o.id)).toEqual(["b", "c"]);
  });
  it("is correct only when the chosen set equals the correct set", () => {
    expect(reviewStage("multi", options, ["a", "b"]).correct).toBe(true);
    expect(reviewStage("multi", options, ["b", "a"]).correct).toBe(true);
  });
  it("an unanswered stage is neither answered nor correct, and praises nothing", () => {
    const r = reviewStage("single", [{ id: "a", isCorrect: false }], []);
    expect(r.answered).toBe(false);
    expect(r.correct).toBe(false);
    expect(r.options[0].state).toBe("not_chosen");
  });

  // SPEC-6: in a one-answer stage, leaving the other wrong options out is only praise-worthy when the answer was right.
  const single = [
    { id: "right", isCorrect: true },
    { id: "wrong1", isCorrect: false },
    { id: "wrong2", isCorrect: false },
  ];
  it("a one-answer stage answered wrongly labels the other wrong options neutrally", () => {
    const r = reviewStage("single", single, ["wrong1"]);
    expect(r.correct).toBe(false);
    expect(r.options.map((o) => o.state)).toEqual(["missed", "chosen_wrong", "not_chosen"]);
    expect(isMistake("not_chosen")).toBe(false);
  });
  it("a one-answer stage answered correctly still says the wrong options were rightly avoided", () => {
    expect(reviewStage("single", single, ["right"]).options.map((o) => o.state)).toEqual(["chosen_correct", "avoided", "avoided"]);
  });
  it("in a multi stage every wrong option left out is a decision of its own (avoided), even in a wrong answer", () => {
    expect(reviewStage("multi", options, ["a"]).options.map((o) => o.state)).toEqual(["chosen_correct", "missed", "avoided", "avoided"]);
  });
});

describe("riskCause", () => {
  const mandatory = { isMandatory: true };
  const optional = { isMandatory: false };
  it("names the reason of a high risk", () => {
    expect(riskCause({ riskLevel: "high", score: 90, violated: [optional], criticalIds: ["s1"] })).toBe("critical");
    expect(riskCause({ riskLevel: "high", score: 40, violated: [optional], criticalIds: [] })).toBe("belowHalf");
    // Stored data whose cause cannot be told any more (e.g. step flags changed later): the generic text.
    expect(riskCause({ riskLevel: "high", score: 70, violated: [], criticalIds: [] })).toBe("high");
  });
  it("names the reason of a medium risk", () => {
    expect(riskCause({ riskLevel: "medium", score: 85, violated: [mandatory], criticalIds: [] })).toBe("mandatory");
    expect(riskCause({ riskLevel: "medium", score: 70, violated: [optional], criticalIds: [] })).toBe("belowEighty");
    expect(riskCause({ riskLevel: "medium", score: 90, violated: [], criticalIds: [] })).toBe("medium");
  });
  it("never claims full compliance for a low risk with steps still violated (UX-3)", () => {
    expect(riskCause({ riskLevel: "low", score: 92, violated: [optional], criticalIds: [] })).toBe("gaps");
    expect(riskCause({ riskLevel: "low", score: 100, violated: [], criticalIds: [] })).toBe("clean");
  });
  it("has no cause when the attempt could not be assessed", () => {
    expect(riskCause({ riskLevel: null, score: null, violated: [], criticalIds: [] })).toBeNull();
  });
});

describe("catalogue filters", () => {
  it("parses known values and ignores the rest", () => {
    expect(parseCatalogueFilters({ protocol: "sharps-safety", difficulty: "advanced" })).toEqual({
      protocol: "sharps-safety",
      difficulty: "advanced",
    });
    expect(parseCatalogueFilters({ protocol: "<script>", difficulty: "expert" })).toEqual({ protocol: null, difficulty: null });
    expect(parseCatalogueFilters({ protocol: ["waste-management", "x"], difficulty: undefined })).toEqual({
      protocol: "waste-management",
      difficulty: null,
    });
    expect(parseCatalogueFilters({})).toEqual({ protocol: null, difficulty: null });
  });
  it("round-trips through the query string", () => {
    expect(catalogueQuery({ protocol: null, difficulty: null })).toBe("");
    const query = catalogueQuery({ protocol: "food-policy", difficulty: "beginner" });
    expect(query).toBe("?protocol=food-policy&difficulty=beginner");
    expect(parseCatalogueFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual({ protocol: "food-policy", difficulty: "beginner" });
  });
});

describe("time and links", () => {
  it("activeDurationSeconds is whole seconds and never negative", () => {
    expect(activeDurationSeconds(new Date(0), [], new Date(61_400))).toBe(61);
    expect(activeDurationSeconds(new Date(5_000), [], new Date(0))).toBe(0);
    // A completion stamped just "before" the last answer (app and database clocks differ) adds nothing.
    expect(activeDurationSeconds(new Date(0), [new Date(30_000)], new Date(29_000))).toBe(30);
    expect(activeDurationSeconds(new Date(0), [], new Date(0))).toBe(0);
  });
  it("activeDurationSeconds sums the gaps between the start, the answers and the completion", () => {
    const at = (sec: number) => new Date(Date.UTC(2026, 9, 30, 8, 0, 0) + sec * 1000);
    // 40 s, 25 s and 70 s to answer three stages, completed with the last answer.
    expect(activeDurationSeconds(at(0), [at(40), at(65), at(135)], at(135))).toBe(135);
    // Answers out of order (as the database returns them) count the same.
    expect(activeDurationSeconds(at(0), [at(135), at(40), at(65)], at(135))).toBe(135);
  });
  it("activeDurationSeconds counts a pause of three days away as the cap only (a resumed attempt)", () => {
    const at = (sec: number) => new Date(Date.UTC(2026, 9, 30, 8, 0, 0) + sec * 1000);
    const days = 3 * 24 * 3600;
    // Two stages, "Continue later", back three days later for the last three stages.
    const answers = [at(30), at(60), at(days + 60), at(days + 90), at(days + 120)];
    expect(MAX_ACTIVE_GAP_SEC).toBe(300);
    expect(activeDurationSeconds(at(0), answers, at(days + 120))).toBe(60 + MAX_ACTIVE_GAP_SEC + 60);
    // A gap exactly at the cap counts in full; a custom cap applies to every gap.
    expect(activeDurationSeconds(at(0), [at(300)], at(300))).toBe(300);
    expect(activeDurationSeconds(at(0), [at(100), at(400)], at(400), 120)).toBe(100 + 120);
  });
  it("formatDuration shows m:ss or h:mm:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3_725)).toBe("1:02:05");
  });
  it("safeExternalUrl keeps https links only", () => {
    expect(safeExternalUrl("https://www.who.int/publications/i/item/9789241597906")).toBe("https://www.who.int/publications/i/item/9789241597906");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("http://example.com")).toBeNull();
    expect(safeExternalUrl("/relative")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});
