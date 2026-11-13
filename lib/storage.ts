import "server-only";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { connection } from "next/server";
import * as z from "zod";
import { fileSinkAllowed } from "@/lib/email";
import { log } from "@/lib/log";

/**
 * Railway bucket (S3-compatible) for scan photos (stack note 06, crosscheck D17).
 * Browser -> presigned PUT -> bucket; viewing -> authenticated route -> 302 to a presigned GET;
 * the AI call reads bytes with getObjectBytes (never hand a presigned URL to a third party).
 *
 * When S3_* are unset (local dev) nothing throws at import time: isStorageConfigured() is false and
 * every operation throws StorageNotConfiguredError. Features must check first and show
 * common.states.storageOff instead of crashing. In a Server Component use storageConfiguredAtRequest()
 * (or call isStorageConfigured() inside the Suspense'd data component): under cacheComponents a plain
 * env read in the static part of a page is evaluated at build time and frozen into the HTML.
 */

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const; // what Claude vision accepts (no HEIC)
export type PhotoType = (typeof PHOTO_TYPES)[number];
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // same cap in the sign route and the analyze route
export const MAX_PHOTOS_PER_SCAN = 4;
export const UPLOAD_URL_TTL_SECONDS = 300;
export const VIEW_URL_TTL_SECONDS = 600;

export { detectImageType, matchesMagic } from "@/lib/image/magic-bytes";

const Env = z.object({
  S3_ENDPOINT: z.url(), // e.g. https://t3.storageapi.dev
  S3_REGION: z.string().min(1).default("auto"),
  S3_BUCKET: z.string().min(1), // Railway BUCKET variable (name + hash), NOT RAILWAY_BUCKET_NAME
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_URL_STYLE: z.enum(["virtual", "path"]).default("virtual"), // "path" only for old buckets
});

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("storage not configured (S3_* environment variables are missing)");
    this.name = "StorageNotConfiguredError";
  }
}

let cached: { s3: S3Client; bucket: string } | undefined;

/**
 * E2E ONLY (scans test seam, e2e/README.md): STORAGE_PROVIDER=file keeps photos on the local disk
 * (lib/scans/e2e/file-storage.ts, under STORAGE_FILE_DIR) so Playwright can run the whole scan flow without S3.
 * Allowed only behind the e-mail file sink's guard (WAQAYA_E2E=1, loopback http BETTER_AUTH_URL, no RAILWAY_*
 * variable). Requested but refused (e.g. on Railway) = storage OFF, never a silent fallback to the disk.
 */
export function fileStorageRequested(env: Record<string, string | undefined> = process.env): boolean {
  return env.STORAGE_PROVIDER?.trim().toLowerCase() === "file";
}

export function fileStorageAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return fileStorageRequested(env) && fileSinkAllowed(env);
}

let fileStorageWarned = false;

/** The disk driver when the seam is on, null for S3. The module is loaded only after the guard passed. */
async function e2eFileDriver() {
  if (!fileStorageRequested()) return null;
  if (!fileStorageAllowed()) throw new StorageNotConfiguredError();
  return (await import("@/lib/scans/e2e/file-storage")).fileStorageDriver;
}

export function isStorageConfigured(): boolean {
  if (fileStorageRequested()) {
    const allowed = fileStorageAllowed();
    if (!allowed && !fileStorageWarned) {
      fileStorageWarned = true;
      log.warn("storage.config", { detail: "STORAGE_PROVIDER=file is for local/CI end-to-end tests only: storage is off" });
    }
    return allowed;
  }
  return Env.safeParse(process.env).success;
}

/** isStorageConfigured() read at request time (never baked into the prerendered shell). */
export async function storageConfiguredAtRequest(): Promise<boolean> {
  await connection();
  return isStorageConfigured();
}

export function isPhotoType(value: unknown): value is PhotoType {
  return typeof value === "string" && (PHOTO_TYPES as readonly string[]).includes(value);
}

export class InvalidPhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPhotoError";
  }
}

/** Created lazily, so `next build` and local dev never need bucket credentials. */
export function getStorage(): { s3: S3Client; bucket: string } {
  if (cached) return cached;
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) throw new StorageNotConfiguredError();
  const e = parsed.data;
  cached = {
    bucket: e.S3_BUCKET,
    s3: new S3Client({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      forcePathStyle: e.S3_URL_STYLE === "path",
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
      // The default WHEN_SUPPORTED bakes an empty-body CRC32 into presigned PUT URLs and real uploads fail.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
  return cached;
}

const PHOTO_EXT: Record<PhotoType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const KEY_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const PHOTO_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/**
 * Object key for a new photo: scans/<organizationId>/<userId>/<uuid>.<ext>. Scans always belong to an
 * organization (there are no personal scans), so organizationId is required.
 */
export function newPhotoKey(input: { organizationId: string; userId: string; contentType: PhotoType }): string {
  if (!KEY_SEGMENT.test(input.organizationId) || !KEY_SEGMENT.test(input.userId)) {
    throw new InvalidPhotoError("newPhotoKey: unexpected id format");
  }
  if (!isPhotoType(input.contentType)) throw new InvalidPhotoError("newPhotoKey: unsupported content type");
  return `scans/${input.organizationId}/${input.userId}/${crypto.randomUUID()}.${PHOTO_EXT[input.contentType]}`;
}

/**
 * True when a client-supplied key is one newPhotoKey() made for THIS user in THIS organization. The
 * confirm route (creates the ScanPhoto row) must check it before trusting a `key` from the browser.
 */
export function isOwnPhotoKey(key: unknown, owner: { organizationId: string; userId: string }): boolean {
  if (typeof key !== "string" || key.length > 400) return false;
  const parts = key.split("/");
  return (
    parts.length === 4 &&
    parts[0] === "scans" &&
    parts[1] === owner.organizationId &&
    parts[2] === owner.userId &&
    PHOTO_FILE.test(parts[3] ?? "")
  );
}

/** Throws InvalidPhotoError unless 1 <= size <= MAX_PHOTO_BYTES and contentType is one of PHOTO_TYPES. */
export function assertValidPhotoUpload(input: { contentType: unknown; size: unknown }): asserts input is { contentType: PhotoType; size: number } {
  if (!isPhotoType(input.contentType)) throw new InvalidPhotoError("unsupported photo type");
  const size = input.size;
  if (typeof size !== "number" || !Number.isInteger(size) || size < 1 || size > MAX_PHOTO_BYTES) {
    throw new InvalidPhotoError(`photo size must be 1..${MAX_PHOTO_BYTES} bytes`);
  }
}

/**
 * Presigned PUT. Content-Type and Content-Length are signed, so the browser must upload exactly
 * `size` bytes with the same Content-Type (bucket CORS: pnpm railway:cors). Re-checks size and type at
 * runtime (throws InvalidPhotoError), so a route that forgets its own check still cannot sign a 2 GB
 * upload or an SVG.
 */
export async function presignPhotoUpload(input: { key: string; contentType: PhotoType; size: number }) {
  assertValidPhotoUpload(input);
  if (!input.key.startsWith("scans/")) throw new InvalidPhotoError("presignPhotoUpload: key must come from newPhotoKey()");
  const disk = await e2eFileDriver();
  if (disk) return disk.presignUpload(input, UPLOAD_URL_TTL_SECONDS);
  const { s3, bucket } = getStorage();
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: input.key, ContentType: input.contentType, ContentLength: input.size }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-type"]) },
  );
  return { url, key: input.key, headers: { "Content-Type": input.contentType } };
}

/** Presigned GET for an authenticated 302 (serve with Cache-Control: private). */
export async function presignPhotoView(key: string, expiresIn = VIEW_URL_TTL_SECONDS): Promise<string> {
  const disk = await e2eFileDriver();
  if (disk) return disk.presignView(key, expiresIn);
  const { s3, bucket } = getStorage();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}

/** Size and type of an uploaded object, or null when it does not exist. */
export async function headObject(key: string): Promise<{ bytes: number; contentType: string | null } | null> {
  const disk = await e2eFileDriver();
  if (disk) return disk.head(key);
  const { s3, bucket } = getStorage();
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { bytes: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (e as { name?: string }).name === "NotFound") return null;
    throw e;
  }
}

/** Raw bytes (for the Claude vision call and magic-byte checks). */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const disk = await e2eFileDriver();
  if (disk) return disk.getBytes(key);
  const { s3, bucket } = getStorage();
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error("storage: empty object body");
  return res.Body.transformToByteArray();
}

/**
 * The first `bytes` bytes of an object (S3 ranged GET), e.g. for the magic-byte check of an upload (detectImageType
 * needs 12), without downloading a whole photo.
 */
export async function getObjectHead(key: string, bytes = 32): Promise<Uint8Array> {
  const disk = await e2eFileDriver();
  if (disk) return (await disk.getBytes(key)).slice(0, bytes);
  const { s3, bucket } = getStorage();
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${Math.max(1, bytes) - 1}` }));
  if (!res.Body) throw new Error("storage: empty object body");
  return (await res.Body.transformToByteArray()).slice(0, bytes);
}

export async function deleteObject(key: string): Promise<void> {
  const disk = await e2eFileDriver();
  if (disk) return disk.remove(key);
  const { s3, bucket } = getStorage();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Deletes up to 1000 keys per request (used when deleting scans, users or institutions). */
export async function deleteObjects(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const disk = await e2eFileDriver();
  if (disk) return disk.removeMany(keys);
  const { s3, bucket } = getStorage();
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await s3.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }),
    );
  }
}
