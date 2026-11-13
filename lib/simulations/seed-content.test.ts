import { describe, expect, it } from "vitest";
import { protocols } from "@/prisma/seed/protocols";
import { scenarios } from "@/prisma/seed/scenarios";
import { attemptOutcome } from "./engine";

/**
 * Content rules for prisma/seed/scenarios.ts (on top of the checks prisma/seed/index.ts runs): every scenario is
 * playable, bilingual, mapped to real step keys, and a perfect run scores 100 with low risk.
 */

const ARABIC = /[؀-ۿ]/;
const stepsBySlug = new Map(protocols.map((p) => [p.slug, p.steps]));

describe("seed scenarios", () => {
  it("cover every seed protocol, with two each for sharps safety and blood spills", () => {
    const count = (slug: string) => scenarios.filter((s) => s.protocolSlug === slug).length;
    for (const p of protocols) expect(count(p.slug), p.slug).toBeGreaterThanOrEqual(1);
    expect(count("sharps-safety")).toBeGreaterThanOrEqual(2);
    expect(count("blood-spill-management")).toBeGreaterThanOrEqual(2);
  });

  it("have unique slug-shaped slugs and known protocols", () => {
    const slugs = scenarios.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of scenarios) {
      expect(s.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(stepsBySlug.has(s.protocolSlug), `${s.slug}: ${s.protocolSlug}`).toBe(true);
    }
  });

  for (const scenario of scenarios) {
    describe(scenario.slug, () => {
      const steps = stepsBySlug.get(scenario.protocolSlug) ?? [];
      const keys = new Set(steps.map((s) => s.key));

      it("has 4-7 stages with both single and multi stages, sensible minutes", () => {
        expect(scenario.stages.length).toBeGreaterThanOrEqual(4);
        expect(scenario.stages.length).toBeLessThanOrEqual(7);
        expect(scenario.stages.some((st) => st.kind === "single")).toBe(true);
        expect(scenario.stages.some((st) => st.kind === "multi")).toBe(true);
        expect(scenario.estimatedMinutes).toBeGreaterThanOrEqual(3);
        expect(scenario.estimatedMinutes).toBeLessThanOrEqual(15);
      });

      it("is bilingual everywhere (Arabic in Ar columns, none in En columns)", () => {
        const pairs: Array<[string, string | undefined, string | undefined]> = [
          ["title", scenario.titleAr, scenario.titleEn],
          ["intro", scenario.introAr, scenario.introEn],
          ["setting", scenario.settingAr, scenario.settingEn],
        ];
        scenario.stages.forEach((st, i) => {
          pairs.push([`stage ${i + 1} prompt`, st.promptAr, st.promptEn]);
          if (st.contextAr || st.contextEn) pairs.push([`stage ${i + 1} context`, st.contextAr, st.contextEn]);
          st.options.forEach((o, j) => {
            pairs.push([`stage ${i + 1} option ${j + 1} text`, o.textAr, o.textEn]);
            pairs.push([`stage ${i + 1} option ${j + 1} feedback`, o.feedbackAr, o.feedbackEn]);
          });
        });
        for (const [where, ar, en] of pairs) {
          expect(ar?.trim(), `${where} (ar)`).toBeTruthy();
          expect(en?.trim(), `${where} (en)`).toBeTruthy();
          expect(ARABIC.test(ar ?? ""), `${where} (ar) has Arabic`).toBe(true);
          expect(ARABIC.test(en ?? ""), `${where} (en) has no Arabic`).toBe(false);
        }
      });

      it("has well-formed stages: one right answer for single, at least one right and one wrong for multi", () => {
        scenario.stages.forEach((st, i) => {
          const correct = st.options.filter((o) => o.isCorrect).length;
          expect(st.options.length, `stage ${i + 1}`).toBeGreaterThanOrEqual(2);
          if (st.kind === "single") expect(correct, `stage ${i + 1}`).toBe(1);
          else {
            expect(correct, `stage ${i + 1}`).toBeGreaterThanOrEqual(1);
            expect(st.options.length - correct, `stage ${i + 1}`).toBeGreaterThanOrEqual(1);
          }
          const texts = st.options.map((o) => o.textEn);
          expect(new Set(texts).size, `stage ${i + 1} duplicate options`).toBe(texts.length);
        });
      });

      it("maps options to step keys of its protocol; only wrong options are critical", () => {
        for (const st of scenario.stages) {
          for (const o of st.options) {
            if (o.stepKey) expect(keys.has(o.stepKey), `${o.stepKey}`).toBe(true);
            if (o.isCritical) expect(o.isCorrect, o.textEn).toBe(false);
          }
        }
        const mapped = new Set(scenario.stages.flatMap((st) => st.options.flatMap((o) => (o.stepKey ? [o.stepKey] : []))));
        expect(mapped.size).toBeGreaterThanOrEqual(3);
      });

      it("scores 100 / low on a perfect run and lower on an all-wrong run", () => {
        const stepIds = new Map(steps.map((s) => [s.key, s.key]));
        const options = scenario.stages.flatMap((st, i) =>
          st.options.map((o, j) => ({
            id: `${i}:${j}`,
            stageId: String(i),
            stepId: o.stepKey ? (stepIds.get(o.stepKey) ?? null) : null,
            isCorrect: o.isCorrect,
            isCritical: o.isCritical ?? false,
          })),
        );
        const meta = steps.map((s) => ({ id: s.key, weight: s.weight, isMandatory: s.isMandatory, isCritical: s.isCritical }));
        const perfect = attemptOutcome({
          options,
          steps: meta,
          answers: scenario.stages.map((st, i) => ({
            stageId: String(i),
            optionIds: st.options.flatMap((o, j) => (o.isCorrect ? [`${i}:${j}`] : [])),
          })),
        });
        expect(perfect.score).toBe(100);
        expect(perfect.riskLevel).toBe("low");

        const wrong = attemptOutcome({
          options,
          steps: meta,
          answers: scenario.stages.map((st, i) => ({
            stageId: String(i),
            optionIds: [st.options.findIndex((o) => !o.isCorrect)].map((j) => `${i}:${j}`),
          })),
        });
        expect(wrong.score ?? 0).toBeLessThan(50);
        expect(wrong.riskLevel).toBe("high");
      });
    });
  }

  // The header rule (SPEC-7): a wrong option that touches a used needle or lancet with the fingers is critical, and its
  // feedback says so ("Serious error"), like recapping. Glass in a blood spill is a separate, marked medical question.
  it("flags every wrong option that handles a used sharp with the fingers as critical", () => {
    const byHand = /\b(with my fingers|in my hand|by hand|with both hands)\b/i;
    const sharps = scenarios.filter((s) => s.protocolSlug === "sharps-safety");
    const checked = sharps.flatMap((s) => s.stages.flatMap((st) => st.options.filter((o) => !o.isCorrect && byHand.test(o.textEn))));
    expect(checked.length).toBeGreaterThanOrEqual(4);
    for (const o of checked) {
      expect(o.isCritical, o.textEn).toBe(true);
      expect(o.feedbackEn, o.textEn).toMatch(/^Serious error\./);
      expect(o.feedbackAr, o.textEn).toMatch(/^خطأ جسيم\./);
    }
    // Every sharps scenario has at least one critical option (cannula-in-emergency had none).
    for (const s of sharps) expect(s.stages.some((st) => st.options.some((o) => o.isCritical)), s.slug).toBe(true);
  });

  it("never names the team or the award (2026-10-28)", () => {
    const text = JSON.stringify(scenarios);
    expect(text).not.toMatch(/med[a]thon|المركز الثاني/i);
  });
});
