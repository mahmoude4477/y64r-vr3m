import type { LanguageModel } from "ai";

/**
 * E2E ONLY: a deterministic stand-in for Claude in analyzeScan (lib/ai/analyze-scan.ts), so Playwright gets real AI
 * verdicts on the review screen without calling Anthropic. lib/ai/model.ts loads this module with a dynamic import
 * ONLY when AI_PROVIDER=stub passes scanAiStubAllowed() (the e-mail file sink's guard). analyzeScan runs unchanged
 * around it: the per-user limits, the AiCall row, the structured-output parsing and normalizeVerdict.
 *
 * Verdicts follow the step order of the checklist: compliant (0.92), non_compliant (0.81), not_visible (0.35),
 * compliant with low confidence (0.55), then again. Evidence names the stub, so nobody mistakes it for an analysis.
 */

type V4 = Extract<LanguageModel, { specificationVersion: "v4" }>;
type CallOptions = Parameters<V4["doGenerate"]>[0];
type GenerateResult = Awaited<ReturnType<V4["doGenerate"]>>;

export const STUB_MODEL_ID = "e2e-stub";

const PATTERN = [
  { verdict: "compliant", confidence: 0.92 },
  { verdict: "non_compliant", confidence: 0.81 },
  { verdict: "not_visible", confidence: 0.35 },
  { verdict: "compliant", confidence: 0.55 },
] as const;

/** The stub's answer for these step ids (pure, unit-tested). */
export function stubVerdict(stepIds: readonly string[]) {
  return {
    steps: stepIds.map((stepId, i) => {
      const p = PATTERN[i % PATTERN.length];
      return {
        stepId,
        evidenceEn: `Automated test result (e2e stub), photo 1: ${p.verdict.replace("_", " ")}.`,
        evidenceAr: `نتيجة اختبار آلي (نموذج بديل للاختبار)، الصورة 1: ${p.verdict === "compliant" ? "ممتثل" : p.verdict === "non_compliant" ? "غير ممتثل" : "غير ظاهر"}.`,
        verdict: p.verdict,
        confidence: p.confidence,
      };
    }),
    overallNotesAr: "نتيجة اختبار آلي من نموذج بديل، وليست تحليلًا حقيقيًا للصور.",
    overallNotesEn: "Automated test result from a stand-in model, not a real analysis of the photos.",
  };
}

/** The checklist's step ids from the structured-output schema (an enum), else from the prompt's checklist JSON. */
export function stepIdsFrom(options: Pick<CallOptions, "responseFormat" | "prompt">): string[] {
  const fromSchema = findStepIdEnum(options.responseFormat?.type === "json" ? options.responseFormat.schema : undefined);
  if (fromSchema) return fromSchema;
  for (const message of options.prompt) {
    if (message.role !== "user") continue;
    for (const part of message.content) {
      if (part.type !== "text") continue;
      const at = part.text.indexOf("Checklist:\n");
      if (at < 0) continue;
      try {
        const list = JSON.parse(part.text.slice(at + "Checklist:\n".length)) as Array<{ stepId?: unknown }>;
        return list.map((s) => String(s.stepId));
      } catch {
        return [];
      }
    }
  }
  return [];
}

function findStepIdEnum(node: unknown, depth = 0): string[] | null {
  if (!node || typeof node !== "object" || depth > 12) return null;
  const record = node as Record<string, unknown>;
  const stepId = (record.properties as Record<string, { enum?: unknown }> | undefined)?.stepId;
  if (Array.isArray(stepId?.enum) && stepId.enum.every((v) => typeof v === "string")) return stepId.enum as string[];
  for (const value of Object.values(record)) {
    const found = findStepIdEnum(value, depth + 1);
    if (found) return found;
  }
  return null;
}

export function createScanStubModel(): V4 {
  return {
    specificationVersion: "v4",
    provider: "e2e-stub",
    modelId: STUB_MODEL_ID,
    supportedUrls: {},
    async doGenerate(options: CallOptions): Promise<GenerateResult> {
      const json = stubVerdict(stepIdsFrom(options));
      return {
        content: [{ type: "text", text: JSON.stringify(json) }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 0, text: 0, reasoning: 0 },
        },
        warnings: [],
        response: { modelId: STUB_MODEL_ID },
      };
    },
    async doStream() {
      throw new Error("e2e stub: streaming is not supported");
    },
  };
}
