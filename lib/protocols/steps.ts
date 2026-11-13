/**
 * Small pure helpers for protocol steps and their references (unit-tested).
 */

export type StepFlags = { isMandatory: boolean; isCritical: boolean; visualCheck: boolean };

export type StepSummary = {
  total: number;
  mandatory: number;
  critical: number;
  /** Steps a still photo can show (the smart scan checks these). */
  visual: number;
};

export function summarizeSteps(steps: ReadonlyArray<StepFlags>): StepSummary {
  const summary: StepSummary = { total: steps.length, mandatory: 0, critical: 0, visual: 0 };
  for (const step of steps) {
    if (step.isMandatory) summary.mandatory += 1;
    if (step.isCritical) summary.critical += 1;
    if (step.visualCheck) summary.visual += 1;
  }
  return summary;
}

/**
 * A reference link we are willing to render: absolute https only (the protocol editors already require it;
 * this is the second line of defence for content written before or around them). Anything else -> null, and the
 * label is shown as plain text.
 */
export function safeReferenceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN_LETTER = /[A-Za-z]/;

/**
 * The language of a reference label when it differs from the page (WCAG 3.1.2, language of parts): references
 * are usually the English title of a WHO / CDC document. "en" for Latin-only text, "ar" for Arabic-only text,
 * undefined when mixed or unknown (the page language applies).
 */
export function textLang(text: string): "ar" | "en" | undefined {
  const arabic = ARABIC_SCRIPT.test(text);
  const latin = LATIN_LETTER.test(text);
  if (arabic && !latin) return "ar";
  if (latin && !arabic) return "en";
  return undefined;
}
