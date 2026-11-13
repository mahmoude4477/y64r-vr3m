import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { analyzeScan, SCAN_IMAGE_TYPES, type ScanImageType } from "@/lib/ai/analyze-scan";
import { aiFailureStatus } from "@/lib/ai/errors";
import { scansWritable, type Scope } from "@/lib/authz";
import type { Logger } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { detectImageType, getObjectBytes, MAX_PHOTO_BYTES } from "@/lib/storage";
import { analysisGate, statusAfterFailure, stepResultUpdates } from "./analysis-core";
import { ANALYSIS_STALE_MS } from "./constants";
import type { Failure } from "./photos";
import { scanAiAvailable } from "./services";

export type AnalysisResult = { ok: true; steps: number; needsReview: number } | (Failure & { retryable?: boolean });

const fail = (status: number, error: string, retryable?: boolean) =>
  ({ ok: false, status, error, ...(retryable === undefined ? {} : { retryable }) }) as const;

class LostRace extends Error {}

/** True when `scanId` is a scan of the caller's institution that the caller may analyse (scansWritable). */
export async function analyzableScanExists(scope: Scope, scanId: string): Promise<boolean> {
  return (await prisma.scan.count({ where: { id: scanId, ...scansWritable(scope) } })) > 0;
}

/**
 * Runs the AI analysis of one scan (PRODUCT 5): the protocol's VISUAL steps of this scan + its 1..4 photos (bytes from
 * storage, magic bytes checked) -> analyzeScan -> Scan.aiRaw / aiModel / analyzedAt / overall notes and one
 * ScanStepResult per visual step (aiVerdict, aiConfidence, evidence). The scan is "analyzing" while the call runs,
 * then "review"; a failed call leaves it "failed" (the examiner may retry or answer every step by hand).
 *
 * The model call is NOT tied to the browser request: a phone that loses the connection mid-call still gets the
 * result saved with the scan (the call is billed either way), and the page polls the scan status.
 */
export async function runScanAnalysis(scope: Scope, scanId: string, logger: Logger): Promise<AnalysisResult> {
  const where = { id: scanId, ...scansWritable(scope) };
  const scan = await prisma.scan.findFirst({
    where,
    select: {
      id: true,
      status: true,
      updatedAt: true,
      areaLabel: true,
      organizationId: true,
      protocol: { select: { titleAr: true, titleEn: true } },
      photos: { select: { id: true, storageKey: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      stepResults: {
        where: { step: { visualCheck: true } },
        select: { step: { select: { id: true, order: true, textAr: true, textEn: true, criteriaAr: true, criteriaEn: true } } },
      },
    },
  });
  if (!scan) return fail(404, "not_found");

  const gate = analysisGate(scan);
  if (!gate.ok) return fail(gate.status, gate.error);
  const steps = scan.stepResults.map((r) => r.step).sort((a, b) => a.order - b.order);
  if (steps.length === 0) return fail(422, "no_visual_steps");
  if (scan.photos.length === 0) return fail(422, "no_photos");
  if (!scanAiAvailable()) return fail(503, "not_configured", false);

  // Atomic claim: two taps on "analyze" (or two tabs) never start two model calls.
  const claimed = await prisma.scan.updateMany({
    where: {
      ...where,
      OR: [
        { status: { in: ["draft", "failed"] } },
        { status: "analyzing", updatedAt: { lt: new Date(Date.now() - ANALYSIS_STALE_MS) } },
      ],
    },
    data: { status: "analyzing" },
  });
  if (claimed.count === 0) return fail(409, "analysis_running");

  const setStatus = (status: "draft" | "failed") =>
    prisma.scan.updateMany({ where: { id: scan.id, status: "analyzing" }, data: { status } }).catch((err) => {
      logger.error("scan.analyze.status_reset_failed", { scanId: scan.id, err });
    });

  try {
    const images: Array<{ data: Uint8Array; mediaType: ScanImageType }> = [];
    for (const photo of scan.photos) {
      let bytes: Uint8Array;
      try {
        bytes = await getObjectBytes(photo.storageKey);
      } catch (err) {
        logger.error("scan.analyze.photo_read_failed", { scanId: scan.id, photoId: photo.id, err });
        await setStatus(gate.previous);
        return fail(502, "storage_failed", true);
      }
      const type = detectImageType(bytes);
      if (!type || !(SCAN_IMAGE_TYPES as readonly string[]).includes(type) || bytes.byteLength > MAX_PHOTO_BYTES) {
        logger.warn("scan.analyze.photo_invalid", { scanId: scan.id, photoId: photo.id, bytes: bytes.byteLength });
        await setStatus(gate.previous);
        return fail(422, "invalid_photo", false);
      }
      images.push({ data: bytes, mediaType: type });
    }

    const started = Date.now();
    const result = await analyzeScan({
      images,
      area: scan.areaLabel,
      protocol: scan.protocol,
      steps: steps.map((s) => ({ id: s.id, textAr: s.textAr, textEn: s.textEn, criteriaAr: s.criteriaAr, criteriaEn: s.criteriaEn })),
      userId: scope.userId,
      organizationId: scan.organizationId,
      scanId: scan.id,
    });

    if (!result.ok) {
      await setStatus(statusAfterFailure(result.code, gate.previous));
      logger.warn("scan.analyze.failed", { scanId: scan.id, errorCode: result.code, ms: Date.now() - started });
      return fail(aiFailureStatus(result), result.code, result.retryable);
    }

    const updates = stepResultUpdates(result.verdict.steps);
    await prisma.$transaction(async (tx) => {
      const saved = await tx.scan.updateMany({
        where: { id: scan.id, status: "analyzing" },
        data: {
          status: "review",
          aiModel: result.servedBy,
          aiRaw: result.raw as unknown as Prisma.InputJsonValue,
          analyzedAt: new Date(),
          overallNotesAr: result.verdict.overallNotesAr.trim() || null,
          overallNotesEn: result.verdict.overallNotesEn.trim() || null,
        },
      });
      if (saved.count === 0) throw new LostRace();
      for (const u of updates) {
        const { stepId, ...data } = u;
        await tx.scanStepResult.upsert({
          where: { scanId_stepId: { scanId: scan.id, stepId } },
          create: { scanId: scan.id, stepId, ...data },
          update: data,
        });
      }
    });
    logger.info("scan.analyze.done", {
      scanId: scan.id,
      steps: updates.length,
      needsReview: result.needsReview.length,
      photos: images.length,
      ms: result.latencyMs,
    });
    return { ok: true, steps: updates.length, needsReview: result.needsReview.length };
  } catch (err) {
    if (err instanceof LostRace) return fail(409, "analysis_running");
    await setStatus("failed");
    throw err;
  }
}
