import { describe, expect, it } from "vitest";
import { newStepKey } from "./editor-form";
import {
  canDeleteProtocol,
  changedStepFields,
  planStepChanges,
  protocolHasHistory,
  protocolUsage,
  type StepContent,
  stepHasHistory,
  stepMeaningLocked,
  stepResultCount,
  stepUsageTotal,
} from "./history";

const none = { scanResults: 0, simulationResults: 0, options: 0 };
const used = { scanResults: 1, simulationResults: 0, options: 2 };
const optionsOnly = { scanResults: 0, simulationResults: 0, options: 1 };

describe("history", () => {
  it("counts every kind of reference to a step, results apart from scenario options", () => {
    expect(stepUsageTotal(used)).toBe(3);
    expect(stepResultCount(used)).toBe(1);
    expect(stepResultCount(optionsOnly)).toBe(0);
    expect(stepHasHistory(none)).toBe(false);
    expect(stepHasHistory(optionsOnly)).toBe(true);
    expect(stepHasHistory({ ...none, simulationResults: 1 })).toBe(true);
  });

  it("locks what a step means only once it has results (a scenario option is a link, not a result)", () => {
    expect(stepMeaningLocked(none)).toBe(false);
    expect(stepMeaningLocked(optionsOnly)).toBe(false);
    expect(stepMeaningLocked({ ...none, scanResults: 1 })).toBe(true);
    expect(stepMeaningLocked({ ...none, simulationResults: 3 })).toBe(true);
  });

  it("gives a protocol history through scans, scenarios, copies, step results or scenario answers", () => {
    const blank = protocolUsage({ scans: 0, scenarios: 0, copies: 0 }, [none, none]);
    expect(blank).toEqual({ scans: 0, scenarios: 0, copies: 0, stepResults: 0, scenarioOptions: 0 });
    expect(protocolHasHistory(blank)).toBe(false);
    expect(protocolHasHistory({ ...blank, scans: 1 })).toBe(true);
    expect(protocolHasHistory({ ...blank, scenarios: 1 })).toBe(true);
    expect(protocolHasHistory({ ...blank, copies: 1 })).toBe(true);
    // The usage panel reports real results and scenario answers apart.
    const mixed = protocolUsage({ scans: 0, scenarios: 0, copies: 0 }, [none, used, optionsOnly]);
    expect(mixed).toMatchObject({ stepResults: 1, scenarioOptions: 3 });
    expect(protocolHasHistory(mixed)).toBe(true);
    expect(protocolHasHistory(protocolUsage({ scans: 0, scenarios: 0, copies: 0 }, [optionsOnly]))).toBe(true);
  });

  it("deletes only unpublished protocols without history", () => {
    const blank = { scans: 0, scenarios: 0, copies: 0, stepResults: 0, scenarioOptions: 0 };
    expect(canDeleteProtocol({ isPublished: false, usage: blank })).toEqual({ ok: true });
    expect(canDeleteProtocol({ isPublished: true, usage: blank })).toEqual({ ok: false, reason: "published" });
    expect(canDeleteProtocol({ isPublished: true, usage: { ...blank, scans: 2 } })).toEqual({ ok: false, reason: "history" });
    expect(canDeleteProtocol({ isPublished: false, usage: { ...blank, scenarioOptions: 1 } })).toEqual({ ok: false, reason: "history" });
  });
});

describe("changedStepFields", () => {
  const before: StepContent = {
    textAr: "أغلق الحاوية",
    textEn: "Close the container",
    rationaleAr: "سبب",
    rationaleEn: "Why",
    criteriaAr: null,
    criteriaEn: null,
    referenceLabel: null,
    referenceUrl: null,
    isMandatory: true,
    isCritical: true,
    weight: 3,
    visualCheck: false,
  };

  it("finds nothing when nothing changed", () => {
    expect(changedStepFields(before, { ...before })).toEqual({ meaning: [], wording: [] });
  });

  it("tells meaning changes (refused on steps with results) from wording fixes", () => {
    const after = { ...before, isCritical: false, weight: 1, textEn: "Open the container", referenceLabel: "CDC" };
    expect(changedStepFields(before, after)).toEqual({ meaning: ["isCritical", "weight"], wording: ["textEn", "referenceLabel"] });
  });
});

describe("planStepChanges", () => {
  const saved = [
    { id: "a", key: "wash-hands", usage: used },
    { id: "b", key: "wear-gloves", usage: none },
    { id: "c", key: "dispose", usage: none },
  ];

  it("keeps saved steps with their keys in the new order and creates new ones with readable unique keys", () => {
    const plan = planStepChanges(
      saved,
      [
        { id: "c", textEn: "ignored" },
        { id: null, textEn: "Wear gloves" },
        { id: "a", textEn: "x" },
        { id: "b", textEn: "y" },
        { id: null, textEn: "Wear gloves" },
      ],
      newStepKey,
    );
    expect(plan).toEqual({
      ok: true,
      rows: [
        { id: "c", key: "dispose" },
        { id: null, key: "wear-gloves-2" },
        { id: "a", key: "wash-hands" },
        { id: "b", key: "wear-gloves" },
        { id: null, key: "wear-gloves-3" },
      ],
      remove: [],
    });
  });

  it("removes saved steps that are gone when they have no history", () => {
    const plan = planStepChanges(saved, [{ id: "a", textEn: "" }], newStepKey);
    expect(plan).toEqual({ ok: true, rows: [{ id: "a", key: "wash-hands" }], remove: ["b", "c"] });
  });

  it("never reuses the key of a removed step for a new one", () => {
    const plan = planStepChanges(saved, [{ id: "a", textEn: "" }, { id: null, textEn: "Dispose" }], newStepKey);
    expect(plan.ok && plan.rows[1]).toEqual({ id: null, key: "dispose-2" });
  });

  it("refuses to drop a step with history, a scenario link included", () => {
    expect(planStepChanges(saved, [{ id: "b", textEn: "" }, { id: "c", textEn: "" }], newStepKey)).toEqual({
      ok: false,
      error: "step_has_history",
    });
    expect(planStepChanges([{ id: "x", key: "x", usage: optionsOnly }, ...saved], [{ id: "a", textEn: "" }], newStepKey)).toMatchObject({
      ok: false,
      error: "step_has_history",
    });
  });

  it("refuses ids of other protocols and duplicated ids (a stale page or a forged request)", () => {
    expect(planStepChanges(saved, [{ id: "zzz", textEn: "" }, { id: "a", textEn: "" }], newStepKey)).toEqual({
      ok: false,
      error: "unknown_step",
    });
    expect(planStepChanges(saved, [{ id: "a", textEn: "" }, { id: "a", textEn: "" }], newStepKey)).toEqual({
      ok: false,
      error: "unknown_step",
    });
  });
});
