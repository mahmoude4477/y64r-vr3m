import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { signStorageToken, verifyStorageToken } from "./storage-token";

/**
 * E2E ONLY: the photo store on the local disk, so the whole scan flow runs in Playwright without S3. lib/storage.ts
 * loads this module with a dynamic import ONLY when STORAGE_PROVIDER=file passes fileStorageAllowed() (WAQAYA_E2E=1,
 * a loopback http BETTER_AUTH_URL, no RAILWAY_* variable: the e-mail file sink's guard); the route
 * app/api/scans/e2e-storage/[token] checks the same guard again. Files live under STORAGE_FILE_DIR (default
 * .e2e/storage, gitignored). "Presigned" URLs are same-origin paths with a signed, expiring token, so the CSP's
 * connect-src / img-src 'self' already allow them.
 */

const KEY = /^scans\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;
const ROUTE = "/api/scans/e2e-storage";

function root(): string {
  // turbopackIgnore: a runtime folder of e2e test files, not part of the build (otherwise the whole project is traced).
  return path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_FILE_DIR?.trim() || path.join(process.cwd(), ".e2e", "storage"));
}

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET ?? "";
  if (s.length < 16) throw new Error("e2e file storage: BETTER_AUTH_SECRET is missing");
  return s;
}

/** Absolute path of a key, or null for anything that is not a photo key (no traversal possible). */
export function filePathFor(key: string, base: string = root()): string | null {
  if (!KEY.test(key)) return null;
  const full = path.resolve(base, ...key.split("/"));
  return full.startsWith(base + path.sep) ? full : null;
}

const metaPath = (file: string) => `${file}.meta.json`;

async function head(key: string): Promise<{ bytes: number; contentType: string | null } | null> {
  const file = filePathFor(key);
  if (!file) return null;
  try {
    const [s, meta] = await Promise.all([stat(/*turbopackIgnore: true*/ file), readFile(/*turbopackIgnore: true*/ metaPath(file), "utf8")]);
    return { bytes: s.size, contentType: (JSON.parse(meta) as { contentType?: string }).contentType ?? null };
  } catch {
    return null;
  }
}

async function getBytes(key: string): Promise<Uint8Array> {
  const file = filePathFor(key);
  if (!file) throw new Error("e2e file storage: bad key");
  return new Uint8Array(await readFile(/*turbopackIgnore: true*/ file));
}

async function remove(key: string): Promise<void> {
  const file = filePathFor(key);
  if (!file) return;
  await rm(file, { force: true });
  await rm(metaPath(file), { force: true });
}

export const fileStorageDriver = {
  async presignUpload(input: { key: string; contentType: string; size: number }, ttlSeconds: number) {
    const token = signStorageToken(
      { m: "put", k: input.key, t: input.contentType, s: input.size, e: Date.now() + ttlSeconds * 1000 },
      secret(),
    );
    return { url: `${ROUTE}/${token}`, key: input.key, headers: { "Content-Type": input.contentType } };
  },

  async presignView(key: string, ttlSeconds: number): Promise<string> {
    return `${ROUTE}/${signStorageToken({ m: "get", k: key, e: Date.now() + ttlSeconds * 1000 }, secret())}`;
  },

  head,

  getBytes,

  remove,

  async removeMany(keys: readonly string[]): Promise<void> {
    for (const key of keys) await remove(key);
  },

  /** PUT handler: the token must be an upload token, and type and size must be exactly the signed ones. */
  async acceptUpload(token: string, contentType: string | null, body: Uint8Array): Promise<"ok" | "denied" | "mismatch"> {
    const p = verifyStorageToken(token, secret());
    if (!p || p.m !== "put") return "denied";
    if (!TYPES.has(p.t) || contentType !== p.t || body.byteLength !== p.s || body.byteLength > MAX_BYTES) return "mismatch";
    const file = filePathFor(p.k);
    if (!file) return "denied";
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(metaPath(file), JSON.stringify({ contentType: p.t }), "utf8");
    return "ok";
  },

  /** GET handler: a view token for an existing object. */
  async readForView(token: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    const p = verifyStorageToken(token, secret());
    if (!p || p.m !== "get") return null;
    const meta = await head(p.k);
    if (!meta?.contentType) return null;
    return { bytes: await getBytes(p.k), contentType: meta.contentType };
  },
};

export type FileStorageDriver = typeof fileStorageDriver;
