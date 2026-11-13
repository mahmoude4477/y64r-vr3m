import { describe, expect, it } from "vitest";
import { buildPreviewResult, previewRecommendations } from "./preview";
import type { PreviewData } from "./queries";

/** The preview's result is the trainee's result model, computed in the browser with the same scoring. */

const data: PreviewData = {
  scenario: {
    id: "sc",
    slug: "spill",
    title: "Spill",
    intro: "Intro",
    setting: "Setting",
    difficulty: "beginner",
    minutes: 5,
    isPublished: false,
    played: false,
    protocol: { slug: "blood", title: "Blood", icon: "droplet", isPublished: true },
  },
  stages: [
    {
      id: "s1",
      kind: "single",
      prompt: "Gloves?",
      context: null,
      options: [
        { id: "a", text: "Gloves first", feedback: "Right", isCorrect: true, isCritical: false, stepId: "ppe" },
        { id: "b", text: "Bare hands", feedback: "Wrong", isCorrect: false, isCritical: true, stepId: "ppe" },
      ],
    },
    {
      id: "s2",
      kind: "multi",
      prompt: "Then?",
      context: "Later",
      options: [
        { id: "c", text: "Absorb", feedback: "Right", isCorrect: true, isCritical: false, stepId: "absorb" },
        { id: "d", text: "Disinfect", feedback: "Right", isCorrect: true, isCritical: false, stepId: "absorb" },
        { id: "e", text: "Mop", feedback: "Wrong", isCorrect: false, isCritical: false, stepId: null },
      ],
    },
  ],
  steps: [
    { id: "ppe", protocolId: "p", order: 1, text: "Wear gloves", rationale: "Why", source: null, weight: 2, isMandatory: true, isCritical: false },
    { id: "absorb", protocolId: "p", order: 2, text: "Absorb first", rationale: "Why", source: null, weight: 1, isMandatory: true, isCritical: false },
  ],
};

describe("preview result", () => {
  it("a perfect run scores 100 with low risk", () => {
    const model = buildPreviewResult(data, { s1: ["a"], s2: ["c", "d"] }, 42);
    expect(model).toMatchObject({ score: 100, riskLevel: "low", stagesCorrect: 2, stagesTotal: 2, durationSec: 42, debrief: null });
    expect(model.strengths.map((s) => s.id)).toEqual(["ppe", "absorb"]);
    expect(model.violated).toEqual([]);
    expect(previewRecommendations(model)).toEqual([]);
  });

  it("a critical wrong choice is a high risk and leads the recommendations", () => {
    const model = buildPreviewResult(data, { s1: ["b"], s2: ["c"] }, 10);
    expect(model.riskLevel).toBe("high");
    expect(model.criticalIds).toEqual(["ppe"]);
    expect(model.violated.map((s) => s.id)).toEqual(["ppe", "absorb"]);
    const recs = previewRecommendations(model);
    expect(recs.map((r) => [r.step.id, r.critical, r.scenario])).toEqual([
      ["ppe", true, null],
      ["absorb", false, null],
    ]);
    const s1 = model.stages[0];
    expect(s1.correct).toBe(false);
    expect(s1.options.find((o) => o.id === "b")).toMatchObject({ state: "chosen_wrong", criticalChosen: true, step: { text: "Wear gloves" } });
    expect(s1.options.find((o) => o.id === "a")?.state).toBe("missed");
    expect(model.stages[1].options.find((o) => o.id === "e")).toMatchObject({ state: "avoided", step: null });
  });

  it("is not assessable when no option links to a step", () => {
    const unlinked: PreviewData = {
      ...data,
      steps: [],
      stages: data.stages.map((s) => ({ ...s, options: s.options.map((o) => ({ ...o, stepId: null })) })),
    };
    const model = buildPreviewResult(unlinked, { s1: ["a"], s2: ["c", "d"] }, 5);
    expect(model.score).toBeNull();
    expect(model.riskLevel).toBeNull();
  });
});
