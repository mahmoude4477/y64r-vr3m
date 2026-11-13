import { type AiVerdict, canFinalizeScan, type FinalVerdict, type ScoreResult, scoreScan, type StepMeta } from "@/lib/scoring";
import { ANALYSIS_STALE_MS, HIGH_CONFIDENCE, REVIEW_BELOW, REVIEWABLE_STATUSES, type ScanStatusValue } from "./constants";

/**
 * Pure rules of the review and the finalisation (unit-tested in review-core.test.ts, shared by the server actions and
 * the review screen). Scoring itself is lib/scoring (never re-implemented here): this file only decides what is
 * editable, what an examiner's decision writes, and what finalising persists.
 */

export type ReviewResult = {
  stepId: string;
  aiVerdict: AiVerdict | null;
  finalVerdict: FinalVerdict | null;
  /** Only finalising reads it (the audit row counts unsure AI verdicts nobody checked). */
  aiConfidence?: number | null;
};

/** A crashed analysis ("analyzing" for longer than ANALYSIS_STALE_MS) is shown and handled as a failed one. */
export function isStaleAnalysis(scan: { status: ScanStatusValue; updatedAt: Date }, now: Date = new Date()): boolean {
  return scan.status === "analyzing" && now.getTime() - scan.updatedAt.getTime() > ANALYSIS_STALE_MS;
}

/** The status the page works with: a stale "analyzing" becomes "failed". */
export function effectiveStatus(scan: { status: ScanStatusValue; updatedAt: Date }, now: Date = new Date()): ScanStatusValue {
  return isStaleAnalysis(scan, now) ? "failed" : scan.status;
}

/** draft / review / failed (and a stale analysis): the examiner may answer, override, add notes, finalise or delete. */
export function isReviewable(status: ScanStatusValue): boolean {
  return (REVIEWABLE_STATUSES as readonly string[]).includes(status);
}

/** AI verdicts that settle a step on their own (not_visible does not). */
export function isDecisiveAi(verdict: AiVerdict | null | undefined): verdict is "compliant" | "non_compliant" {
  return verdict === "compliant" || verdict === "non_compliant";
}

/**
 * What an examiner's decision writes to ScanStepResult. `verdict: null` clears the decision (the AI verdict counts
 * again, or the step is unanswered). `overriddenById` names the person who decided the step: an override of the AI,
 * a CONFIRMATION of the AI's own verdict (the examiner looked and agreed: the report says "confirmed by", which an
 * institution must be able to tell apart from an AI verdict nobody checked), a decision on a step the AI could not
 * see, an answer to a step the AI does not check. It stays null only for the AI verdicts that finalising accepts
 * (finalizePlan acceptAi): nobody decided those. Whether a decision changed the AI verdict is read from the verdicts
 * themselves (aiVerdict vs finalVerdict), never from this column.
 */
export function decisionFields(
  verdict: FinalVerdict | null,
  userId: string,
): { finalVerdict: FinalVerdict | null; overriddenById: string | null } {
  if (verdict === null) return { finalVerdict: null, overriddenById: null };
  return { finalVerdict: verdict, overriddenById: userId };
}

/** The verdict a step shows as selected: the examiner's, else a decisive AI verdict, else none. */
export function selectedVerdict(result: Pick<ReviewResult, "aiVerdict" | "finalVerdict">): FinalVerdict | null {
  if (result.finalVerdict) return result.finalVerdict;
  return isDecisiveAi(result.aiVerdict) ? result.aiVerdict : null;
}

export type StepReviewState =
  /** A decisive AI verdict, not changed: it counts when the scan is finalised. */
  | "ai_accepted"
  /** The examiner chose the AI's verdict explicitly. */
  | "ai_confirmed"
  /** The examiner chose another verdict than the AI's. */
  | "changed"
  /** The examiner decided a step the AI could not see. */
  | "resolved"
  /** The examiner answered a step without an AI verdict. */
  | "answered"
  /** AI could not see it and nobody decided: not counted, listed as not visible. */
  | "unresolved"
  /** No answer at all: blocks finalising when the step is mandatory or critical. */
  | "unanswered";

export function stepReviewState(result: Pick<ReviewResult, "aiVerdict" | "finalVerdict">): StepReviewState {
  const { aiVerdict, finalVerdict } = result;
  if (finalVerdict) {
    if (isDecisiveAi(aiVerdict)) return aiVerdict === finalVerdict ? "ai_confirmed" : "changed";
    return aiVerdict === "not_visible" ? "resolved" : "answered";
  }
  if (isDecisiveAi(aiVerdict)) return "ai_accepted";
  return aiVerdict === "not_visible" ? "unresolved" : "unanswered";
}

export type ConfidenceLevel = "high" | "medium" | "low";

/** Confidence wording: high from 0.8, low under the analysis' own review threshold (0.6). */
export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= HIGH_CONFIDENCE) return "high";
  return confidence < REVIEW_BELOW ? "low" : "medium";
}

/** The analysis flags this verdict for the examiner (lib/ai/analyze-scan needsReview: low confidence or not visible). */
export function aiNeedsReview(aiVerdict: AiVerdict | null, confidence: number | null): boolean {
  if (!aiVerdict) return false;
  return aiVerdict === "not_visible" || (confidence ?? 0) < REVIEW_BELOW;
}

export type FinalizePlan =
  | { ok: false; missing: string[] }
  | {
      ok: true;
      /** null when nothing was assessable (persist null, show "not assessable", never 0 % or high). */
      score: number | null;
      riskLevel: ScoreResult["riskLevel"];
      result: ScoreResult;
      /** Steps whose decisive AI verdict the examiner accepted by finalising: finalVerdict is written for them. */
      acceptAi: Array<{ stepId: string; finalVerdict: "compliant" | "non_compliant" }>;
      /** Of acceptAi, the verdicts the AI itself was unsure about (aiNeedsReview): accepted without a check. */
      unsureUnchecked: number;
    };

/**
 * What finalising persists: canFinalizeScan must be ok (every mandatory or critical step answered), then the scan's
 * score and risk from scoreScan. Accepted AI verdicts are written as the final verdict, so every decided step of a
 * finalised scan has finalVerdict set (reports aggregate on it); not-visible steps nobody decided stay null (unresolved).
 */
export function finalizePlan(steps: readonly StepMeta[], results: readonly ReviewResult[]): FinalizePlan {
  const gate = canFinalizeScan(steps, results);
  if (!gate.ok) return { ok: false, missing: gate.missing };
  const result = scoreScan(steps, results);
  const accepted = results.filter(
    (r): r is ReviewResult & { aiVerdict: "compliant" | "non_compliant" } => !r.finalVerdict && isDecisiveAi(r.aiVerdict),
  );
  return {
    ok: true,
    score: result.assessable ? result.score : null,
    riskLevel: result.assessable ? result.riskLevel : null,
    result,
    acceptAi: accepted.map((r) => ({ stepId: r.stepId, finalVerdict: r.aiVerdict })),
    unsureUnchecked: accepted.filter((r) => aiNeedsReview(r.aiVerdict, r.aiConfidence ?? null)).length,
  };
}

/**
 * How a finalised report explains a step's final result (finalising wrote finalVerdict for every decided step):
 *  - changed: the examiner chose another verdict than the AI's (with their name when known);
 *  - confirmed: the examiner chose the AI's own verdict (overriddenById set: decidedBy);
 *  - accepted: a decisive AI verdict nobody touched, accepted by finalising;
 *  - acceptedUnsure: the same, but the AI itself was unsure (under REVIEW_BELOW): accepted without a person's check;
 *  - decided: the examiner answered a step the AI could not see or does not check;
 *  - none: no final verdict (not visible, or an optional step left unanswered).
 * A person deleted later leaves decidedBy null (onDelete SetNull): changed still reads "changed", a confirmation
 * reads "accepted" (foundation request: a decidedAt / decider snapshot on ScanStepResult).
 */
export type ReportDecision = "changed" | "confirmed" | "accepted" | "acceptedUnsure" | "decided" | "none";

export function reportDecision(step: {
  aiVerdict: AiVerdict | null;
  aiConfidence: number | null;
  finalVerdict: FinalVerdict | null;
  decidedBy: string | null;
}): ReportDecision {
  const { aiVerdict, finalVerdict, decidedBy } = step;
  if (!finalVerdict) return "none";
  if (!isDecisiveAi(aiVerdict)) return "decided";
  if (aiVerdict !== finalVerdict) return "changed";
  if (decidedBy) return "confirmed";
  return aiNeedsReview(aiVerdict, step.aiConfidence) ? "acceptedUnsure" : "accepted";
}

export type RiskReason = "critical" | "lowScore" | "mandatory" | "mediumScore" | "allCompliant" | "minorGaps" | "notAssessable";

/** One line that says why the risk level is what it is (lib/scoring rules: critical, < 50, mandatory, < 80). */
export function riskReason(result: Pick<ScoreResult, "assessable" | "score" | "criticalViolations" | "mandatoryViolations" | "violated">): RiskReason {
  if (!result.assessable) return "notAssessable";
  if (result.criticalViolations.length > 0) return "critical";
  if (result.score < 50) return "lowScore";
  if (result.mandatoryViolations.length > 0) return "mandatory";
  if (result.score < 80) return "mediumScore";
  return result.violated.length > 0 ? "minorGaps" : "allCompliant";
}

/**
 * What a finalised report says about its risk, kept consistent with what finalising STORED (Scan.score and riskLevel).
 * The step results and verdicts never change after finalising, but a step's isCritical / isMandatory / weight may be
 * corrected later (the seed updates protocol content), so recomputing the reason from today's flags could contradict
 * the stored risk ("High" with "a mandatory step was violated"). The stored risk decides which reasons are possible,
 * today's flags only choose between two that are both true:
 *  - high: a critical step was violated, or the score is under 50 (critical first, as lib/scoring);
 *  - medium: no critical violation was stored (it would be high), so a mandatory step was violated or the score is
 *    under 80;
 *  - low: no critical and no mandatory violation; only optional gaps, or all compliant;
 *  - no stored risk: not assessable.
 * criticalViolations / mandatoryViolations are today's lists narrowed the same way (the report's badges and the
 * recommendation order). Foundation request: snapshot the step flags (or the reason) on the scan when it is finalised.
 */
export function reportOutcome(
  result: Pick<ScoreResult, "criticalViolations" | "mandatoryViolations" | "violated">,
  stored: { score: number | null; riskLevel: ScoreResult["riskLevel"] },
): { reason: RiskReason; criticalViolations: string[]; mandatoryViolations: string[] } {
  const { score, riskLevel } = stored;
  if (score === null || riskLevel === null) return { reason: "notAssessable", criticalViolations: [], mandatoryViolations: [] };
  if (riskLevel === "high") {
    const critical = [...result.criticalViolations];
    const reason = critical.length > 0 || score >= 50 ? "critical" : "lowScore";
    return { reason, criticalViolations: critical, mandatoryViolations: [...result.mandatoryViolations] };
  }
  if (riskLevel === "medium") {
    const mandatory = [...result.mandatoryViolations];
    const reason = mandatory.length > 0 || score >= 80 ? "mandatory" : "mediumScore";
    return { reason, criticalViolations: [], mandatoryViolations: mandatory };
  }
  return { reason: result.violated.length > 0 ? "minorGaps" : "allCompliant", criticalViolations: [], mandatoryViolations: [] };
}

export type DeleteGate = { ok: true } | { ok: false; error: "finalized" | "analysis_running" | "forbidden" };

/**
 * Who may delete a scan that is not finalised: managers (owner / admin) any of the institution's drafts, an examiner
 * only the scans they started. A finalised scan is an audit record and is never deleted here; neither is a scan whose
 * analysis is running.
 */
export function deleteGate(
  actor: { userId: string; manager: boolean },
  scan: { status: ScanStatusValue; updatedAt: Date; examinerId: string | null },
  now: Date = new Date(),
): DeleteGate {
  const status = effectiveStatus(scan, now);
  if (status === "finalized") return { ok: false, error: "finalized" };
  if (status === "analyzing") return { ok: false, error: "analysis_running" };
  if (!actor.manager && scan.examinerId !== actor.userId) return { ok: false, error: "forbidden" };
  return { ok: true };
}
