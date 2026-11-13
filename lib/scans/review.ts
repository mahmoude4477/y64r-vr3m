import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { isOrgManager, isOrgStaff, scansWritable, type Scope, scopeOf } from "@/lib/authz";
import { deleteScansWithPhotos } from "@/lib/data-lifecycle";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/session";
import { ANALYSIS_STALE_MS, REVIEWABLE_STATUSES } from "./constants";
import { decisionFields, deleteGate, finalizePlan } from "./review-core";
import type { SaveStepInput, ScanNotesInput } from "./schemas";

/**
 * The examiner's review of one scan of the ACTIVE institution (scansWritable): step decisions and notes, finalising,
 * deleting an unfinished scan. Server Actions (lib/scans/actions.ts) validate the input and call these.
 *
 * Every write that depends on the scan's status first takes the scan row's lock with a conditional UPDATE (status still
 * reviewable). Finalising holds the same lock while it reads the step rows, scores them and saves, so a step decision
 * that arrives at the same moment either lands before the score is computed or is refused ("finalized"): the stored
 * score always matches the stored verdicts, and a finalised scan never changes again.
 */

type Tx = Prisma.TransactionClient;

export type ReviewError = "forbidden" | "not_found" | "finalized" | "analysis_running" | "incomplete";
export type ReviewFailure = { ok: false; error: ReviewError; missing?: string[] };

const fail = (error: ReviewError, extra?: { missing?: string[] }): ReviewFailure => ({ ok: false, error, ...extra });

const reviewable = { status: { in: [...REVIEWABLE_STATUSES] } } satisfies Prisma.ScanWhereInput;

/**
 * Locks the scan row for this transaction if the examiner may still change it. A crashed analysis (stale "analyzing")
 * is turned into "failed" first, so the examiner can carry on by hand.
 */
async function lockReviewableScan(tx: Tx, scope: Scope, scanId: string): Promise<{ ok: true } | ReviewFailure> {
  const where = { id: scanId, ...scansWritable(scope) };
  await tx.scan.updateMany({
    where: { ...where, status: "analyzing", updatedAt: { lt: new Date(Date.now() - ANALYSIS_STALE_MS) } },
    data: { status: "failed" },
  });
  const locked = await tx.scan.updateMany({ where: { ...where, ...reviewable }, data: { updatedAt: new Date() } });
  if (locked.count === 1) return { ok: true };
  const scan = await tx.scan.findFirst({ where, select: { status: true } });
  if (!scan) return fail("not_found");
  return fail(scan.status === "finalized" ? "finalized" : "analysis_running");
}

export type SavedStep = {
  ok: true;
  stepId: string;
  finalVerdict: "compliant" | "non_compliant" | "not_applicable" | null;
  note: string | null;
};

/** One step's decision and/or note (only the fields present in the input change). */
export async function saveStepDecision(scope: Scope, input: SaveStepInput): Promise<SavedStep | ReviewFailure> {
  if (!isOrgStaff(scope)) return fail("forbidden");
  const key = { scanId_stepId: { scanId: input.scanId, stepId: input.stepId } };
  return prisma.$transaction(async (tx) => {
    const lock = await lockReviewableScan(tx, scope, input.scanId);
    if (!lock.ok) return lock;
    const row = await tx.scanStepResult.findUnique({ where: key, select: { id: true } });
    if (!row) return fail("not_found");
    const data: Prisma.ScanStepResultUncheckedUpdateInput = {};
    if (input.verdict !== undefined) Object.assign(data, decisionFields(input.verdict, scope.userId));
    if (input.note !== undefined) data.note = input.note || null;
    const saved = await tx.scanStepResult.update({ where: key, data, select: { stepId: true, finalVerdict: true, note: true } });
    return { ok: true as const, ...saved };
  });
}

/** The examiner's notes on the whole scan (Scan.notes, shown in the report), under the same lock as the steps. */
export async function saveScanNotes(scope: Scope, input: ScanNotesInput): Promise<{ ok: true; notes: string | null } | ReviewFailure> {
  if (!isOrgStaff(scope)) return fail("forbidden");
  const notes = input.notes || null;
  return prisma.$transaction(async (tx) => {
    const lock = await lockReviewableScan(tx, scope, input.scanId);
    if (!lock.ok) return lock;
    await tx.scan.update({ where: { id: input.scanId }, data: { notes } });
    return { ok: true as const, notes };
  });
}

export type FinalizeResult = { ok: true; score: number | null; riskLevel: "low" | "medium" | "high" | null } | ReviewFailure;

/**
 * Finalise: every mandatory or critical step answered (canFinalizeScan), then score + risk from lib/scoring
 * (null + null when nothing was assessable), finalizedAt / finalizedById, accepted AI verdicts written as final
 * verdicts, and the "scan.finalize" audit row, all in one transaction (the audit row rolls back with it).
 */
export async function finalizeScan(ctx: AuthContext, scanId: string): Promise<FinalizeResult> {
  const scope = scopeOf(ctx);
  if (!isOrgStaff(scope)) return fail("forbidden");
  return prisma.$transaction(async (tx) => {
    const lock = await lockReviewableScan(tx, scope, scanId);
    if (!lock.ok) return lock;
    const scan = await tx.scan.findFirstOrThrow({
      where: { id: scanId, ...scansWritable(scope) },
      select: {
        protocolId: true,
        _count: { select: { photos: true } },
        stepResults: {
          select: {
            stepId: true,
            aiVerdict: true,
            aiConfidence: true,
            finalVerdict: true,
            step: { select: { weight: true, isMandatory: true, isCritical: true, order: true } },
          },
        },
      },
    });
    const rows = [...scan.stepResults].sort((a, b) => a.step.order - b.step.order);
    const steps = rows.map((r) => ({ id: r.stepId, weight: r.step.weight, isMandatory: r.step.isMandatory, isCritical: r.step.isCritical }));
    const plan = finalizePlan(
      steps,
      rows.map((r) => ({ stepId: r.stepId, aiVerdict: r.aiVerdict, finalVerdict: r.finalVerdict, aiConfidence: r.aiConfidence })),
    );
    if (!plan.ok) return fail("incomplete", { missing: plan.missing });

    for (const verdict of ["compliant", "non_compliant"] as const) {
      const ids = plan.acceptAi.filter((a) => a.finalVerdict === verdict).map((a) => a.stepId);
      if (ids.length === 0) continue;
      await tx.scanStepResult.updateMany({
        where: { scanId, stepId: { in: ids }, finalVerdict: null, aiVerdict: verdict },
        data: { finalVerdict: verdict },
      });
    }
    await tx.scan.update({
      where: { id: scanId },
      data: {
        status: "finalized",
        score: plan.score,
        riskLevel: plan.riskLevel,
        finalizedAt: new Date(),
        finalizedById: scope.userId,
      },
    });
    await writeAudit(
      ctx,
      "scan.finalize",
      { type: "scan", id: scanId },
      {
        protocolId: scan.protocolId,
        score: plan.score,
        riskLevel: plan.riskLevel,
        steps: steps.length,
        violated: plan.result.violated.length,
        critical: plan.result.criticalViolations.length,
        unresolved: plan.result.unresolved.length - plan.result.unanswered.length,
        // AI verdicts under the review threshold that nobody confirmed or changed: they count as the AI gave them.
        unsureUnchecked: plan.unsureUnchecked,
        photos: scan._count.photos,
      },
      { tx },
    );
    return { ok: true as const, score: plan.score, riskLevel: plan.riskLevel };
  });
}

export type DeleteResult = { ok: true } | ReviewFailure;

/**
 * Deletes a scan that is not finalised (deleteGate: managers any, an examiner only their own), with its step rows,
 * photo rows and bucket objects, and writes "scan.delete" in the same transaction.
 *
 * deleteScansWithPhotos (lib/data-lifecycle.ts) with the status rule as its `where`, so the rule sits INSIDE the delete
 * statement: a scan finalised by someone else a moment earlier is never deleted, and neither are its photos.
 */
export async function deleteUnfinishedScan(ctx: AuthContext, scanId: string): Promise<DeleteResult> {
  const scope = scopeOf(ctx);
  if (!isOrgStaff(scope)) return fail("forbidden");
  const manager = isOrgManager(scope);
  const where = { id: scanId, ...scansWritable(scope) };
  const scan = await prisma.scan.findFirst({
    where,
    select: { status: true, updatedAt: true, examinerId: true, protocolId: true },
  });
  if (!scan) return fail("not_found");
  const gate = deleteGate({ userId: scope.userId, manager }, scan);
  if (!gate.ok) return fail(gate.error);

  const deletable: Prisma.ScanWhereInput = {
    ...where,
    OR: [reviewable, { status: "analyzing", updatedAt: { lt: new Date(Date.now() - ANALYSIS_STALE_MS) } }],
    ...(manager ? {} : { examinerId: scope.userId }),
  };
  const deleted = await deleteScansWithPhotos([scanId], {
    where: deletable,
    audit: (tx, { photos }) =>
      writeAudit(ctx, "scan.delete", { type: "scan", id: scanId }, { protocolId: scan.protocolId, status: scan.status, photos }, { tx }),
  });
  if (deleted === 0) {
    const now = await prisma.scan.findFirst({ where, select: { status: true } });
    return fail(!now ? "not_found" : now.status === "finalized" ? "finalized" : "analysis_running");
  }
  return { ok: true };
}
