// What the read-only scan report of /admin/assessments says about the human decision on one protocol step.
// It follows lib/scoring.ts scanStepOutcome, the rule the stored score and risk were computed with: the examiner's
// finalVerdict wins; otherwise the AI verdict stands, because the examiner accepted it by finalising.
// Pure (no database import), unit-tested.
import { type AiVerdict, type FinalVerdict, scanStepOutcome, type StepOutcome } from "@/lib/scoring";

export type ScanStepDecision =
  /** The examiner set the verdict. `relation`: how it relates to the AI's (none when the AI gave no verdict). */
  | { kind: "examiner"; verdict: FinalVerdict; relation: "answered" | "confirmed" | "changed" }
  /** Finalised without an examiner verdict: the AI's compliant / non-compliant verdict stands. */
  | { kind: "aiAccepted"; verdict: Extract<StepOutcome, "compliant" | "non_compliant"> }
  /** Finalised with no usable verdict (e.g. the AI could not see it): scored as unresolved, not applicable. */
  | { kind: "unresolved" }
  /** Not finalised yet and the examiner has not decided. */
  | { kind: "pending" };

export function scanStepDecision(input: { finalized: boolean; aiVerdict: AiVerdict | null; finalVerdict: FinalVerdict | null }): ScanStepDecision {
  const { finalized, aiVerdict, finalVerdict } = input;
  if (finalVerdict) {
    const relation = aiVerdict === null || aiVerdict === "not_visible" ? "answered" : aiVerdict === finalVerdict ? "confirmed" : "changed";
    return { kind: "examiner", verdict: finalVerdict, relation };
  }
  if (!finalized) return { kind: "pending" };
  const { outcome, unresolved } = scanStepOutcome({ aiVerdict, finalVerdict });
  if (unresolved || outcome === "not_applicable") return { kind: "unresolved" };
  return { kind: "aiAccepted", verdict: outcome };
}
