import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/authz";
import type { AuthContext } from "@/lib/session";

// The review's server logic with Prisma, the audit and the bucket mocked: who may change what, the row lock before any
// status-dependent write, what finalising persists, and that a finalised scan is never changed or deleted.

const m = vi.hoisted(() => ({
  scan: { updateMany: vi.fn(), findFirst: vi.fn(), findFirstOrThrow: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  scanStepResult: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  scanPhoto: { findMany: vi.fn() },
  writeAudit: vi.fn(),
  deleteObjects: vi.fn(),
  calls: [] as string[],
}));

vi.mock("@/lib/prisma", () => {
  const track =
    (name: string, fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) => {
      m.calls.push(name);
      return fn(...a);
    };
  const client = {
    scan: {
      updateMany: track("scan.updateMany", m.scan.updateMany),
      findFirst: track("scan.findFirst", m.scan.findFirst),
      findFirstOrThrow: track("scan.findFirstOrThrow", m.scan.findFirstOrThrow),
      update: track("scan.update", m.scan.update),
      deleteMany: track("scan.deleteMany", m.scan.deleteMany),
      findMany: track("scan.findMany", m.scan.findMany),
    },
    scanStepResult: {
      findUnique: track("step.findUnique", m.scanStepResult.findUnique),
      update: track("step.update", m.scanStepResult.update),
      updateMany: track("step.updateMany", m.scanStepResult.updateMany),
    },
    scanPhoto: { findMany: m.scanPhoto.findMany },
    $transaction: async (fn: (tx: unknown) => unknown) => {
      m.calls.push("tx.begin");
      const r = await fn(client);
      m.calls.push("tx.end");
      return r;
    },
  };
  return { prisma: client };
});
vi.mock("@/lib/audit", () => ({ writeAudit: m.writeAudit }));
// The real deleteScansWithPhotos (lib/data-lifecycle.ts) runs on the mocked client; only the bucket is mocked.
vi.mock("@/lib/storage", () => ({ isStorageConfigured: () => true, deleteObjects: m.deleteObjects }));

const { saveStepDecision, saveScanNotes, finalizeScan, deleteUnfinishedScan } = await import("./review");

const scope: Scope = { userId: "u1", organizationId: "org1", orgRole: "examiner", isPlatformAdmin: false };
const ctxFor = (orgRole: "examiner" | "admin" | "trainee" | null = "examiner", organizationId: string | null = "org1") =>
  ({
    user: { id: "u1" },
    session: { impersonatedBy: null },
    organizationId,
    orgRole,
    isPlatformAdmin: false,
    memberId: "mem1",
  }) as unknown as AuthContext;

beforeEach(() => {
  vi.clearAllMocks();
  m.calls.length = 0;
  m.scan.updateMany.mockResolvedValue({ count: 1 });
});

describe("saveStepDecision", () => {
  it("refuses anyone who is not staff of the active institution", async () => {
    expect(await saveStepDecision({ ...scope, orgRole: "trainee" }, { scanId: "s1", stepId: "p1", verdict: "compliant" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(m.calls).toEqual([]);
  });

  it("locks the scan (still reviewable, this institution) before it writes, and records a hand decision", async () => {
    m.scanStepResult.findUnique.mockResolvedValue({ id: "r1" });
    m.scanStepResult.update.mockResolvedValue({ stepId: "p1", finalVerdict: "compliant", note: "Soap refilled" });
    const r = await saveStepDecision(scope, { scanId: "s1", stepId: "p1", verdict: "compliant", note: "Soap refilled" });
    expect(r).toEqual({ ok: true, stepId: "p1", finalVerdict: "compliant", note: "Soap refilled" });

    // 1) a crashed analysis becomes "failed", 2) the lock: status still draft / review / failed, scoped to org1.
    const [stale, lock] = m.scan.updateMany.mock.calls.map((c) => c[0]);
    expect(stale.where).toMatchObject({ id: "s1", organizationId: "org1", status: "analyzing" });
    expect(stale.data).toEqual({ status: "failed" });
    expect(lock.where).toEqual({ id: "s1", organizationId: "org1", status: { in: ["draft", "review", "failed"] } });
    expect(m.calls.indexOf("scan.updateMany")).toBeLessThan(m.calls.indexOf("step.update"));
    expect(m.scanStepResult.update.mock.calls[0][0]).toMatchObject({
      where: { scanId_stepId: { scanId: "s1", stepId: "p1" } },
      data: { finalVerdict: "compliant", overriddenById: "u1", note: "Soap refilled" },
    });
  });

  it("confirming the AI's verdict records who checked it; a note alone leaves the verdict alone", async () => {
    m.scanStepResult.findUnique.mockResolvedValue({ id: "r1" });
    m.scanStepResult.update.mockResolvedValue({ stepId: "p1", finalVerdict: "compliant", note: null });
    await saveStepDecision(scope, { scanId: "s1", stepId: "p1", verdict: "compliant" });
    expect(m.scanStepResult.update.mock.calls[0][0].data).toEqual({ finalVerdict: "compliant", overriddenById: "u1" });

    await saveStepDecision(scope, { scanId: "s1", stepId: "p1", note: "" });
    expect(m.scanStepResult.update.mock.calls[1][0].data).toEqual({ note: null });
  });

  it("a finalised scan is never changed", async () => {
    m.scan.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });
    m.scan.findFirst.mockResolvedValue({ status: "finalized" });
    expect(await saveStepDecision(scope, { scanId: "s1", stepId: "p1", verdict: "compliant" })).toEqual({ ok: false, error: "finalized" });
    expect(m.scanStepResult.update).not.toHaveBeenCalled();
  });

  it("another institution's scan does not exist; a step of another scan neither", async () => {
    m.scan.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });
    m.scan.findFirst.mockResolvedValue(null);
    expect(await saveStepDecision(scope, { scanId: "x", stepId: "p1", verdict: "compliant" })).toEqual({ ok: false, error: "not_found" });

    m.scanStepResult.findUnique.mockResolvedValue(null);
    expect(await saveStepDecision(scope, { scanId: "s1", stepId: "other", verdict: "compliant" })).toEqual({ ok: false, error: "not_found" });
    expect(m.scanStepResult.update).not.toHaveBeenCalled();
  });

  it("refuses while an analysis runs", async () => {
    m.scan.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });
    m.scan.findFirst.mockResolvedValue({ status: "analyzing" });
    expect(await saveStepDecision(scope, { scanId: "s1", stepId: "p1", verdict: "compliant" })).toEqual({
      ok: false,
      error: "analysis_running",
    });
  });
});

describe("saveScanNotes", () => {
  it("locks a reviewable scan of this institution, then writes the notes", async () => {
    m.scan.update.mockResolvedValue({});
    expect(await saveScanNotes(scope, { scanId: "s1", notes: "Ward manager informed" })).toEqual({ ok: true, notes: "Ward manager informed" });
    expect(m.calls).toEqual(["tx.begin", "scan.updateMany", "scan.updateMany", "scan.update", "tx.end"]);
    expect(m.scan.updateMany.mock.calls[1][0].where).toEqual({ id: "s1", organizationId: "org1", status: { in: ["draft", "review", "failed"] } });
    expect(m.scan.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { notes: "Ward manager informed" } });
  });

  it("never changes the notes of a finalised scan; empty notes clear them", async () => {
    m.scan.updateMany.mockResolvedValue({ count: 0 });
    m.scan.findFirst.mockResolvedValue({ status: "finalized" });
    expect(await saveScanNotes(scope, { scanId: "s1", notes: "Late addition" })).toEqual({ ok: false, error: "finalized" });
    expect(m.scan.update).not.toHaveBeenCalled();
    m.scan.updateMany.mockResolvedValue({ count: 1 });
    m.scan.update.mockResolvedValue({});
    expect(await saveScanNotes(scope, { scanId: "s1", notes: "" })).toEqual({ ok: true, notes: null });
    expect(m.scan.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { notes: null } });
  });
});

describe("finalizeScan", () => {
  const rows = [
    { stepId: "recap", aiVerdict: null, finalVerdict: "compliant", step: { weight: 3, isMandatory: true, isCritical: true, order: 1 } },
    // An unsure AI verdict (55 %) nobody checked: accepted by finalising, counted in the audit row.
    { stepId: "dispose", aiVerdict: "compliant", aiConfidence: 0.55, finalVerdict: null, step: { weight: 3, isMandatory: true, isCritical: true, order: 2 } },
    { stepId: "container", aiVerdict: "non_compliant", aiConfidence: 0.81, finalVerdict: null, step: { weight: 2, isMandatory: true, isCritical: false, order: 3 } },
    { stepId: "fill", aiVerdict: "not_visible", finalVerdict: null, step: { weight: 2, isMandatory: true, isCritical: false, order: 4 } },
  ];

  it("persists the score and risk from lib/scoring, accepted AI verdicts and the audit row in one transaction", async () => {
    m.scan.findFirstOrThrow.mockResolvedValue({ protocolId: "prot1", _count: { photos: 2 }, stepResults: rows });
    const r = await finalizeScan(ctxFor(), "s1");
    // applicable 3 + 3 + 2 = 8, compliant 6 -> 75 %, a mandatory step violated -> medium.
    expect(r).toEqual({ ok: true, score: 75, riskLevel: "medium" });

    const accepted = m.scanStepResult.updateMany.mock.calls.map((c) => c[0]);
    expect(accepted).toEqual([
      { where: { scanId: "s1", stepId: { in: ["dispose"] }, finalVerdict: null, aiVerdict: "compliant" }, data: { finalVerdict: "compliant" } },
      {
        where: { scanId: "s1", stepId: { in: ["container"] }, finalVerdict: null, aiVerdict: "non_compliant" },
        data: { finalVerdict: "non_compliant" },
      },
    ]);
    const saved = m.scan.update.mock.calls[0][0];
    expect(saved.where).toEqual({ id: "s1" });
    expect(saved.data).toMatchObject({ status: "finalized", score: 75, riskLevel: "medium", finalizedById: "u1" });
    expect(saved.data.finalizedAt).toBeInstanceOf(Date);

    const [actor, action, target, meta, options] = m.writeAudit.mock.calls[0];
    expect(actor).toMatchObject({ user: { id: "u1" } });
    expect(action).toBe("scan.finalize");
    expect(target).toEqual({ type: "scan", id: "s1" });
    expect(meta).toEqual({
      protocolId: "prot1",
      score: 75,
      riskLevel: "medium",
      steps: 4,
      violated: 1,
      critical: 0,
      unresolved: 1,
      unsureUnchecked: 1,
      photos: 2,
    });
    expect(options.tx).toBeDefined();
    // Lock first, then read, then write, all inside the transaction.
    expect(m.calls.slice(0, 4)).toEqual(["tx.begin", "scan.updateMany", "scan.updateMany", "scan.findFirstOrThrow"]);
    expect(m.calls.at(-1)).toBe("tx.end");
  });

  it("refuses while a mandatory step is unanswered and writes nothing", async () => {
    m.scan.findFirstOrThrow.mockResolvedValue({
      protocolId: "prot1",
      _count: { photos: 1 },
      stepResults: [...rows, { stepId: "carry", aiVerdict: null, finalVerdict: null, step: { weight: 2, isMandatory: true, isCritical: false, order: 5 } }],
    });
    expect(await finalizeScan(ctxFor(), "s1")).toEqual({ ok: false, error: "incomplete", missing: ["carry"] });
    expect(m.scan.update).not.toHaveBeenCalled();
    expect(m.writeAudit).not.toHaveBeenCalled();
  });

  it("stores null score and null risk when nothing is assessable", async () => {
    m.scan.findFirstOrThrow.mockResolvedValue({ protocolId: "prot1", _count: { photos: 1 }, stepResults: [rows[3]] });
    expect(await finalizeScan(ctxFor(), "s1")).toEqual({ ok: true, score: null, riskLevel: null });
    expect(m.scan.update.mock.calls[0][0].data).toMatchObject({ score: null, riskLevel: null });
  });

  it("never finalises twice, nor for a trainee or a user without an institution", async () => {
    m.scan.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });
    m.scan.findFirst.mockResolvedValue({ status: "finalized" });
    expect(await finalizeScan(ctxFor(), "s1")).toEqual({ ok: false, error: "finalized" });
    expect(await finalizeScan(ctxFor("trainee"), "s1")).toEqual({ ok: false, error: "forbidden" });
    expect(await finalizeScan(ctxFor(null, null), "s1")).toEqual({ ok: false, error: "forbidden" });
    expect(m.scan.update).not.toHaveBeenCalled();
  });
});

describe("deleteUnfinishedScan", () => {
  const draft = { status: "draft", updatedAt: new Date(), examinerId: "u1", protocolId: "prot1" };

  it("deletes the examiner's own draft with its photos, audited in the same transaction, bucket objects after", async () => {
    m.scan.findFirst.mockResolvedValue(draft);
    m.scan.findMany.mockResolvedValue([{ id: "s1" }]);
    m.scanPhoto.findMany.mockResolvedValue([{ storageKey: "k1" }, { storageKey: "k2" }]);
    m.scan.deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteUnfinishedScan(ctxFor(), "s1")).toEqual({ ok: true });

    const where = m.scan.deleteMany.mock.calls[0][0].where.AND[1];
    // The status rule and the examiner rule are part of the delete statement itself.
    expect(where).toMatchObject({ id: "s1", organizationId: "org1", examinerId: "u1" });
    expect(where.OR[0]).toEqual({ status: { in: ["draft", "review", "failed"] } });
    expect(m.writeAudit.mock.calls[0].slice(1, 4)).toEqual(["scan.delete", { type: "scan", id: "s1" }, { protocolId: "prot1", status: "draft", photos: 2 }]);
    expect(m.writeAudit.mock.calls[0][4].tx).toBeDefined();
    expect(m.deleteObjects).toHaveBeenCalledWith(["k1", "k2"]);
  });

  it("an examiner may not delete a colleague's scan; a manager may", async () => {
    m.scan.findFirst.mockResolvedValue({ ...draft, examinerId: "u2" });
    expect(await deleteUnfinishedScan(ctxFor(), "s1")).toEqual({ ok: false, error: "forbidden" });
    expect(m.scan.deleteMany).not.toHaveBeenCalled();

    m.scan.findMany.mockResolvedValue([{ id: "s1" }]);
    m.scanPhoto.findMany.mockResolvedValue([]);
    m.scan.deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteUnfinishedScan(ctxFor("admin"), "s1")).toEqual({ ok: true });
    expect(m.scan.deleteMany.mock.calls[0][0].where.AND[1].examinerId).toBeUndefined();
  });

  it("never deletes a finalised scan, also when it was finalised a moment ago", async () => {
    m.scan.findFirst.mockResolvedValue({ ...draft, status: "finalized" });
    expect(await deleteUnfinishedScan(ctxFor("admin"), "s1")).toEqual({ ok: false, error: "finalized" });
    expect(m.scan.deleteMany).not.toHaveBeenCalled();

    // Checked as a draft, finalised by someone else before the delete statement ran.
    m.scan.findFirst.mockResolvedValueOnce(draft).mockResolvedValueOnce({ status: "finalized" });
    m.scan.findMany.mockResolvedValue([{ id: "s1" }]);
    m.scanPhoto.findMany.mockResolvedValue([{ storageKey: "k1" }]);
    m.scan.deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteUnfinishedScan(ctxFor(), "s1")).toEqual({ ok: false, error: "finalized" });
    expect(m.writeAudit).not.toHaveBeenCalled();
    expect(m.deleteObjects).not.toHaveBeenCalled();
  });
});
