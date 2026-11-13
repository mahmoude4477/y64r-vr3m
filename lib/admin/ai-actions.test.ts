import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

// The AI settings actions of /admin/ai with every dependency mocked: no database and no session. The write and its
// audit row share one transaction (writeAudit with { tx }), so a failed audit insert rolls the change back.

const ctx = { user: { id: "admin-1" }, session: { impersonatedBy: null } };
const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  executeRaw: vi.fn(),
  writeAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));
const tx = {
  appSetting: { findUnique: mocks.findUnique, upsert: mocks.upsert, deleteMany: mocks.deleteMany },
  $executeRaw: mocks.executeRaw,
};

vi.mock("@/lib/session", () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock("@/lib/settings", () => ({
  SETTINGS: {
    "ai.dailyLimitPerUser": z.number().int().min(0).max(10_000),
    "ai.model": z.string().regex(/^claude-[a-z0-9.-]+$/),
    "ai.effort": z.enum(["low", "medium", "high", "xhigh", "max"]),
  },
}));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => `t:${key}` }));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } }));

const { resetAiSettingAction, updateAiSettingAction } = await import("./ai-actions");

const stored = (value: unknown) => mocks.findUnique.mockResolvedValue(value === undefined ? null : { value });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePlatformAdmin.mockResolvedValue(ctx);
  mocks.writeAudit.mockResolvedValue(undefined);
});

describe("updateAiSettingAction", () => {
  it("refuses unknown keys and invalid values before touching the session", async () => {
    for (const input of [
      { key: "scans.photoRetentionDays", value: 30 },
      { key: "ai.model", value: "gpt-5" },
      { key: "ai.effort", value: "turbo" },
      { key: "ai.dailyLimitPerUser", value: -1 },
      { key: "ai.dailyLimitPerUser", value: 10_001 },
    ]) {
      expect(await updateAiSettingAction("ar", input)).toMatchObject({ ok: false, error: "invalidInput" });
    }
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("saves the value as the admin and audits the old and the new one in the same transaction", async () => {
    stored(20);
    expect(await updateAiSettingAction("en", { key: "ai.dailyLimitPerUser", value: 50 })).toEqual({ ok: true });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { key: "ai.dailyLimitPerUser" },
      create: { key: "ai.dailyLimitPerUser", value: 50, updatedById: "admin-1" },
      update: { value: 50, updatedById: "admin-1" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      ctx,
      "setting.update",
      { type: "setting", id: "ai.dailyLimitPerUser" },
      { key: "ai.dailyLimitPerUser", from: 20, to: 50 },
      { tx },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/admin", "layout");
  });

  it("stores model ids in lower case and records a first value as from null", async () => {
    stored(undefined);
    expect(await updateAiSettingAction("ar", { key: "ai.model", value: " Claude-Sonnet-5-5 " })).toEqual({ ok: true });
    expect(mocks.upsert.mock.calls[0][0].create).toEqual({ key: "ai.model", value: "claude-sonnet-5-5", updatedById: "admin-1" });
    expect(mocks.writeAudit.mock.calls[0][3]).toEqual({ key: "ai.model", from: null, to: "claude-sonnet-5-5" });
  });

  it("answers the generic error when the database fails, without an audit row", async () => {
    stored("medium");
    mocks.upsert.mockRejectedValue(new Error("db down"));
    expect(await updateAiSettingAction("ar", { key: "ai.effort", value: "high" })).toMatchObject({ ok: false, error: "generic" });
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("fails (and the transaction rolls back) when the audit row cannot be written", async () => {
    stored("medium");
    mocks.upsert.mockResolvedValue({});
    mocks.writeAudit.mockRejectedValue(new Error("audit insert failed"));
    expect(await updateAiSettingAction("ar", { key: "ai.effort", value: "high" })).toMatchObject({ ok: false, error: "generic" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("records an invalid stored value as from null", async () => {
    stored("turbo");
    expect(await updateAiSettingAction("ar", { key: "ai.effort", value: "low" })).toEqual({ ok: true });
    expect(mocks.writeAudit.mock.calls[0][3]).toEqual({ key: "ai.effort", from: null, to: "low" });
  });
});

describe("resetAiSettingAction", () => {
  it("removes the panel value and audits it", async () => {
    stored("high");
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    expect(await resetAiSettingAction("ar", { key: "ai.effort" })).toEqual({ ok: true });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { key: "ai.effort" } });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      ctx,
      "setting.reset",
      { type: "setting", id: "ai.effort" },
      { key: "ai.effort", from: "high" },
      { tx },
    );
  });

  it("writes no audit row when there was nothing to reset", async () => {
    stored(undefined);
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    expect(await resetAiSettingAction("ar", { key: "ai.model" })).toEqual({ ok: true });
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("never resets the postponed photo-retention setting", async () => {
    expect(await resetAiSettingAction("ar", { key: "scans.photoRetentionDays" })).toMatchObject({ ok: false, error: "invalidInput" });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
