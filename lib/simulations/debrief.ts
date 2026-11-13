import "server-only";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { DebriefFacts } from "@/lib/ai/debrief";
import { attemptsOwn, type Scope } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { prisma } from "@/lib/prisma";
import { prioritizeViolations } from "@/lib/scoring";
import { attemptsCreditedHere, canContinueIn } from "./attempt-scope";

/**
 * Facts for the AI debrief of one completed attempt (PRODUCT 4-5), loaded for its OWNER only (attemptsOwn): the
 * debrief is personal and counts against the caller's daily AI limit, so institution staff read a stored one but
 * never generate it for someone else. Violations come in the rule-based priority order (@/lib/scoring
 * prioritizeViolations), the same order as the recommendation list on the page.
 *
 * Like answering (./attempt-scope.ts), a NEW debrief of an attempt credited to an institution is written only while
 * that institution is the caller's active one: the model call is logged for that institution and the text is stored
 * on its attempt. A stored debrief is still read back anywhere (it is the owner's own history).
 */

/** Longest debrief we store (the model is asked for at most 5 sentences). */
export const MAX_DEBRIEF_CHARS = 4000;

export type DebriefContext =
  | { ok: true; stored: string | null; organizationId: string | null; facts: DebriefFacts }
  | { ok: false; error: "not_found" | "not_assessable"; status: number };

export async function debriefContext(scope: Scope, attemptId: string, locale: "ar" | "en"): Promise<DebriefContext> {
  const attempt = await prisma.simulationAttempt.findFirst({
    where: { AND: [{ id: attemptId, status: "completed" }, attemptsOwn(scope)] },
    select: {
      organizationId: true,
      score: true,
      riskLevel: true,
      debriefAr: true,
      debriefEn: true,
      scenario: { select: { titleAr: true, titleEn: true, protocol: { select: { titleAr: true, titleEn: true } } } },
      stepResults: {
        select: {
          compliant: true,
          critical: true,
          step: {
            select: {
              id: true,
              order: true,
              textAr: true,
              textEn: true,
              rationaleAr: true,
              rationaleEn: true,
              weight: true,
              isMandatory: true,
              isCritical: true,
            },
          },
        },
      },
    },
  });
  if (!attempt) return { ok: false, error: "not_found", status: 404 };
  if (attempt.score === null || attempt.riskLevel === null) return { ok: false, error: "not_assessable", status: 422 };
  const stored = (locale === "ar" ? attempt.debriefAr : attempt.debriefEn) ?? null;
  if (!stored && !canContinueIn(attempt.organizationId, scope)) return { ok: false, error: "not_found", status: 404 };

  const criticalIds = attempt.stepResults.filter((r) => r.critical).map((r) => r.step.id);
  const violated = prioritizeViolations(
    attempt.stepResults.filter((r) => !r.compliant).map((r) => r.step),
    criticalIds,
  );
  const strengths = attempt.stepResults
    .filter((r) => r.compliant)
    .map((r) => r.step)
    .sort((a, b) => a.order - b.order)
    .map((s) => pick(s, "text", locale));

  return {
    ok: true,
    stored,
    organizationId: attempt.organizationId,
    facts: {
      locale,
      scenarioTitle: pick(attempt.scenario, "title", locale),
      protocolTitle: pick(attempt.scenario.protocol, "title", locale),
      score: attempt.score,
      riskLevel: attempt.riskLevel,
      violations: violated.map((s) => ({
        step: pick(s, "text", locale),
        rationale: pick(s, "rationale", locale),
        critical: s.isCritical || criticalIds.includes(s.id),
      })),
      strengths,
    },
  };
}

/** Stores the finished debrief in the column of its language (the other one is untouched). */
export async function saveDebrief(scope: Scope, attemptId: string, locale: "ar" | "en", text: string): Promise<void> {
  const value = text.trim().slice(0, MAX_DEBRIEF_CHARS);
  if (!value) return;
  await prisma.simulationAttempt.updateMany({
    where: { AND: [{ id: attemptId }, attemptsOwn(scope), attemptsCreditedHere(scope)] },
    data: locale === "ar" ? { debriefAr: value } : { debriefEn: value },
  });
}

/** A stored debrief sent in the same UI message stream format as a live one (useCompletion reads both). */
export function storedDebriefResponse(text: string): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "text-start", id: "debrief" });
        writer.write({ type: "text-delta", id: "debrief", delta: text });
        writer.write({ type: "text-end", id: "debrief" });
      },
    }),
  });
}
