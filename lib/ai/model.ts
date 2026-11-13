import "server-only";
import { type AnthropicLanguageModelOptions, createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { connection } from "next/server";
import { fileSinkAllowed } from "@/lib/email";
import { getSetting } from "@/lib/settings";

/**
 * Claude via the Vercel AI SDK (@ai-sdk/anthropic). Model id and effort come from AppSetting
 * (admin panel) -> env (AI_MODEL / AI_EFFORT) -> defaults. Never pass temperature / topP / topK
 * (the API rejects them) and never set `thinking` (Opus 5.5 is adaptive-only; effort is the control).
 */
export const DEFAULT_AI_MODEL = "claude-opus-5-5";
export const DEFAULT_AI_EFFORT = "medium" satisfies AiEffort;

export type AiEffort = NonNullable<AnthropicLanguageModelOptions["effort"]>;
export const AI_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const satisfies readonly AiEffort[];

export type AiConfig = { modelId: string; effort: AiEffort };

/** True when ANTHROPIC_API_KEY is set. Features show common.states.aiOff otherwise. */
export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

/**
 * isAiConfigured() read at request time. Use this in Server Components (or call isAiConfigured() inside
 * the Suspense'd data component): under cacheComponents an env read in the static part of a page runs at
 * build time and is frozen into the prerendered HTML.
 */
export async function aiConfiguredAtRequest(): Promise<boolean> {
  await connection();
  return isAiConfigured();
}

function isEffort(value: unknown): value is AiEffort {
  return typeof value === "string" && (AI_EFFORTS as readonly string[]).includes(value);
}

export async function getAiConfig(): Promise<AiConfig> {
  const [modelSetting, effortSetting] = await Promise.all([getSetting("ai.model"), getSetting("ai.effort")]);
  const envModel = process.env.AI_MODEL?.trim();
  const envEffort = process.env.AI_EFFORT?.trim();
  return {
    modelId: modelSetting ?? (envModel || DEFAULT_AI_MODEL),
    effort: effortSetting ?? (isEffort(envEffort) ? envEffort : DEFAULT_AI_EFFORT),
  };
}

/**
 * E2E ONLY (scans test seam, e2e/README.md): AI_PROVIDER=stub answers analyzeScan with a deterministic local model
 * (lib/scans/e2e/ai-stub.ts) so Playwright gets AI verdicts without Anthropic. Scan analysis only (the debrief and
 * isAiConfigured() are unchanged), and only behind the e-mail file sink's guard (WAQAYA_E2E=1, loopback http
 * BETTER_AUTH_URL, no RAILWAY_* variable). Requested but refused = no stub (the normal Claude path).
 */
export function scanAiStubAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.AI_PROVIDER?.trim().toLowerCase() === "stub" && fileSinkAllowed(env);
}

/** The stub model; the module is loaded only after the guard passed (never in the normal path). */
export async function scanAiStubModel(): Promise<LanguageModel> {
  if (!scanAiStubAllowed()) throw new Error("scan AI stub refused outside end-to-end tests");
  return (await import("@/lib/scans/e2e/ai-stub")).createScanStubModel();
}

let provider: ReturnType<typeof createAnthropic> | undefined;

/** Lazily created so `next build` and tests never need the key. Reads ANTHROPIC_API_KEY. */
export function getLanguageModel(modelId: string) {
  provider ??= createAnthropic();
  return provider(modelId);
}

/**
 * The only provider knobs we send: effort, server-side fallbacks on refusal ("default" adds the
 * server-side-fallback beta header automatically) and an opaque user id (no PII).
 */
export function claudeProviderOptions(input: { effort: AiEffort; userId?: string }) {
  return {
    anthropic: {
      effort: input.effort,
      fallbacks: "default",
      ...(input.userId ? { metadata: { userId: input.userId } } : {}),
    } satisfies AnthropicLanguageModelOptions,
  };
}
