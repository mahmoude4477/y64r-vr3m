import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: null as null | { key: string; value: unknown },
  fail: false,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: async () => {
        if (state.fail) throw new Error("db down");
        return state.row;
      },
    },
  },
}));

const { DEFAULT_PHOTO_RETENTION_DAYS, getPhotoRetentionDays, getSetting, parsePhotoRetentionDays } = await import(
  "./settings"
);

describe("photo retention setting", () => {
  beforeEach(() => {
    state.row = null;
    state.fail = false;
    vi.stubEnv("PHOTO_RETENTION_DAYS", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to 90 days", async () => {
    expect(DEFAULT_PHOTO_RETENTION_DAYS).toBe(90);
    expect(await getPhotoRetentionDays()).toBe(90);
  });

  it("prefers the admin setting over the env value", async () => {
    vi.stubEnv("PHOTO_RETENTION_DAYS", "30");
    expect(await getPhotoRetentionDays()).toBe(30);
    state.row = { key: "scans.photoRetentionDays", value: 365 };
    expect(await getPhotoRetentionDays()).toBe(365);
  });

  it("accepts whole days from 1 to 3650 in the env value", () => {
    expect(parsePhotoRetentionDays(undefined)).toBe(90);
    expect(parsePhotoRetentionDays("  ")).toBe(90);
    expect(parsePhotoRetentionDays(" 1 ")).toBe(1);
    expect(parsePhotoRetentionDays("3650")).toBe(3650);
    for (const bad of ["0", "3651", "-5", "7.5", "30d", "1e3", "abc"]) {
      expect(() => parsePhotoRetentionDays(bad), bad).toThrow(/PHOTO_RETENTION_DAYS/);
    }
  });

  it("never guesses for the deleting job: invalid stored values and DB errors throw", async () => {
    state.row = { key: "scans.photoRetentionDays", value: 0 };
    await expect(getPhotoRetentionDays()).rejects.toThrow(/Invalid stored setting/);
    state.row = { key: "scans.photoRetentionDays", value: "90" };
    await expect(getPhotoRetentionDays()).rejects.toThrow(/Invalid stored setting/);
    state.fail = true;
    await expect(getPhotoRetentionDays()).rejects.toThrow(/db down/);
  });

  it("getSetting stays lenient (display): invalid -> undefined", async () => {
    state.row = { key: "scans.photoRetentionDays", value: 99_999 };
    expect(await getSetting("scans.photoRetentionDays")).toBeUndefined();
  });
});
