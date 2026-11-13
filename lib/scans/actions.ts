"use server";

import { hasLocale } from "next-intl";
import { refresh } from "next/cache";
import type * as z from "zod";
import { routing } from "@/i18n/routing";
import { takeAppRateLimit } from "@/lib/app-rate-limit";
import { isOrgStaff, scopeOf } from "@/lib/authz";
import { log } from "@/lib/log";
import { type AuthContext, requireUser } from "@/lib/session";
import {
  deleteUnfinishedScan,
  finalizeScan,
  type FinalizeResult,
  type ReviewError,
  type SavedStep,
  saveScanNotes,
  saveStepDecision,
} from "./review";
import { saveStepSchema, scanIdSchema, scanNotesSchema } from "./schemas";

// Server Actions of the scan review (/scans/[id]). Each one validates its input, signs the user in (requireUser:
// guests go to sign-in, mustChangePassword to the password page), checks that they are staff of the ACTIVE institution,
// applies an app rate limit and calls lib/scans/review.ts, which scopes every query with scansWritable. Failures come
// back as stable codes that the review screen translates (lib/scans/client/review-errors.ts); nothing here returns
// database rows beyond what the screen shows.

export type ActionError = ReviewError | "bad_locale" | "invalid_input" | "slow_down" | "failed";
export type ActionFailure = { ok: false; error: ActionError; missing?: string[] };

async function guard<S extends z.ZodType>(
  locale: string,
  schema: S,
  input: unknown,
  limit: { name: string; max: number; windowSec: number },
): Promise<{ ok: true; ctx: AuthContext; data: z.infer<S> } | ActionFailure> {
  if (!hasLocale(routing.locales, locale)) return { ok: false, error: "bad_locale" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await requireUser();
  if (!isOrgStaff(scopeOf(ctx))) return { ok: false, error: "forbidden" };
  if (!(await takeAppRateLimit(`scans:${limit.name}:${ctx.user.id}`, limit.max, limit.windowSec))) {
    return { ok: false, error: "slow_down" };
  }
  return { ok: true, ctx, data: parsed.data };
}

/** Unexpected errors: logged with the action name, answered with "failed" (no details leave the server). */
async function run<T>(event: string, scanId: string | undefined, fn: () => Promise<T>): Promise<T | ActionFailure> {
  try {
    return await fn();
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    log.error(`${event}.error`, { scanId, err });
    return { ok: false, error: "failed" };
  }
}

/** redirect() / notFound() from requireUser must reach Next untouched. */
function isNextControlFlow(err: unknown): boolean {
  const digest = typeof err === "object" && err !== null ? String((err as { digest?: unknown }).digest ?? "") : "";
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK");
}

/** Save one step's decision (`verdict`, null clears it) and/or its note. No re-render: the screen keeps its own state. */
export async function saveStepAction(locale: string, input: unknown): Promise<SavedStep | ActionFailure> {
  const g = await guard(locale, saveStepSchema, input, { name: "review-step", max: 600, windowSec: 600 });
  if (!g.ok) return g;
  return run("scan.review.step", g.data.scanId, () => saveStepDecision(scopeOf(g.ctx), g.data));
}

export async function saveScanNotesAction(locale: string, input: unknown): Promise<{ ok: true; notes: string | null } | ActionFailure> {
  const g = await guard(locale, scanNotesSchema, input, { name: "review-notes", max: 120, windowSec: 600 });
  if (!g.ok) return g;
  return run("scan.review.notes", g.data.scanId, () => saveScanNotes(scopeOf(g.ctx), g.data));
}

/** Finalise; on success the page re-renders as the read-only report in the same response (refresh()). */
export async function finalizeScanAction(locale: string, input: unknown): Promise<FinalizeResult | ActionFailure> {
  const g = await guard(locale, scanIdSchema, input, { name: "finalize", max: 30, windowSec: 600 });
  if (!g.ok) return g;
  const result = await run("scan.finalize", g.data.scanId, () => finalizeScan(g.ctx, g.data.scanId));
  if (result.ok) {
    log.info("scan.finalize.done", { scanId: g.data.scanId, score: result.score, riskLevel: result.riskLevel });
    refresh();
  }
  return result;
}

/** Delete an unfinished scan; the screen then goes to the scan list (the list is dynamic: it loads fresh). */
export async function deleteScanAction(locale: string, input: unknown): Promise<{ ok: true } | ActionFailure> {
  const g = await guard(locale, scanIdSchema, input, { name: "delete", max: 30, windowSec: 600 });
  if (!g.ok) return g;
  const result = await run("scan.delete", g.data.scanId, () => deleteUnfinishedScan(g.ctx, g.data.scanId));
  if (result.ok) log.info("scan.delete.done", { scanId: g.data.scanId });
  return result;
}
