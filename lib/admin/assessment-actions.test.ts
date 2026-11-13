import { beforeEach, describe, expect, it, vi } from "vitest";

// The delete actions of /admin/assessments with every dependency mocked: no database, no session, no bucket.

const ctx = { user: { id: "admin-1" }, session: { impersonatedBy: null } };
const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  deleteScansWithPhotos: vi.fn(),
  writeAudit: vi.fn(),
  revalidatePath: vi.fn(),
  scanFindUnique: vi.fn(),
  attemptFindUnique: vi.fn(),
  attemptDelete: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock("@/lib/data-lifecycle", () => ({ deleteScansWithPhotos: mocks.deleteScansWithPhotos }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => `t:${key}` }));
vi.mock("@/lib/log", () => ({ log: { error: mocks.logError, warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/prisma", () => {
  const tx = { simulationAttempt: { findUnique: mocks.attemptFindUnique, delete: mocks.attemptDelete } };
  return {
    prisma: {
      scan: { findUnique: mocks.scanFindUnique },
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

const { deleteAttemptAction, deleteScanAction } = await import("./assessment-actions");

/** Like the real deleteScansWithPhotos: the audit callback runs inside the transaction, and its failure rejects. */
async function deleteRunningAudit(ids: string[], options?: { audit?: (tx: unknown, d: { ids: string[]; photos: number }) => Promise<void> }) {
  await options?.audit?.("tx", { ids, photos: 0 });
  return ids.length;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeAudit.mockReset();
  mocks.requirePlatformAdmin.mockResolvedValue(ctx);
});

describe("deleteScanAction", () => {
  it("validates before it checks the session, and the session before it deletes", async () => {
    expect(await deleteScanAction("fr", { scanId: "s1", reason: "test" })).toMatchObject({ ok: false, error: "bad_locale" });
    expect(await deleteScanAction("ar", { scanId: "s1", reason: "spite" })).toMatchObject({ ok: false, error: "invalidInput" });
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();

    mocks.requirePlatformAdmin.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
    await expect(deleteScanAction("ar", { scanId: "s1", reason: "test" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.deleteScansWithPhotos).not.toHaveBeenCalled();
  });

  it("deletes the scan with its photos and audits who, what and why", async () => {
    mocks.scanFindUnique.mockResolvedValue({ organizationId: "o1", protocolId: "p1", status: "finalized", _count: { photos: 3 } });
    mocks.deleteScansWithPhotos.mockImplementation(deleteRunningAudit);
    expect(await deleteScanAction("en", { scanId: "s1", reason: "abusive" })).toEqual({ ok: true });
    expect(mocks.deleteScansWithPhotos).toHaveBeenCalledWith(["s1"], expect.objectContaining({ audit: expect.any(Function) }));
    const call = mocks.writeAudit.mock.calls[0];
    expect(call.slice(0, 4)).toEqual([
      ctx,
      "scan.delete",
      { type: "scan", id: "s1" },
      { organizationId: "o1", protocolId: "p1", status: "finalized", photos: 3, reason: "abusive", by: "platform_admin" },
    ]);
    // Inside the delete's transaction: a failed insert throws and rolls the delete back.
    expect(call[4]).toEqual({ tx: "tx" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/admin", "layout");
  });

  it("a failed audit row fails the delete (one transaction): the generic error, nothing reported as deleted", async () => {
    mocks.scanFindUnique.mockResolvedValue({ organizationId: "o1", protocolId: "p1", status: "finalized", _count: { photos: 0 } });
    mocks.deleteScansWithPhotos.mockImplementation(deleteRunningAudit);
    mocks.writeAudit.mockRejectedValue(new Error("audit table down"));
    expect(await deleteScanAction("en", { scanId: "s1", reason: "test" })).toMatchObject({ ok: false, error: "generic" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("answers not found for a scan that is already gone, without an audit row", async () => {
    mocks.scanFindUnique.mockResolvedValue(null);
    expect(await deleteScanAction("ar", { scanId: "s1", reason: "test" })).toEqual({ ok: false, error: "notFound", message: "t:notFound" });
    expect(mocks.deleteScansWithPhotos).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("turns a database failure into the generic error", async () => {
    mocks.scanFindUnique.mockRejectedValue(new Error("pool timeout"));
    expect(await deleteScanAction("ar", { scanId: "s1", reason: "test" })).toMatchObject({ ok: false, error: "generic" });
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});

describe("deleteAttemptAction", () => {
  it("deletes the attempt and writes the audit row in the same transaction", async () => {
    mocks.attemptFindUnique.mockResolvedValue({ userId: "u1", organizationId: null, scenarioId: "sc1", status: "completed" });
    expect(await deleteAttemptAction("ar", { attemptId: "a1", reason: "duplicate" })).toEqual({ ok: true });
    expect(mocks.attemptDelete).toHaveBeenCalledWith({ where: { id: "a1" } });
    const call = mocks.writeAudit.mock.calls[0];
    expect(call.slice(0, 4)).toEqual([
      ctx,
      "attempt.delete",
      { type: "simulation_attempt", id: "a1" },
      { userId: "u1", organizationId: null, scenarioId: "sc1", status: "completed", reason: "duplicate" },
    ]);
    expect(call[4]).toHaveProperty("tx");
  });

  it("answers not found when there is no such attempt", async () => {
    mocks.attemptFindUnique.mockResolvedValue(null);
    expect(await deleteAttemptAction("ar", { attemptId: "a1", reason: "test" })).toMatchObject({ ok: false, error: "notFound" });
    expect(mocks.attemptDelete).not.toHaveBeenCalled();
  });

  it("rolls back (generic error) when the audit row cannot be written", async () => {
    mocks.attemptFindUnique.mockResolvedValue({ userId: "u1", organizationId: "o1", scenarioId: "sc1", status: "completed" });
    mocks.writeAudit.mockRejectedValueOnce(new Error("audit insert failed"));
    expect(await deleteAttemptAction("ar", { attemptId: "a1", reason: "test" })).toMatchObject({ ok: false, error: "generic" });
  });
});
