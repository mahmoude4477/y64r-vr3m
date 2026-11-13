// Delete semantics for users, institutions and scans (foundation). CLI-safe: no "server-only" here, because
// lib/auth.ts hooks call it and the `auth` CLI / scripts load lib/auth.ts in plain Node. Bucket deletes use a
// dynamic import of lib/storage, which only runs inside the Next server.
//
// What survives what:
// - Deleting a USER: see lib/account/purge.ts (purgeUserData, run by databaseHooks.user.delete.before in
//   lib/auth.ts). Scans and photos stay with the institution (examinerId / uploadedById = null), ai_call rows stay
//   (userId -> null), and audit rows are DE-IDENTIFIED: actorId -> null, actorName and ip cleared, actorDeleted set
//   (the UI shows common.deletedUser). The user's own simulation attempts are personal data and cascade. Delete
//   users through lib/account/delete-account.ts (self-service) or Better Auth's admin remove-user (admin panel).
// - Deleting an ORGANIZATION removes everything it owns: scans (+ step results, photo rows and bucket
//   objects), unattached uploads, attempts on its custom scenarios / protocols, then (cascade) its custom
//   protocols, scenarios, teams, members and invitations. Attempts on GLOBAL scenarios stay with the trainee
//   (organizationId -> null). Only platform admins delete institutions, through deleteOrganizationWithData();
//   Better Auth's /organization/delete is disabled (lib/auth.ts disableOrganizationDeletion).
// - Deleting SCANS: deleteScansWithPhotos() (the photo rows cascade, the bucket objects would not).
import type { Prisma } from "@/generated/prisma/client";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

/** A scan changed between the read and the delete of deleteScansWithPhotos (the transaction rolled back). */
export class ScanDeleteRaceError extends Error {
  constructor() {
    super("scan changed while it was being deleted");
    this.name = "ScanDeleteRaceError";
  }
}

/** Best effort: a bucket failure is logged (count only, never keys) and never undoes the database delete. */
export async function deletePhotoObjects(keys: readonly string[], context: string): Promise<void> {
  if (keys.length === 0) return;
  try {
    const storage = await import("@/lib/storage");
    if (!storage.isStorageConfigured()) {
      log.warn("storage.delete_skipped", { context, objects: keys.length, reason: "storage_not_configured" });
      return;
    }
    await storage.deleteObjects(keys);
  } catch (e) {
    log.error("storage.delete_failed", { context, objects: keys.length, err: e });
  }
}

/**
 * Removes the rows that would block (RESTRICT) or outlive an organization delete. Returns the bucket keys
 * of the photos it removed. Runs inside the caller's transaction.
 */
async function purgeOrganizationRows(tx: Tx, organizationId: string): Promise<{ keys: string[]; scans: number; attempts: number }> {
  const photos = await tx.scanPhoto.findMany({ where: { organizationId }, select: { storageKey: true } });
  // Attempts on this organization's scenarios, or on scenarios that train its custom protocols:
  // SimulationAttempt.scenario is RESTRICT, and their answers / step results point at rows that go away.
  const attempts = await tx.simulationAttempt.deleteMany({
    where: { scenario: { OR: [{ organizationId }, { protocol: { organizationId } }] } },
  });
  // Defensive: step results anywhere that point at this organization's protocol steps (RESTRICT).
  await tx.simulationStepResult.deleteMany({ where: { step: { protocol: { organizationId } } } });
  // Scans cascade to scan_step_result and scan_photo rows; then the unattached uploads.
  const scans = await tx.scan.deleteMany({ where: { organizationId } });
  await tx.scanPhoto.deleteMany({ where: { organizationId } });
  return { keys: photos.map((p) => p.storageKey), scans: scans.count, attempts: attempts.count };
}

/**
 * Platform admin: delete an institution and everything it owns in one transaction (members, invitations,
 * teams, custom protocols and scenarios cascade). The ONLY way to delete an institution: Better Auth's
 * /organization/delete is disabled (lib/auth.ts). Call it after requirePlatformAdmin() and pass the audit row as
 * `audit` (`(tx) => writeAudit(ctx, "organization.delete", { type: "organization", id }, meta, { tx })`): it runs in the
 * same transaction, so the delete and its audit row commit together or not at all.
 * Returns false when the organization does not exist.
 */
export async function deleteOrganizationWithData(
  organizationId: string,
  options: { audit?: (tx: Tx, purged: { scans: number; attempts: number }) => Promise<void> } = {},
): Promise<boolean> {
  const r = await prisma.$transaction(async (tx) => {
    const exists = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!exists) return null;
    const purged = await purgeOrganizationRows(tx, organizationId);
    await tx.session.updateMany({ where: { activeOrganizationId: organizationId }, data: { activeOrganizationId: null } });
    await tx.organization.delete({ where: { id: organizationId } });
    await options.audit?.(tx, { scans: purged.scans, attempts: purged.attempts });
    return purged;
  });
  if (!r) return false;
  await deletePhotoObjects(r.keys, "organization delete");
  return true;
}

/**
 * Deletes scans with their step results, photo rows AND bucket objects. Authorize first: pass only ids you
 * loaded with scansWritable(scope) (or after requirePlatformAdmin()). Returns how many scans were deleted.
 * - `where`: extra conditions checked by the delete statement itself, e.g. `{ status: { not: "finalized" } }`, so a
 *   scan finalised a moment earlier is never deleted (only the photos of scans that are really deleted go).
 * - `audit`: runs in the same transaction with the scans actually deleted (skipped when none was), e.g.
 *   `(tx, { ids, photos }) => writeAudit(ctx, "scan.delete", { type: "scan", id }, { photos }, { tx })`.
 */
export async function deleteScansWithPhotos(
  scanIds: readonly string[],
  options: { where?: Prisma.ScanWhereInput; audit?: (tx: Tx, deleted: { ids: string[]; photos: number }) => Promise<void> } = {},
): Promise<number> {
  if (scanIds.length === 0) return 0;
  const r = await prisma.$transaction(async (tx) => {
    const doomed = await tx.scan.findMany({ where: { AND: [{ id: { in: [...scanIds] } }, options.where ?? {}] }, select: { id: true } });
    const ids = doomed.map((s) => s.id);
    if (ids.length === 0) return { count: 0, keys: [] as string[] };
    const photos = await tx.scanPhoto.findMany({ where: { scanId: { in: ids } }, select: { storageKey: true } });
    // The extra conditions again in the delete itself: a row that changed since the read above is not deleted.
    const deleted = await tx.scan.deleteMany({ where: { AND: [{ id: { in: ids } }, options.where ?? {}] } });
    if (deleted.count === 0) return { count: 0, keys: [] as string[] }; // changed since the read: nothing deleted
    if (deleted.count !== ids.length) throw new ScanDeleteRaceError(); // some changed: roll back, keep every photo
    await options.audit?.(tx, { ids, photos: photos.length });
    return { count: deleted.count, keys: photos.map((p) => p.storageKey) };
  });
  await deletePhotoObjects(r.keys, "scan delete");
  return r.count;
}
