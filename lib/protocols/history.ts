/**
 * History rules of the protocol editor (CONVENTIONS 6, PRODUCT 3). Pure functions, unit-tested.
 *
 * A STEP has history once anything points at it: scan step results and simulation step results (both RESTRICT in the
 * schema) and scenario options (SET NULL: deleting the step would silently cut the option from what it trains).
 * A PROTOCOL has history once it has scans, scenarios (they CASCADE with it), institution copies (their
 * sourceProtocolId would be lost) or any step with history.
 * Things with history are never deleted: the editor unpublishes them, or makes a new version.
 *
 * RESULTS (scan and simulation step results) are assessment history: finalised reports and past attempts show them
 * next to the step's current text and flags. So a step with results also keeps what it MEANS (mandatory, critical,
 * weight, photo check): only its wording can still be fixed in place, and since past reports then show the new
 * wording, a save that rewords such a step needs the editor's explicit confirmation (REPORTED_WORDING_FIELDS).
 * Scenario options are links, not results: they block removal, but a step that only scenarios point at can still
 * change.
 */

export type StepUsage = { scanResults: number; simulationResults: number; options: number };

/** Assessment results that point at the step (scans + simulation attempts). */
export function stepResultCount(usage: StepUsage): number {
  return usage.scanResults + usage.simulationResults;
}

/** Everything that points at the step (results + scenario options). */
export function stepUsageTotal(usage: StepUsage): number {
  return stepResultCount(usage) + usage.options;
}

export function stepHasHistory(usage: StepUsage): boolean {
  return stepUsageTotal(usage) > 0;
}

/** A step with results keeps its meaning (see the file comment). */
export function stepMeaningLocked(usage: StepUsage): boolean {
  return stepResultCount(usage) > 0;
}

export type ProtocolUsage = {
  scans: number;
  scenarios: number;
  copies: number;
  /** Scan and simulation step results of all its steps. */
  stepResults: number;
  /** Scenario answer options linked to its steps. */
  scenarioOptions: number;
};

export function protocolUsage(counts: { scans: number; scenarios: number; copies: number }, steps: readonly StepUsage[]): ProtocolUsage {
  return {
    ...counts,
    stepResults: steps.reduce((sum, s) => sum + stepResultCount(s), 0),
    scenarioOptions: steps.reduce((sum, s) => sum + s.options, 0),
  };
}

export function protocolHasHistory(usage: ProtocolUsage): boolean {
  return usage.scans + usage.scenarios + usage.copies + usage.stepResults + usage.scenarioOptions > 0;
}

export type DeleteCheck = { ok: true } | { ok: false; reason: "published" | "history" };

/** Only an unpublished protocol with no history can be deleted. */
export function canDeleteProtocol(input: { isPublished: boolean; usage: ProtocolUsage }): DeleteCheck {
  if (protocolHasHistory(input.usage)) return { ok: false, reason: "history" };
  if (input.isPublished) return { ok: false, reason: "published" };
  return { ok: true };
}

export type SavedStep = { id: string; key: string; usage: StepUsage };
export type IncomingStep = { id: string | null; textEn: string };

export type StepPlan =
  | {
      ok: true;
      /** One entry per incoming step, in the new order: the saved id it updates, or null (create), and its key. */
      rows: Array<{ id: string | null; key: string }>;
      /** Saved steps the editor no longer lists (all without history). */
      remove: string[];
    }
  | { ok: false; error: "unknown_step" | "step_has_history" };

/**
 * What a save does to the steps. `incoming` ids must be saved steps of THIS protocol and appear once (anything else
 * means the page is stale or the input was forged: "unknown_step"). Saved steps that are missing are deleted, unless
 * they have history ("step_has_history"). Saved steps keep their key; new steps get a readable unique key from
 * their English text (`keyFor`), never one that a saved step of this protocol used.
 */
export function planStepChanges(
  saved: readonly SavedStep[],
  incoming: readonly IncomingStep[],
  keyFor: (textEn: string, taken: ReadonlySet<string>) => string,
): StepPlan {
  const byId = new Map(saved.map((s) => [s.id, s]));
  const seen = new Set<string>();
  for (const step of incoming) {
    if (step.id === null) continue;
    if (!byId.has(step.id) || seen.has(step.id)) return { ok: false, error: "unknown_step" };
    seen.add(step.id);
  }
  const removed = saved.filter((s) => !seen.has(s.id));
  if (removed.some((s) => stepHasHistory(s.usage))) return { ok: false, error: "step_has_history" };

  const taken = new Set(saved.map((s) => s.key));
  const rows = incoming.map((step) => {
    if (step.id !== null) return { id: step.id, key: byId.get(step.id)!.key };
    const key = keyFor(step.textEn, taken);
    taken.add(key);
    return { id: null, key };
  });
  return { ok: true, rows, remove: removed.map((s) => s.id) };
}

// ---------------------------------------------------------------------------------------------------------------
// What a save changes in a saved step

/** What a step asks for and how it scores: fixed once the step has results. */
export const MEANING_FIELDS = ["isMandatory", "isCritical", "weight", "visualCheck"] as const;
/** Wording: still editable on a step with results (typo and clarity fixes), and audited with the old text. */
export const WORDING_FIELDS = [
  "textAr",
  "textEn",
  "rationaleAr",
  "rationaleEn",
  "criteriaAr",
  "criteriaEn",
  "referenceLabel",
  "referenceUrl",
] as const;

export type MeaningField = (typeof MEANING_FIELDS)[number];
export type WordingField = (typeof WORDING_FIELDS)[number];

/**
 * The wording past reports and results show next to a step's verdict: what the step asks (text), why (rationale)
 * and what a compliant photo shows (criteria). Changing it on a step with results changes what those past reports
 * read, so the editor asks first. (A reference is a citation: fixing a link needs no confirmation.)
 */
export const REPORTED_WORDING_FIELDS = ["textAr", "textEn", "rationaleAr", "rationaleEn", "criteriaAr", "criteriaEn"] as const satisfies readonly WordingField[];

/** true when `wording` (changed fields) touches what past reports show. */
export function changesReportedWording(wording: readonly WordingField[]): boolean {
  return wording.some((f) => (REPORTED_WORDING_FIELDS as readonly WordingField[]).includes(f));
}
export type StepContent = Record<MeaningField, boolean | number> & Record<WordingField, string | null>;

/** The fields of `after` that differ from `before` (order: meaning first, then wording). */
export function changedStepFields(before: StepContent, after: StepContent): { meaning: MeaningField[]; wording: WordingField[] } {
  return {
    meaning: MEANING_FIELDS.filter((f) => before[f] !== after[f]),
    wording: WORDING_FIELDS.filter((f) => (before[f] ?? null) !== (after[f] ?? null)),
  };
}
