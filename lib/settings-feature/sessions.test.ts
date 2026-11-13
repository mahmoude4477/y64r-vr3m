import { describe, expect, it } from "vitest";
import { toSessionView } from "./sessions";

const now = new Date("2026-10-29T09:00:00Z");
const opts = { currentId: "s-current", now, timeZone: "Asia/Riyadh" };
const chrome =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

describe("toSessionView", () => {
  it("marks the current session and reads the device", () => {
    const view = toSessionView(
      { id: "s-current", createdAt: new Date("2026-10-27T08:00:00Z"), updatedAt: new Date("2026-10-29T08:00:00Z"), userAgent: chrome, impersonatedBy: null },
      opts,
    );
    expect(view).toEqual({
      id: "s-current",
      current: true,
      impersonated: false,
      browser: "Chrome",
      os: "Windows",
      device: "desktop",
      signedInAt: new Date("2026-10-27T08:00:00Z"),
      lastActiveDays: 0,
    });
  });

  it("flags a platform admin's impersonation session and counts days since the last refresh", () => {
    const view = toSessionView(
      { id: "s-2", createdAt: new Date("2026-10-25T08:00:00Z"), updatedAt: new Date("2026-10-26T08:00:00Z"), userAgent: null, impersonatedBy: "admin-1" },
      opts,
    );
    expect(view).toMatchObject({ current: false, impersonated: true, browser: null, os: null, device: "unknown", lastActiveDays: 3 });
  });

  it("never carries the token or the IP address", () => {
    const row = {
      id: "s-3",
      createdAt: now,
      updatedAt: now,
      userAgent: chrome,
      impersonatedBy: null,
      token: "secret-token",
      ipAddress: "203.0.113.7",
    };
    const view = toSessionView(row, opts) as Record<string, unknown>;
    expect(view).not.toHaveProperty("token");
    expect(view).not.toHaveProperty("ipAddress");
    expect(JSON.stringify(view)).not.toContain("secret-token");
    expect(JSON.stringify(view)).not.toContain("203.0.113.7");
  });
});
