import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/authz";
import type { Logger } from "@/lib/log";

// Server logic of the scan flow with Prisma, storage and the AI mocked: who may attach what, and where a scan's status
// goes in every analysis outcome (never stuck in "analyzing").

const m = vi.hoisted(() => ({
  protocol: { findFirst: vi.fn() },
  team: { findFirst: vi.fn() },
  scanPhoto: { count: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  scan: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  scanStepResult: { upsert: vi.fn() },
  storage: { headObject: vi.fn(), deleteObject: vi.fn(), getObjectBytes: vi.fn() },
  analyzeScan: vi.fn(),
  aiAvailable: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => {
  const client = {
    protocol: m.protocol,
    team: m.team,
    scanPhoto: m.scanPhoto,
    scan: m.scan,
    scanStepResult: m.scanStepResult,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { prisma: client };
});
vi.mock("@/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/storage")>();
  // The upload check reads only the first bytes (getObjectHead); the analysis reads the whole photo. One mock for both.
  return {
    ...real,
    headObject: m.storage.headObject,
    deleteObject: m.storage.deleteObject,
    getObjectBytes: m.storage.getObjectBytes,
    getObjectHead: m.storage.getObjectBytes,
  };
});
vi.mock("@/lib/ai/analyze-scan", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ai/analyze-scan")>();
  return { ...real, analyzeScan: m.analyzeScan };
});
vi.mock("./services", () => ({ scanAiAvailable: m.aiAvailable }));

const { createScan } = await import("./create");
const { confirmPhotoUpload, discardOwnUpload } = await import("./photos");
const { runScanAnalysis } = await import("./analysis");

const scope: Scope = { userId: "u1", organizationId: "org1", orgRole: "examiner", isPlatformAdmin: false };
const owner = { organizationId: "org1", userId: "u1" };
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() } as unknown as Logger;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

beforeEach(() => {
  vi.clearAllMocks();
  m.aiAvailable.mockReturnValue(true);
});

describe("createScan", () => {
  const input = { protocolId: "p1", teamId: null, areaLabel: "Room 12 sink", photoIds: ["ph1", "ph2"] };

  it("creates a draft with one step row per protocol step and attaches the user's own photos", async () => {
    m.protocol.findFirst.mockResolvedValue({ id: "p1", steps: [{ id: "s1" }, { id: "s2" }] });
    m.scanPhoto.count.mockResolvedValue(2);
    m.scan.create.mockResolvedValue({ id: "scan1" });
    m.scanPhoto.updateMany.mockResolvedValue({ count: 2 });
    expect(await createScan(scope, input)).toEqual({ ok: true, id: "scan1" });

    const protocolWhere = m.protocol.findFirst.mock.calls[0][0].where;
    expect(protocolWhere.AND[0]).toEqual({ id: "p1", isPublished: true });
    expect(m.scan.create.mock.calls[0][0].data).toMatchObject({
      organizationId: "org1",
      examinerId: "u1",
      status: "draft",
      teamId: null,
      stepResults: { createMany: { data: [{ stepId: "s1" }, { stepId: "s2" }] } },
    });
    expect(m.scanPhoto.updateMany.mock.calls[0][0].where).toEqual({
      id: { in: ["ph1", "ph2"] },
      organizationId: "org1",
      uploadedById: "u1",
      scanId: null,
    });
  });

  it("refuses an unknown protocol, a foreign department and photos that are not the user's", async () => {
    m.protocol.findFirst.mockResolvedValue(null);
    expect(await createScan(scope, input)).toMatchObject({ ok: false, status: 404, error: "protocol_not_found" });

    m.protocol.findFirst.mockResolvedValue({ id: "p1", steps: [{ id: "s1" }] });
    m.team.findFirst.mockResolvedValue(null);
    expect(await createScan(scope, { ...input, teamId: "t-other" })).toMatchObject({ error: "team_not_found" });
    expect(m.team.findFirst.mock.calls[0][0].where).toEqual({ id: "t-other", organizationId: "org1" });

    m.scanPhoto.count.mockResolvedValue(1);
    expect(await createScan(scope, input)).toMatchObject({ status: 409, error: "photos_unavailable" });
    expect(m.scan.create).not.toHaveBeenCalled();
  });

  it("saves nothing when a photo was attached elsewhere meanwhile", async () => {
    m.protocol.findFirst.mockResolvedValue({ id: "p1", steps: [{ id: "s1" }] });
    m.scanPhoto.count.mockResolvedValue(2);
    m.scan.create.mockResolvedValue({ id: "scan1" });
    m.scanPhoto.updateMany.mockResolvedValue({ count: 1 });
    expect(await createScan(scope, input)).toMatchObject({ status: 409, error: "photos_unavailable" });
  });

  it("refuses a user without an active institution", async () => {
    expect(await createScan({ ...scope, organizationId: null, orgRole: null }, input)).toMatchObject({ status: 403 });
  });
});

describe("confirmPhotoUpload", () => {
  const key = "scans/org1/u1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg";

  it("refuses keys of another user or institution", async () => {
    for (const k of [key.replace("u1", "u2"), key.replace("org1", "org2"), "scans/org1/u1/../../x.jpg"]) {
      expect(await confirmPhotoUpload(owner, { key: k, width: 10, height: 10 })).toMatchObject({ status: 403, error: "forbidden_key" });
    }
    expect(m.storage.headObject).not.toHaveBeenCalled();
  });

  it("needs the uploaded object, with an allowed type and size", async () => {
    m.scanPhoto.findUnique.mockResolvedValue(null);
    m.storage.headObject.mockResolvedValue(null);
    expect(await confirmPhotoUpload(owner, { key, width: 10, height: 10 })).toMatchObject({ status: 404, error: "not_uploaded" });

    m.storage.headObject.mockResolvedValue({ bytes: 100, contentType: "image/svg+xml" });
    m.storage.deleteObject.mockResolvedValue(undefined);
    expect(await confirmPhotoUpload(owner, { key, width: 10, height: 10 })).toMatchObject({ status: 422, error: "invalid_photo" });
    expect(m.storage.deleteObject).toHaveBeenCalledWith(key);

    m.storage.headObject.mockResolvedValue({ bytes: 2048, contentType: "image/jpeg" });
    m.storage.getObjectBytes.mockResolvedValue(jpeg);
    m.scanPhoto.create.mockResolvedValue({ id: "ph1" });
    expect(await confirmPhotoUpload(owner, { key, width: 1568, height: 1176 })).toEqual({ ok: true, id: "ph1" });
    expect(m.storage.getObjectBytes).toHaveBeenCalledWith(key);
    expect(m.scanPhoto.create.mock.calls[0][0].data).toMatchObject({
      organizationId: "org1",
      uploadedById: "u1",
      storageKey: key,
      mime: "image/jpeg",
      bytes: 2048,
    });
  });

  it("refuses bytes that are not the image type they were uploaded as, and deletes them", async () => {
    m.scanPhoto.findUnique.mockResolvedValue(null);
    m.storage.deleteObject.mockResolvedValue(undefined);
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    for (const [contentType, bytes] of [
      ["image/jpeg", html],
      ["image/png", jpeg], // a real JPEG labelled as PNG
    ] as const) {
      vi.clearAllMocks();
      m.storage.headObject.mockResolvedValue({ bytes: bytes.length, contentType });
      m.storage.getObjectBytes.mockResolvedValue(bytes);
      expect(await confirmPhotoUpload(owner, { key, width: 10, height: 10 })).toMatchObject({ status: 422, error: "invalid_photo" });
      expect(m.storage.deleteObject).toHaveBeenCalledWith(key);
      expect(m.scanPhoto.create).not.toHaveBeenCalled();
    }
  });

  it("is idempotent for the owner and refuses a key someone else confirmed", async () => {
    m.scanPhoto.findUnique.mockResolvedValue({ id: "ph1", organizationId: "org1", uploadedById: "u1" });
    expect(await confirmPhotoUpload(owner, { key, width: 1, height: 1 })).toEqual({ ok: true, id: "ph1" });
    m.scanPhoto.findUnique.mockResolvedValue({ id: "ph1", organizationId: "org1", uploadedById: null });
    expect(await confirmPhotoUpload(owner, { key, width: 1, height: 1 })).toMatchObject({ status: 409 });
  });
});

describe("discardOwnUpload", () => {
  const where = { id: "ph1", organizationId: "org1", uploadedById: "u1", scanId: null };

  it("deletes only the user's own unattached upload: the row in one conditional statement, then the object", async () => {
    m.scanPhoto.findFirst.mockResolvedValue(null);
    expect(await discardOwnUpload(owner, "ph9")).toMatchObject({ status: 404 });
    expect(m.scanPhoto.findFirst.mock.calls[0][0].where).toEqual({ ...where, id: "ph9" });
    expect(m.scanPhoto.deleteMany).not.toHaveBeenCalled();

    m.scanPhoto.findFirst.mockResolvedValue({ storageKey: "scans/org1/u1/k.jpg" });
    m.scanPhoto.deleteMany.mockResolvedValue({ count: 1 });
    m.storage.deleteObject.mockResolvedValue(undefined);
    expect(await discardOwnUpload(owner, "ph1")).toEqual({ ok: true });
    expect(m.scanPhoto.deleteMany).toHaveBeenCalledWith({ where });
    expect(m.storage.deleteObject).toHaveBeenCalledWith("scans/org1/u1/k.jpg");
    expect(m.scanPhoto.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(m.storage.deleteObject.mock.invocationCallOrder[0]);
  });

  it("never deletes the file of a photo a scan attached in between (the race with POST /api/scans)", async () => {
    m.scanPhoto.findFirst.mockResolvedValue({ storageKey: "scans/org1/u1/k.jpg" });
    m.scanPhoto.deleteMany.mockResolvedValue({ count: 0 }); // createScan's updateMany committed first
    expect(await discardOwnUpload(owner, "ph1")).toMatchObject({ status: 404, error: "not_found" });
    expect(m.storage.deleteObject).not.toHaveBeenCalled();
  });

  it("still succeeds when the bucket delete fails (the row is gone; the object is logged as an orphan)", async () => {
    m.scanPhoto.findFirst.mockResolvedValue({ storageKey: "scans/org1/u1/k.jpg" });
    m.scanPhoto.deleteMany.mockResolvedValue({ count: 1 });
    m.storage.deleteObject.mockRejectedValueOnce(new Error("bucket down"));
    expect(await discardOwnUpload(owner, "ph1")).toEqual({ ok: true });
  });
});

describe("runScanAnalysis", () => {
  const scanRow = (over: Record<string, unknown> = {}) => ({
    id: "scan1",
    status: "draft",
    updatedAt: new Date(),
    areaLabel: "Room 12",
    organizationId: "org1",
    protocol: { titleAr: "أ", titleEn: "A" },
    photos: [{ id: "ph1", storageKey: "k1" }],
    stepResults: [
      { step: { id: "s2", order: 2, textAr: "ب", textEn: "b", criteriaAr: null, criteriaEn: null } },
      { step: { id: "s1", order: 1, textAr: "أ", textEn: "a", criteriaAr: "م", criteriaEn: "c" } },
    ],
    ...over,
  });
  const ok = {
    ok: true,
    verdict: {
      steps: [
        { stepId: "s1", verdict: "compliant", confidence: 0.9, evidenceAr: "أ", evidenceEn: "a" },
        { stepId: "s2", verdict: "not_visible", confidence: 0.2, evidenceAr: "ب", evidenceEn: "b" },
      ],
      overallNotesAr: "ملاحظات",
      overallNotesEn: "Notes",
    },
    needsReview: ["s2"],
    servedBy: "claude-opus-5-5",
    usage: {},
    latencyMs: 1200,
    raw: { steps: [] },
  };
  const statuses = () => m.scan.updateMany.mock.calls.map((c) => c[0].data.status);

  beforeEach(() => {
    m.scan.updateMany.mockResolvedValue({ count: 1 });
    m.storage.getObjectBytes.mockResolvedValue(jpeg);
  });

  it("claims the scan, sends the visual steps in order with the photo bytes, and saves the verdicts", async () => {
    m.scan.findFirst.mockResolvedValue(scanRow());
    m.analyzeScan.mockResolvedValue(ok);
    expect(await runScanAnalysis(scope, "scan1", logger)).toEqual({ ok: true, steps: 2, needsReview: 1 });
    expect(m.scan.findFirst.mock.calls[0][0].where).toEqual({ id: "scan1", organizationId: "org1" });
    const call = m.analyzeScan.mock.calls[0][0];
    expect(call.steps.map((s: { id: string }) => s.id)).toEqual(["s1", "s2"]);
    expect(call.images).toEqual([{ data: jpeg, mediaType: "image/jpeg" }]);
    expect(call).toMatchObject({ userId: "u1", organizationId: "org1", scanId: "scan1", area: "Room 12" });
    expect(call.abortSignal).toBeUndefined(); // the call outlives a dropped phone connection
    expect(statuses()).toEqual(["analyzing", "review"]);
    expect(m.scan.updateMany.mock.calls[1][0].data).toMatchObject({ aiModel: "claude-opus-5-5", overallNotesEn: "Notes" });
    expect(m.scanStepResult.upsert).toHaveBeenCalledTimes(2);
    expect(m.scanStepResult.upsert.mock.calls[0][0]).toMatchObject({
      where: { scanId_stepId: { scanId: "scan1", stepId: "s1" } },
      update: { aiVerdict: "compliant", aiConfidence: 0.9, evidenceAr: "أ", evidenceEn: "a" },
    });
  });

  it("refuses scans it may not analyse", async () => {
    m.scan.findFirst.mockResolvedValue(null);
    expect(await runScanAnalysis(scope, "x", logger)).toMatchObject({ status: 404 });
    m.scan.findFirst.mockResolvedValue(scanRow({ status: "review" }));
    expect(await runScanAnalysis(scope, "scan1", logger)).toMatchObject({ status: 409, error: "already_analyzed" });
    m.scan.findFirst.mockResolvedValue(scanRow({ stepResults: [] }));
    expect(await runScanAnalysis(scope, "scan1", logger)).toMatchObject({ status: 422, error: "no_visual_steps" });
    m.aiAvailable.mockReturnValue(false);
    m.scan.findFirst.mockResolvedValue(scanRow());
    expect(await runScanAnalysis(scope, "scan1", logger)).toMatchObject({ status: 503, error: "not_configured" });
    expect(m.analyzeScan).not.toHaveBeenCalled();
    expect(m.scan.updateMany).not.toHaveBeenCalled();
  });

  it("does not start a second call when another request holds the scan", async () => {
    m.scan.findFirst.mockResolvedValue(scanRow());
    m.scan.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await runScanAnalysis(scope, "scan1", logger)).toMatchObject({ status: 409, error: "analysis_running" });
    expect(m.analyzeScan).not.toHaveBeenCalled();
  });

  it("puts the scan back to draft when the AI never started, and to failed when the call failed", async () => {
    m.scan.findFirst.mockResolvedValue(scanRow());
    m.analyzeScan.mockResolvedValue({ ok: false, code: "daily_limit", retryable: false });
    expect(await runScanAnalysis(scope, "scan1", logger)).toMatchObject({ status: 429, error: "daily_limit" });
    expect(statuses()).toEqual(["analyzing", "draft"]);

    vi.clearAllMocks();
    m.scan.updateMany.mockResolvedValue({ count: 1 });
    m.scan.findFirst.mockResolvedValue(scanRow());
    m.analyzeScan.mockResolvedValue({ ok: false, code: "timeout", retryable: true });
    expect(await runScanAnalysis(scope, "scan1", logger)).toMatchObject({ status: 503, error: "timeout", retryable: true });
    expect(statuses()).toEqual(["analyzing", "failed"]);
  });

  it("checks the photo bytes and never leaves the scan in analyzing", async () => {
    m.scan.findFirst.mockResolvedValue(scanRow());
    m.storage.getObjectBytes.mockResolvedValue(new TextEncoder().encode("<svg/>"));
    expect(await runScanAnalysis(scope, "scan1", logger)).toMatchObject({ status: 422, error: "invalid_photo" });
    expect(statuses()).toEqual(["analyzing", "draft"]);

    vi.clearAllMocks();
    m.scan.updateMany.mockResolvedValue({ count: 1 });
    m.scan.findFirst.mockResolvedValue(scanRow({ status: "failed" }));
    m.storage.getObjectBytes.mockRejectedValue(new Error("bucket down"));
    expect(await runScanAnalysis(scope, "scan1", logger)).toMatchObject({ status: 502, error: "storage_failed" });
    expect(statuses()).toEqual(["analyzing", "failed"]);

    vi.clearAllMocks();
    m.scan.updateMany.mockResolvedValue({ count: 1 });
    m.scan.findFirst.mockResolvedValue(scanRow());
    m.storage.getObjectBytes.mockResolvedValue(jpeg);
    m.analyzeScan.mockRejectedValue(new Error("boom"));
    await expect(runScanAnalysis(scope, "scan1", logger)).rejects.toThrow("boom");
    expect(statuses()).toEqual(["analyzing", "failed"]);
  });
});
