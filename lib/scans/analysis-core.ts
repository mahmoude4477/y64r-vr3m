import { ANALYSIS_STALE_MS, type ScanStatusValue } from "./constants";

/**
 * Pure rules of the scan analysis (unit-tested): which scans may be analysed, what each AI verdict writes to its
 * ScanStepResult row, and where the scan goes when the call fails.
 */

export type VerdictStep = {
  stepId: string;
  verdict: "compliant" | "non_compliant" | "not_visible";
  confidence: number;
  evidenceAr: string;
  evidenceEn: string;
};

const EVIDENCE_MAX = 1000;

function clampText(value: string): string {
  const t = value.trim();
  return t.length > EVIDENCE_MAX ? `${t.slice(0, EVIDENCE_MAX - 1)}…` : t;
}

/** ScanStepResult fields per verdict: confidence within 0..1 (3 decimals), evidence trimmed and capped. */
export function stepResultUpdates(steps: readonly VerdictStep[]) {
  return steps.map((s) => ({
    stepId: s.stepId,
    aiVerdict: s.verdict,
    aiConfidence: Number.isFinite(s.confidence) ? Math.round(Math.min(1, Math.max(0, s.confidence)) * 1000) / 1000 : 0,
    evidenceAr: clampText(s.evidenceAr) || null,
    evidenceEn: clampText(s.evidenceEn) || null,
  }));
}

export type AnalysisGate =
  | { ok: true; previous: "draft" | "failed" }
  | { ok: false; status: number; error: "finalized" | "already_analyzed" | "analysis_running" };

/**
 * A draft or failed scan may be analysed; so may one stuck in "analyzing" for longer than ANALYSIS_STALE_MS (its
 * request crashed). A scan under review or finalised keeps its verdicts. `previous` is where the scan goes back to when
 * the call never started.
 */
export function analysisGate(scan: { status: ScanStatusValue; updatedAt: Date }, now: Date = new Date()): AnalysisGate {
  switch (scan.status) {
    case "draft":
    case "failed":
      return { ok: true, previous: scan.status };
    case "analyzing":
      return now.getTime() - scan.updatedAt.getTime() > ANALYSIS_STALE_MS
        ? { ok: true, previous: "failed" }
        : { ok: false, status: 409, error: "analysis_running" };
    case "review":
      return { ok: false, status: 409, error: "already_analyzed" };
    case "finalized":
      return { ok: false, status: 409, error: "finalized" };
  }
}

/** Failures where no model call happened (nothing billed, nothing to review): the scan goes back where it was. */
const NOT_STARTED = new Set(["not_configured", "daily_limit", "too_many_requests"]);

export function statusAfterFailure(code: string, previous: "draft" | "failed"): "draft" | "failed" {
  return NOT_STARTED.has(code) ? previous : "failed";
}
