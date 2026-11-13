"use server";

import { attempt, badLocale, DB_FAILED, failure, revalidateAdmin, type ActionResult } from "@/lib/admin/action-result";
import { deleteAttemptSchema, deleteScanSchema } from "@/lib/admin/schemas";
import { isAppLocale } from "@/i18n/routing";
import { writeAudit } from "@/lib/audit";
import { deleteScansWithPhotos } from "@/lib/data-lifecycle";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/session";

// Platform-admin deletes of abusive content on /admin/assessments (PRODUCT 6a): one scan with its photos, or one
// simulation attempt. Order in every action: locale, input, platform admin (requirePlatformAdmin: not-found for
// anyone else), then the write and its audit row. The reason is one of DELETE_REASONS (never free text).

/**
 * Deletes a scan with its step results, photo rows and bucket objects (deleteScansWithPhotos, CONVENTIONS 6) and writes
 * "scan.delete" in the same transaction (its `audit` callback): the delete and its row commit together or not at all.
 */
export async function deleteScanAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = deleteScanSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  const { scanId, reason } = parsed.data;
  const done = await attempt("admin.scan.delete_failed", async () => {
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      select: { organizationId: true, protocolId: true, status: true, _count: { select: { photos: true } } },
    });
    if (!scan) return null;
    const deleted = await deleteScansWithPhotos([scanId], {
      audit: (tx) =>
        writeAudit(
          ctx,
          "scan.delete",
          { type: "scan", id: scanId },
          { organizationId: scan.organizationId, protocolId: scan.protocolId, status: scan.status, photos: scan._count.photos, reason, by: "platform_admin" },
          { tx },
        ),
    });
    return deleted > 0 ? scan : null;
  });
  if (done === DB_FAILED) return failure(locale, "generic");
  if (!done) return failure(locale, "notFound");
  revalidateAdmin(locale);
  return { ok: true };
}

/** Deletes one simulation attempt (its answers and step results cascade) and writes "attempt.delete" in the same transaction. */
export async function deleteAttemptAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = deleteAttemptSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  const { attemptId, reason } = parsed.data;
  const done = await attempt("admin.attempt.delete_failed", () =>
    prisma.$transaction(async (tx) => {
      const row = await tx.simulationAttempt.findUnique({
        where: { id: attemptId },
        select: { userId: true, organizationId: true, scenarioId: true, status: true },
      });
      if (!row) return false;
      await tx.simulationAttempt.delete({ where: { id: attemptId } });
      await writeAudit(
        ctx,
        "attempt.delete",
        { type: "simulation_attempt", id: attemptId },
        { userId: row.userId, organizationId: row.organizationId, scenarioId: row.scenarioId, status: row.status, reason },
        { tx },
      );
      return true;
    }),
  );
  if (done === DB_FAILED) return failure(locale, "generic");
  if (!done) return failure(locale, "notFound");
  revalidateAdmin(locale);
  return { ok: true };
}
