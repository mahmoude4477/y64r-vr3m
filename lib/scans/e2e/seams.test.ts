import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeScan } from "@/lib/ai/analyze-scan";
import { scanAiStubAllowed, scanAiStubModel } from "@/lib/ai/model";
import { fileStorageAllowed, getObjectBytes, headObject, isStorageConfigured, presignPhotoUpload, presignPhotoView } from "@/lib/storage";
import { createScanStubModel, STUB_MODEL_ID, stepIdsFrom, stubVerdict } from "./ai-stub";
import { filePathFor, fileStorageDriver } from "./file-storage";
import { signStorageToken, verifyStorageToken } from "./storage-token";

// The e2e-only test seams (scans team exception): the local-disk photo store and the deterministic AI stub are
// usable ONLY with WAQAYA_E2E=1, a loopback http BETTER_AUTH_URL and no RAILWAY_* variable, plus their own switch.

const E2E = { WAQAYA_E2E: "1", BETTER_AUTH_URL: "http://127.0.0.1:3125" };
const PRODUCTION_LIKE = [
  { ...E2E, WAQAYA_E2E: undefined },
  { ...E2E, WAQAYA_E2E: "true" },
  { ...E2E, RAILWAY_ENVIRONMENT_ID: "env-1" },
  { ...E2E, RAILWAY_PROJECT_ID: "p" },
  { ...E2E, RAILWAY_SERVICE_ID: "s" },
  { ...E2E, RAILWAY_ENVIRONMENT_NAME: "production" },
  { ...E2E, BETTER_AUTH_URL: "https://waqaya.example" },
  { ...E2E, BETTER_AUTH_URL: "https://127.0.0.1:3125" },
  { ...E2E, BETTER_AUTH_URL: "http://10.0.0.5:3125" },
  { ...E2E, BETTER_AUTH_URL: undefined },
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("guards", () => {
  it("allow the disk store and the AI stub only in a flagged local e2e run", () => {
    expect(fileStorageAllowed({ ...E2E, STORAGE_PROVIDER: "file" })).toBe(true);
    expect(fileStorageAllowed({ ...E2E, STORAGE_PROVIDER: " FILE " })).toBe(true);
    expect(scanAiStubAllowed({ ...E2E, AI_PROVIDER: "stub" })).toBe(true);
    expect(fileStorageAllowed(E2E)).toBe(false);
    expect(fileStorageAllowed({ ...E2E, STORAGE_PROVIDER: "s3" })).toBe(false);
    expect(scanAiStubAllowed(E2E)).toBe(false);
    expect(scanAiStubAllowed({ ...E2E, AI_PROVIDER: "anthropic" })).toBe(false);
  });

  it("refuse them in production-like environments", () => {
    for (const env of PRODUCTION_LIKE) {
      expect(fileStorageAllowed({ ...env, STORAGE_PROVIDER: "file" }), JSON.stringify(env)).toBe(false);
      expect(scanAiStubAllowed({ ...env, AI_PROVIDER: "stub" }), JSON.stringify(env)).toBe(false);
    }
  });

  it("STORAGE_PROVIDER=file outside e2e means storage OFF, never the disk and never S3 by surprise", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "file");
    vi.stubEnv("RAILWAY_ENVIRONMENT_ID", "env-1");
    vi.stubEnv("WAQAYA_E2E", "1");
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3125");
    vi.stubEnv("S3_ENDPOINT", "https://t3.storageapi.dev");
    vi.stubEnv("S3_BUCKET", "b");
    vi.stubEnv("S3_ACCESS_KEY_ID", "k");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "s");
    expect(isStorageConfigured()).toBe(false);
    await expect(presignPhotoView("scans/o/u/x.jpg")).rejects.toThrow(/not configured/);
  });

  it("AI_PROVIDER=stub outside e2e never loads the stub", async () => {
    vi.stubEnv("AI_PROVIDER", "stub");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    vi.stubEnv("WAQAYA_E2E", "1");
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3125");
    await expect(scanAiStubModel()).rejects.toThrow(/refused/);
    // No ANTHROPIC_API_KEY in tests: analyzeScan answers not_configured instead of reaching any model.
    const r = await analyzeScan({
      images: [{ data: new Uint8Array([0xff, 0xd8, 0xff]), mediaType: "image/jpeg" }],
      area: "x",
      protocol: { titleAr: "أ", titleEn: "A" },
      steps: [{ id: "s1", textAr: "أ", textEn: "a" }],
      userId: "u1",
    });
    expect(r).toEqual({ ok: false, code: "not_configured", retryable: false });
  });
});

describe("storage tokens", () => {
  const secret = "x".repeat(32);
  it("round-trip and expire", () => {
    const now = 1_000_000;
    const token = signStorageToken({ m: "put", k: "scans/o/u/a.jpg", t: "image/jpeg", s: 10, e: now + 1000 }, secret);
    expect(verifyStorageToken(token, secret, now)).toEqual({ m: "put", k: "scans/o/u/a.jpg", t: "image/jpeg", s: 10, e: now + 1000 });
    expect(verifyStorageToken(token, secret, now + 1001)).toBeNull();
    expect(verifyStorageToken(token, "y".repeat(32), now)).toBeNull();
  });

  it("reject tampered or malformed tokens", () => {
    const token = signStorageToken({ m: "get", k: "scans/o/u/a.jpg", e: Date.now() + 60_000 }, secret);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ m: "get", k: "scans/o/OTHER/a.jpg", e: Date.now() + 60_000 })).toString("base64url");
    expect(verifyStorageToken(`${forged}.${sig}`, secret)).toBeNull();
    expect(verifyStorageToken(`${body}.${sig}.x`, secret)).toBeNull();
    expect(verifyStorageToken("nope", secret)).toBeNull();
    expect(verifyStorageToken(token, "")).toBeNull();
    expect(() => signStorageToken({ m: "get", k: "k", e: 1 }, "")).toThrow();
  });
});

describe("disk photo store", () => {
  const key = "scans/org1/user1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg";

  it("maps only photo keys to paths inside its folder", () => {
    const base = path.resolve("C:/tmp/store");
    expect(filePathFor(key, base)).toBe(path.join(base, "scans", "org1", "user1", "0f8fad5b-d9cb-469f-a165-70867728950e.jpg"));
    for (const bad of ["../x.jpg", "scans/org1/../../x/0f8fad5b-d9cb-469f-a165-70867728950e.jpg", "scans/o/u/x.svg", "/etc/passwd", ""]) {
      expect(filePathFor(bad, base)).toBeNull();
    }
  });

  it("accepts exactly the signed upload and serves it back through lib/storage", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "waqaya-e2e-store-"));
    try {
      vi.stubEnv("STORAGE_PROVIDER", "file");
      vi.stubEnv("STORAGE_FILE_DIR", dir);
      vi.stubEnv("WAQAYA_E2E", "1");
      vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3125");
      vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(40));
      for (const id of ["RAILWAY_ENVIRONMENT_ID", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_NAME"]) vi.stubEnv(id, "");
      expect(isStorageConfigured()).toBe(true);

      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
      const signed = await presignPhotoUpload({ key, contentType: "image/jpeg", size: jpeg.byteLength });
      expect(signed.url.startsWith("/api/scans/e2e-storage/")).toBe(true);
      const token = signed.url.split("/").pop()!;

      expect(await fileStorageDriver.acceptUpload(token, "image/png", jpeg)).toBe("mismatch");
      expect(await fileStorageDriver.acceptUpload(token, "image/jpeg", jpeg.slice(1))).toBe("mismatch");
      expect(await fileStorageDriver.acceptUpload("bad.token", "image/jpeg", jpeg)).toBe("denied");
      expect(await headObject(key)).toBeNull();

      expect(await fileStorageDriver.acceptUpload(token, "image/jpeg", jpeg)).toBe("ok");
      expect(await headObject(key)).toEqual({ bytes: jpeg.byteLength, contentType: "image/jpeg" });
      expect(Array.from(await getObjectBytes(key))).toEqual(Array.from(jpeg));

      const view = await presignPhotoView(key);
      const viewToken = view.split("/").pop()!;
      expect(await fileStorageDriver.readForView(viewToken)).toMatchObject({ contentType: "image/jpeg" });
      // An upload token is not a view token and vice versa.
      expect(await fileStorageDriver.readForView(token)).toBeNull();
      expect(await fileStorageDriver.acceptUpload(viewToken, "image/jpeg", jpeg)).toBe("denied");

      await fileStorageDriver.remove(key);
      expect(await headObject(key)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("AI stub", () => {
  it("answers in step order with the fixed pattern", () => {
    const v = stubVerdict(["a", "b", "c", "d", "e"]);
    expect(v.steps.map((s) => [s.stepId, s.verdict, s.confidence])).toEqual([
      ["a", "compliant", 0.92],
      ["b", "non_compliant", 0.81],
      ["c", "not_visible", 0.35],
      ["d", "compliant", 0.55],
      ["e", "compliant", 0.92],
    ]);
    expect(v.steps.every((s) => s.evidenceAr && s.evidenceEn)).toBe(true);
  });

  it("reads the step ids from the checklist prompt when the schema has none", () => {
    const ids = stepIdsFrom({
      responseFormat: { type: "text" },
      prompt: [{ role: "user", content: [{ type: "text", text: 'Today: x\nChecklist:\n[{"stepId":"s1"},{"stepId":"s2"}]' }] }],
    });
    expect(ids).toEqual(["s1", "s2"]);
  });

  it("runs through analyzeScan's real structured-output path", async () => {
    const r = await analyzeScan({
      images: [{ data: new Uint8Array([0xff, 0xd8, 0xff]), mediaType: "image/jpeg" }],
      area: "Room 12",
      protocol: { titleAr: "الأدوات الحادة", titleEn: "Sharps" },
      steps: [
        { id: "s1", textAr: "أ", textEn: "a" },
        { id: "s2", textAr: "ب", textEn: "b" },
        { id: "s3", textAr: "ج", textEn: "c" },
      ],
      userId: "u1",
      model: createScanStubModel(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.servedBy).toBe(STUB_MODEL_ID);
    expect(r.verdict.steps.map((s) => s.verdict)).toEqual(["compliant", "non_compliant", "not_visible"]);
    expect(r.needsReview).toEqual(["s3"]);
  });
});
