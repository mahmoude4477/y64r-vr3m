import { describe, expect, it } from "vitest";
import { auditActionKey, auditActorRoleKey, auditActorView, auditImpersonating, auditTargetTypeKey, AUDIT_ACTION_KEYS } from "./audit-display";
import { orgNames } from "./display";
import { adminErrorKeyForCode, apiErrorParts, ADMIN_ERROR_KEYS } from "./errors";
import { initialsOf } from "./initials";
import { activeAdminSection } from "./sections";
import { organizationSlug, slugBase } from "./slug";
import { daysAgo, riyadhDayStart, riyadhMonthStart } from "./time";
import { describeUserAgent } from "./user-agent";
import en from "../../messages/en/admin.json";
import ar from "../../messages/ar/admin.json";

describe("Riyadh calendar periods", () => {
  it("starts the day at 00:00 Riyadh (21:00 UTC the day before)", () => {
    expect(riyadhDayStart(new Date("2026-10-29T10:00:00Z")).toISOString()).toBe("2026-10-28T21:00:00.000Z");
    // 22:30 UTC is already the next Riyadh day
    expect(riyadhDayStart(new Date("2026-10-29T22:30:00Z")).toISOString()).toBe("2026-10-29T21:00:00.000Z");
  });

  it("starts the month on the 1st at 00:00 Riyadh", () => {
    expect(riyadhMonthStart(new Date("2026-10-29T10:00:00Z")).toISOString()).toBe("2026-09-30T21:00:00.000Z");
    // 31 October 22:00 UTC is 1 November in Riyadh
    expect(riyadhMonthStart(new Date("2026-10-31T22:00:00Z")).toISOString()).toBe("2026-10-31T21:00:00.000Z");
    expect(riyadhMonthStart(new Date("2027-01-01T02:00:00Z")).toISOString()).toBe("2026-12-31T21:00:00.000Z");
  });

  it("counts rolling days back", () => {
    expect(daysAgo(30, new Date("2026-10-31T00:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("user agents", () => {
  it("names common browsers and systems", () => {
    expect(
      describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0"),
    ).toEqual({ browser: "edge", os: "windows", device: "desktop" });
    expect(
      describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1"),
    ).toEqual({ browser: "safari", os: "ios", device: "mobile" });
    expect(describeUserAgent("Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36")).toEqual({
      browser: "chrome",
      os: "android",
      device: "mobile",
    });
    expect(describeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0; rv:140.0) Gecko/20100101 Firefox/140.0").browser).toBe("firefox");
  });

  it("returns nulls for an empty or unknown agent", () => {
    expect(describeUserAgent(null)).toEqual({ browser: null, os: null, device: null });
    expect(describeUserAgent("curl/8.0")).toEqual({ browser: null, os: null, device: null });
  });
});

describe("organization slugs", () => {
  it("uses the English name in lowercase ASCII", () => {
    expect(slugBase("King Fahd Hospital")).toBe("king-fahd-hospital");
    expect(slugBase("  Al-Jouf University (Nursing)  ")).toBe("al-jouf-university-nursing");
    expect(slugBase("Hôpital Général")).toBe("hopital-general");
    expect(slugBase("مستشفى")).toBe("");
  });

  it("adds the random suffix and falls back to 'institution'", () => {
    expect(organizationSlug("King Fahd Hospital", "a1b2c3d4")).toBe("king-fahd-hospital-a1b2c3d4");
    expect(organizationSlug("مستشفى", "ff00")).toBe("institution-ff00");
    expect(organizationSlug("x".repeat(80), "1")).toBe(`${"x".repeat(40)}-1`);
  });
});

describe("audit display", () => {
  it("follows the actor rule of CONVENTIONS 6", () => {
    expect(auditActorView({ actorId: null, actorName: null, actorDeleted: true })).toEqual({ kind: "deleted" });
    expect(auditActorView({ actorId: null, actorName: null, actorDeleted: false })).toEqual({ kind: "system" });
    expect(auditActorView({ actorId: "u1", actorName: "Old name", actorDeleted: false, actor: { name: "New name" } })).toEqual({
      kind: "user",
      userId: "u1",
      name: "New name",
    });
    expect(auditActorView({ actorId: null, actorName: "Snapshot", actorDeleted: false, actor: null })).toEqual({
      kind: "user",
      userId: null,
      name: "Snapshot",
    });
  });

  it("maps known actions to message keys and leaves unknown ones as codes", () => {
    expect(auditActionKey("auth.admin.ban-user")).toBe("banUser");
    expect(auditActionKey("organization.suspend")).toBe("orgSuspend");
    expect(auditActionKey("something.new")).toBeNull();
    expect(auditActionKey("toString")).toBeNull();
  });

  it("has a message for every mapped action in both languages", () => {
    for (const key of Object.values(AUDIT_ACTION_KEYS)) {
      expect(en.activity.actions).toHaveProperty(key);
      expect(ar.activity.actions).toHaveProperty(key);
    }
  });

  it("reads meta.impersonating", () => {
    expect(auditImpersonating({ impersonating: "u2" })).toBe("u2");
    expect(auditImpersonating({ impersonating: "" })).toBeNull();
    expect(auditImpersonating(["u2"])).toBeNull();
    expect(auditImpersonating(null)).toBeNull();
  });
});

describe("admin error codes", () => {
  it("maps the Waqaya and Better Auth codes the brief names", () => {
    expect(adminErrorKeyForCode("ACCOUNT_DELETION_BLOCKED")).toBe("deletionBlocked");
    expect(adminErrorKeyForCode("LAST_PLATFORM_ADMIN")).toBe("lastPlatformAdmin");
    expect(adminErrorKeyForCode("ROLE_NOT_ALLOWED")).toBe("roleNotAllowed");
    expect(adminErrorKeyForCode("ACCOUNT_LOCK_BUSY")).toBe("lockBusy");
    expect(adminErrorKeyForCode("FIELD_NOT_ALLOWED")).toBe("fieldNotAllowed");
    expect(adminErrorKeyForCode("YOU_CANNOT_IMPERSONATE_ADMINS")).toBe("impersonateAdmin");
    expect(adminErrorKeyForCode("NOPE")).toBeNull();
    expect(adminErrorKeyForCode(undefined)).toBeNull();
    expect(adminErrorKeyForCode("__proto__")).toBeNull();
  });

  it("has a message for every error key in both languages", () => {
    for (const key of ADMIN_ERROR_KEYS) {
      expect(en.errors).toHaveProperty(key);
      expect(ar.errors).toHaveProperty(key);
    }
  });

  it("reads status, code and message of an APIError-like value", () => {
    expect(apiErrorParts({ statusCode: 400, body: { code: "LAST_PLATFORM_ADMIN", message: "x" } })).toEqual({
      status: 400,
      code: "LAST_PLATFORM_ADMIN",
      message: "x",
    });
    expect(apiErrorParts(new Error("boom"))).toEqual({ status: null, code: null, message: "boom" });
    expect(apiErrorParts(null)).toEqual({ status: null, code: null, message: null });
  });
});

describe("display helpers", () => {
  it("shows the institution name in the page language", () => {
    expect(orgNames({ name: "مستشفى الملك فهد", nameEn: "King Fahd Hospital" }, "ar")).toEqual({
      primary: "مستشفى الملك فهد",
      secondary: "King Fahd Hospital",
    });
    expect(orgNames({ name: "مستشفى الملك فهد", nameEn: "King Fahd Hospital" }, "en")).toEqual({
      primary: "King Fahd Hospital",
      secondary: "مستشفى الملك فهد",
    });
    expect(orgNames({ name: "مستشفى", nameEn: null }, "en")).toEqual({ primary: "مستشفى", secondary: null });
  });

  it("makes initials", () => {
    expect(initialsOf("Huda Al Harbi")).toBe("HH");
    expect(initialsOf("نورة")).toBe("نو");
    expect(initialsOf("نورة القحطاني")).toBe("نق");
    expect(initialsOf("   ")).toBe("?");
  });

  it("finds the active admin section", () => {
    expect(activeAdminSection("/admin")).toBe("/admin");
    expect(activeAdminSection("/admin/")).toBe("/admin");
    expect(activeAdminSection("/admin/users/abc")).toBe("/admin/users");
    expect(activeAdminSection("/admin/organizations/new")).toBe("/admin/organizations");
    expect(activeAdminSection("/admin/usersx")).toBeNull();
    expect(activeAdminSection("/admin/impersonation")).toBeNull();
  });
});

describe("audit row labels", () => {
  it("maps the stored platform role to a common.roles key (never shows the raw code when it is known)", () => {
    expect(auditActorRoleKey("admin")).toBe("platformAdmin");
    expect(auditActorRoleKey("user,admin")).toBe("platformAdmin");
    expect(auditActorRoleKey("user")).toBe("user");
    expect(auditActorRoleKey(" user ")).toBe("user");
    expect(auditActorRoleKey("auditor")).toBeNull();
    expect(auditActorRoleKey("")).toBeNull();
    expect(auditActorRoleKey(null)).toBeNull();
  });

  it("labels every known target type, so the overview never shows a raw code like 'setting'", () => {
    for (const type of ["user", "organization", "setting", "scan", "simulation_attempt"]) {
      const key = auditTargetTypeKey(type);
      expect(key).toBe(type);
      expect((en.audit.targetTypes as Record<string, string>)[type]).toBeTruthy();
    }
    expect(auditTargetTypeKey("something_new")).toBeNull();
  });
});
