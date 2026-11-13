import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * E2E ONLY. Signed, expiring tokens for the local-disk photo store (lib/scans/e2e/file-storage.ts): the stand-in for
 * a presigned S3 URL. Like a real presigned PUT, an upload token fixes the key, the content type and the exact
 * size; a view token fixes the key. Pure and unit-tested; the secret is BETTER_AUTH_SECRET of the test server.
 */
export type StorageTokenPayload =
  | { m: "put"; k: string; t: string; s: number; e: number }
  | { m: "get"; k: string; e: number };

const b64 = (buf: Buffer) => buf.toString("base64url");

function mac(secret: string, body: string): Buffer {
  return createHmac("sha256", `waqaya-e2e-storage-v1:${secret}`).update(body).digest();
}

export function signStorageToken(payload: StorageTokenPayload, secret: string): string {
  if (!secret) throw new Error("signStorageToken: no secret");
  const body = b64(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${b64(mac(secret, body))}`;
}

/** The payload when the signature is valid and the token has not expired, else null. */
export function verifyStorageToken(token: string, secret: string, now: number = Date.now()): StorageTokenPayload | null {
  if (!secret || typeof token !== "string" || token.length > 2048) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = mac(secret, body);
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const p = payload as Partial<StorageTokenPayload> & Record<string, unknown>;
  if (typeof p.k !== "string" || typeof p.e !== "number" || p.e < now) return null;
  if (p.m === "put" && typeof p.t === "string" && typeof p.s === "number") return { m: "put", k: p.k, t: p.t, s: p.s, e: p.e };
  if (p.m === "get") return { m: "get", k: p.k, e: p.e };
  return null;
}
