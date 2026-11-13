import { describe, expect, it } from "vitest";
import type { AttemptForResult } from "./queries";
import { buildResultModel } from "./result-model";

const step = (id: string, order: number, extra: Partial<AttemptForResult["stepResults"][number]["step"]> = {}) => ({
  id,
  protocolId: "p1",
  order,
  textAr: `خطوة ${id}`,
  textEn: `Step ${id}`,
  rationaleAr: `لماذا ${id}`,
  rationaleEn: `Why ${id}`,
  referenceLabel: "WHO",
  referenceUrl: "https://www.who.int/x",
  weight: 2,
  isMandatory: true,
  isCritical: false,
  ...extra,
});

function attempt(overrides: Partial<AttemptForResult> = {}): AttemptForResult {
  return {
    id: "att1",
    userId: "u1",
    organizationId: null,
    status: "completed",
    startedAt: new Date("2026-10-29T08:00:00Z"),
    completedAt: new Date("2026-10-29T08:05:30Z"),
    durationSec: 330,
    score: 40,
    riskLevel: "high",
    debriefAr: null,
    debriefEn: null,
    user: { name: "متدرب" },
    scenario: {
      id: "sc",
      slug: "used-needle-after-injection",
      titleAr: "إبرة",
      titleEn: "Needle",
      protocol: { id: "p1", slug: "sharps-safety", titleAr: "الحادة", titleEn: "Sharps", icon: "syringe" },
      stages: [
        {
          id: "s1",
          order: 1,
          kind: "single",
          promptAr: "ماذا تفعل؟",
          promptEn: "What do you do?",
          contextAr: null,
          contextEn: null,
          options: [
            {
              id: "a",
              textAr: "صح",
              textEn: "Right",
              isCorrect: true,
              isCritical: false,
              feedbackAr: "لأن",
              feedbackEn: "Because",
              step: null,
            },
            {
              id: "b",
              textAr: "خطأ",
              textEn: "Wrong",
              isCorrect: false,
              isCritical: true,
              feedbackAr: "لأن",
              feedbackEn: "Because",
              step: { id: "recap", textAr: "لا تغطِّ", textEn: "No recap", isCritical: true, referenceLabel: "CDC", referenceUrl: "javascript:alert(1)" },
            },
          ],
        },
        {
          id: "s2",
          order: 2,
          kind: "multi",
          promptAr: "اختر",
          promptEn: "Choose",
          contextAr: "سياق",
          contextEn: "Context",
          options: [
            { id: "c", textAr: "ج", textEn: "C", isCorrect: true, isCritical: false, feedbackAr: "ف", feedbackEn: "F", step: null },
            { id: "d", textAr: "د", textEn: "D", isCorrect: false, isCritical: false, feedbackAr: "ف", feedbackEn: "F", step: null },
          ],
        },
      ],
    },
    answers: [
      { stageId: "s1", optionIds: ["b"] },
      { stageId: "s2", optionIds: ["c"] },
    ],
    stepResults: [
      { compliant: true, critical: false, step: step("dispose", 2) },
      { compliant: false, critical: true, step: step("recap", 1, { isCritical: true }) },
    ],
    ...overrides,
  } as AttemptForResult;
}

describe("buildResultModel", () => {
  it("reviews every stage and option in the reader's language", () => {
    const m = buildResultModel(attempt(), "en");
    expect(m.scenario).toEqual({ slug: "used-needle-after-injection", title: "Needle", protocol: { slug: "sharps-safety", title: "Sharps", icon: "syringe" } });
    expect(m.stagesTotal).toBe(2);
    expect(m.stagesCorrect).toBe(1);
    expect(m.stages[0].options.map((o) => [o.id, o.state, o.criticalChosen])).toEqual([
      ["a", "missed", false],
      ["b", "chosen_wrong", true],
    ]);
    expect(m.stages[1]).toMatchObject({ number: 2, context: "Context", correct: true });
    expect(m.stages[0].options[1].step).toEqual({ text: "No recap", critical: true, source: { label: "CDC", url: null } });
  });

  it("splits stored step results into violations (critical ids) and strengths, in protocol order", () => {
    const m = buildResultModel(attempt(), "ar");
    expect(m.violated.map((s) => s.id)).toEqual(["recap"]);
    expect(m.violated[0]).toMatchObject({ text: "خطوة recap", rationale: "لماذا recap", protocolId: "p1", source: { label: "WHO", url: "https://www.who.int/x" } });
    expect(m.criticalIds).toEqual(["recap"]);
    expect(m.strengths.map((s) => s.id)).toEqual(["dispose"]);
  });

  it("prefers the debrief in the reader's language and falls back to the other one", () => {
    expect(buildResultModel(attempt({ debriefAr: "ملخص", debriefEn: "Summary" }), "en").debrief).toEqual({
      text: "Summary",
      locale: "en",
      forReader: true,
    });
    expect(buildResultModel(attempt({ debriefAr: "ملخص" }), "en").debrief).toEqual({ text: "ملخص", locale: "ar", forReader: false });
    expect(buildResultModel(attempt({ debriefAr: "  " }), "ar").debrief).toBeNull();
  });

  it("keeps a not-assessable attempt as null score and risk", () => {
    const m = buildResultModel(attempt({ score: null, riskLevel: null, stepResults: [] }), "ar");
    expect(m.score).toBeNull();
    expect(m.riskLevel).toBeNull();
    expect(m.violated).toEqual([]);
    expect(m.strengths).toEqual([]);
  });
});
