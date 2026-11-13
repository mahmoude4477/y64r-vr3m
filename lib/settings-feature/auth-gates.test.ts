import { describe, expect, it } from "vitest";
import { sessionRevokeRefusal, updateUserRefusal } from "./auth-gates";

describe("updateUserRefusal (/update-user)", () => {
  it("accepts what the settings page and the header's language switch send", () => {
    expect(updateUserRefusal({ name: "هدى العتيبي", profession: "ممرضة" })).toBeNull();
    expect(updateUserRefusal({ name: "Huda", profession: null })).toBeNull();
    expect(updateUserRefusal({ locale: "en" })).toBeNull();
    expect(updateUserRefusal({ image: null })).toBeNull();
    expect(updateUserRefusal({})).toBeNull();
  });

  it("refuses names and professions the profile form refuses", () => {
    for (const name of ["", "   ", "x", "x".repeat(101), "a\u0007b", "nul\u0000l", 42]) {
      expect(updateUserRefusal({ name }), JSON.stringify(name)).toMatchObject({ status: "BAD_REQUEST", code: "INVALID_INPUT" });
    }
    expect(updateUserRefusal({ profession: "x".repeat(101) })).toMatchObject({ code: "INVALID_INPUT" });
    expect(updateUserRefusal({ profession: "\u001b[31m" })).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("checks the value as sent: padding that a trim would hide is refused (R2-SEC-1)", () => {
    const padded = [
      "ab" + " ".repeat(10_000),
      "ab" + "\u3000".repeat(10_000),
      "ab" + "\n".repeat(10_000),
      "ab" + "\u00a0".repeat(10_000),
      "\t" + "هدى",
      "هدى ",
    ];
    for (const value of padded) {
      const label = JSON.stringify(value.slice(0, 6));
      expect(updateUserRefusal({ name: value }), label).toMatchObject({ code: "INVALID_INPUT" });
      expect(updateUserRefusal({ profession: value }), label).toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(updateUserRefusal({ profession: " ".repeat(5000) })).toMatchObject({ code: "INVALID_INPUT" });
    expect(updateUserRefusal({ name: "x".repeat(100), profession: "y".repeat(100) })).toBeNull();
  });

  it("refuses a locale the app does not have, a picture URL and fields with their own endpoints", () => {
    expect(updateUserRefusal({ locale: "fr" })).toMatchObject({ code: "INVALID_INPUT" });
    expect(updateUserRefusal({ locale: null })).toMatchObject({ code: "INVALID_INPUT" });
    expect(updateUserRefusal({ image: "javascript:alert(1)" })).toMatchObject({ code: "FIELD_NOT_ALLOWED" });
    for (const field of ["email", "role", "mustChangePassword", "emailVerified", "banned"]) {
      expect(updateUserRefusal({ [field]: true })).toMatchObject({ code: "FIELD_NOT_ALLOWED" });
    }
  });
});

describe("sessionRevokeRefusal (signing sessions out while impersonating, SEC-4)", () => {
  it("refuses the three revoke endpoints in an impersonation session only", () => {
    for (const path of ["/revoke-session", "/revoke-sessions", "/revoke-other-sessions"]) {
      expect(sessionRevokeRefusal(path, { impersonatedBy: "admin-1" })).toEqual({
        status: "FORBIDDEN",
        code: "NOT_WHILE_IMPERSONATING",
        english: "Not while acting as another user",
      });
      expect(sessionRevokeRefusal(path, { impersonatedBy: null })).toBeNull();
      expect(sessionRevokeRefusal(path, {})).toBeNull();
    }
    expect(sessionRevokeRefusal("/sign-out", { impersonatedBy: "admin-1" })).toBeNull();
    expect(sessionRevokeRefusal("/admin/stop-impersonating", { impersonatedBy: "admin-1" })).toBeNull();
  });
});
