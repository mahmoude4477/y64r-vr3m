import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { photosReadable, type Scope } from "@/lib/authz";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import {
  deleteObject,
  detectImageType,
  getObjectHead,
  headObject,
  InvalidPhotoError,
  isOwnPhotoKey,
  isPhotoType,
  MAX_PHOTO_BYTES,
  newPhotoKey,
  type PhotoType,
  presignPhotoUpload,
  presignPhotoView,
} from "@/lib/storage";

/**
 * Photo pipeline of a scan (CONVENTIONS 8): sign -> browser PUT -> confirm -> attach (createScan) -> analyze.
 * Every function takes the caller's scope from authorizeApi({ roles: ORG_STAFF_ROLES }) and never trusts a key or an
 * id from the browser without checking it belongs to this user in this institution.
 */

export type Failure = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Failure => ({ ok: false, status, error });

type Owner = { organizationId: string; userId: string };

export function ownerOf(scope: Scope): Owner | null {
  return scope.organizationId ? { organizationId: scope.organizationId, userId: scope.userId } : null;
}

/** A presigned PUT for one photo (the key is made here, never by the browser). */
export async function signPhotoUpload(owner: Owner, input: { contentType: PhotoType; size: number }) {
  const key = newPhotoKey({ ...owner, contentType: input.contentType });
  return presignPhotoUpload({ key, contentType: input.contentType, size: input.size });
}

/**
 * Confirms an upload: the key must be one newPhotoKey() made for this user in this institution and the object must
 * exist with an allowed type and size, and its first bytes must really be that image type (a client that skipped
 * preparePhoto cannot store other data as a photo, which the analysis would refuse for good later). Creates the
 * ScanPhoto row (scanId null until a scan attaches it). Idempotent: confirming the same key twice returns the same row.
 *
 * The magic-byte check reads the object (at most MAX_PHOTO_BYTES, usually a few hundred KB after preparePhoto);
 * foundation request: a ranged read helper in lib/storage.ts, so only the first bytes are fetched.
 */
export async function confirmPhotoUpload(
  owner: Owner,
  input: { key: string; width: number; height: number },
): Promise<{ ok: true; id: string } | Failure> {
  if (!isOwnPhotoKey(input.key, owner)) return fail(403, "forbidden_key");
  const existing = await prisma.scanPhoto.findUnique({
    where: { storageKey: input.key },
    select: { id: true, organizationId: true, uploadedById: true },
  });
  if (existing) {
    return existing.organizationId === owner.organizationId && existing.uploadedById === owner.userId
      ? { ok: true, id: existing.id }
      : fail(409, "photo_conflict");
  }
  const head = await headObject(input.key);
  if (!head) return fail(404, "not_uploaded");
  const reject = async () => {
    await deleteObject(input.key).catch((err) => log.warn("scan.photo.reject_delete_failed", { err }));
    return fail(422, "invalid_photo");
  };
  if (!isPhotoType(head.contentType) || head.bytes < 1 || head.bytes > MAX_PHOTO_BYTES) return reject();
  if (detectImageType(await getObjectHead(input.key)) !== head.contentType) return reject();
  try {
    const row = await prisma.scanPhoto.create({
      data: {
        organizationId: owner.organizationId,
        uploadedById: owner.userId,
        storageKey: input.key,
        mime: head.contentType,
        bytes: head.bytes,
        width: input.width,
        height: input.height,
      },
      select: { id: true },
    });
    return { ok: true, id: row.id };
  } catch (e) {
    // Two confirms of the same key at once: the second one returns the first one's row.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const row = await prisma.scanPhoto.findFirst({
        where: { storageKey: input.key, organizationId: owner.organizationId, uploadedById: owner.userId },
        select: { id: true },
      });
      if (row) return { ok: true, id: row.id };
    }
    throw e;
  }
}

/**
 * Removes one of the user's own uploads that no scan uses yet (a photo taken off the new-scan form, or a cancelled
 * scan). The row goes first, in ONE statement that still requires `scanId IS NULL`: a scan created at the same moment
 * either attached the photo before (nothing is deleted: 404) or finds it gone (createScan answers photos_unavailable
 * and saves nothing). The bucket object is deleted only after the row is gone, so a scan never keeps a photo whose
 * file was removed. A failed object delete is logged and leaves a bucket orphan (no row points at it) for the sweep.
 */
export async function discardOwnUpload(owner: Owner, photoId: string): Promise<{ ok: true } | Failure> {
  const where = { id: photoId, organizationId: owner.organizationId, uploadedById: owner.userId, scanId: null };
  const photo = await prisma.scanPhoto.findFirst({ where, select: { storageKey: true } });
  if (!photo) return fail(404, "not_found");
  const gone = await prisma.scanPhoto.deleteMany({ where });
  if (gone.count === 0) return fail(404, "not_found");
  try {
    await deleteObject(photo.storageKey);
  } catch (err) {
    log.error("scan.photo.discard_object_failed", { photoId, err });
  }
  return { ok: true };
}

/** A short-lived URL for viewing a photo the scope may read (staff of the active institution). */
export async function photoViewUrl(scope: Scope, photoId: string): Promise<string | null> {
  const photo = await prisma.scanPhoto.findFirst({
    where: { id: photoId, ...photosReadable(scope) },
    select: { storageKey: true },
  });
  if (!photo) return null;
  return presignPhotoView(photo.storageKey);
}

export { InvalidPhotoError };
