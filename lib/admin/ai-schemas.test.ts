import { describe, expect, it, vi } from "vitest";

// lib/settings.ts and lib/ai/model.ts are server modules; only their constants are used here.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { SETTINGS } = await import("@/lib/settings");
const { AI_EFFORTS } = await import("@/lib/ai/model");
const { AI_DAILY_LIMIT_MAX, AI_EFFORT_OPTIONS, aiDailyLimitFormSchema, aiModelFormSchema, aiSettingResetSchema, aiSettingSchema, deleteAttemptSchema, deleteScanSchema } =
  await import("./schemas");

describe("AI setting schemas agree with lib/settings.ts", () => {
  it("offers exactly the efforts the model accepts", () => {
    expect([...AI_EFFORT_OPTIONS]).toEqual([...AI_EFFORTS]);
    for (const e of AI_EFFORT_OPTIONS) expect(SETTINGS["ai.effort"].safeParse(e).success).toBe(true);
  });

  it("accepts the same model ids", () => {
    for (const id of ["claude-opus-5-5", "claude-sonnet-5", "claude-haiku-5-5", "claude-opus-4-8-20260101", "claude-x.y"]) {
      const parsed = aiModelFormSchema.safeParse({ model: id });
      expect(parsed.success).toBe(true);
      expect(SETTINGS["ai.model"].safeParse(parsed.success ? parsed.data.model : "").success).toBe(true);
    }
    for (const bad of ["", "gpt-5", "claude_opus", "claude-", "claude-opus 5", "claude-opus-5-5;drop", `claude-${"a".repeat(100)}`]) {
      expect(aiModelFormSchema.safeParse({ model: bad }).success).toBe(false);
    }
    // Typed with capitals or spaces around: stored in lower case.
    const typed = aiModelFormSchema.safeParse({ model: "  Claude-Opus-5-5 " });
    expect(typed.success && typed.data.model).toBe("claude-opus-5-5");
  });

  it("accepts the same daily limits", () => {
    for (const n of [0, 1, 20, AI_DAILY_LIMIT_MAX]) {
      expect(aiDailyLimitFormSchema.safeParse({ limit: n }).success).toBe(true);
      expect(SETTINGS["ai.dailyLimitPerUser"].safeParse(n).success).toBe(true);
    }
    for (const n of [-1, 1.5, AI_DAILY_LIMIT_MAX + 1, Number.NaN]) {
      expect(aiDailyLimitFormSchema.safeParse({ limit: n }).success).toBe(false);
      expect(SETTINGS["ai.dailyLimitPerUser"].safeParse(n).success).toBe(false);
    }
  });

  it("ties each value to its key, and never offers the photo-retention setting", () => {
    expect(aiSettingSchema.safeParse({ key: "ai.effort", value: "high" }).success).toBe(true);
    expect(aiSettingSchema.safeParse({ key: "ai.effort", value: 20 }).success).toBe(false);
    expect(aiSettingSchema.safeParse({ key: "ai.dailyLimitPerUser", value: "20" }).success).toBe(false);
    expect(aiSettingSchema.safeParse({ key: "scans.photoRetentionDays", value: 30 }).success).toBe(false);
    expect(aiSettingResetSchema.safeParse({ key: "scans.photoRetentionDays" }).success).toBe(false);
    expect(aiSettingResetSchema.safeParse({ key: "ai.model" }).success).toBe(true);
  });
});

describe("assessment delete schemas", () => {
  it("need a known reason", () => {
    expect(deleteScanSchema.safeParse({ scanId: "s1", reason: "abusive" }).success).toBe(true);
    expect(deleteScanSchema.safeParse({ scanId: "s1", reason: "because" }).success).toBe(false);
    expect(deleteScanSchema.safeParse({ scanId: "", reason: "test" }).success).toBe(false);
    expect(deleteAttemptSchema.safeParse({ attemptId: "a1", reason: "duplicate" }).success).toBe(true);
    expect(deleteAttemptSchema.safeParse({ attemptId: "a1" }).success).toBe(false);
  });
});
