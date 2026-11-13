import { describe, expect, it } from "vitest";
import { accountErrorsAr } from "@/lib/account/errors-ar";
import { authErrorsAr } from "@/lib/auth-errors-ar";
import { AUTH_TRANSLATIONS, hookError, hookLocale } from "./auth-hook-errors";

describe("errors thrown from Better Auth's before hook (no after hook translates them)", () => {
  it("picks the locale like the i18n plugin: the user's saved locale, then the page, then Arabic", () => {
    const fromEn = new Headers({ host: "waqaya.test", referer: "https://waqaya.test/en/admin/users" });
    expect(hookLocale("ar", fromEn)).toBe("ar"); // the saved locale wins over the page
    expect(hookLocale("en", null)).toBe("en");
    expect(hookLocale(null, fromEn)).toBe("en");
    expect(hookLocale("fr", fromEn)).toBe("en"); // not a site locale
    expect(hookLocale(undefined, new Headers({ host: "waqaya.test", referer: "https://evil.test/en/x" }))).toBe("ar");
    expect(hookLocale(undefined, undefined)).toBe("ar");
  });

  it("answers with the Arabic text for Arabic, the English text for English, and keeps the code", () => {
    const ar = hookError("BAD_REQUEST", "ROLE_NOT_ALLOWED", "Role not allowed", "ar");
    expect(ar.statusCode).toBe(400);
    expect(ar.body).toMatchObject({ code: "ROLE_NOT_ALLOWED", message: accountErrorsAr.ROLE_NOT_ALLOWED, originalMessage: "Role not allowed" });
    const en = hookError("BAD_REQUEST", "ROLE_NOT_ALLOWED", "Role not allowed", "en");
    expect(en.body).toMatchObject({ code: "ROLE_NOT_ALLOWED", message: "Role not allowed" });
    expect(hookError("SERVICE_UNAVAILABLE", "ACCOUNT_LOCK_BUSY", "Please try again in a moment", "ar").statusCode).toBe(503);
  });

  it("has Arabic for every code the hook throws", () => {
    for (const code of [
      "INVALID_OTP",
      "MUST_CHANGE_PASSWORD",
      "NOT_WHILE_IMPERSONATING",
      "ORGANIZATION_SUSPENDED",
      "FIELD_NOT_ALLOWED",
      "ROLE_NOT_ALLOWED",
      "ACCOUNT_LOCK_BUSY",
      "ACCOUNT_DELETION_BLOCKED",
      "LAST_PLATFORM_ADMIN",
    ]) {
      expect(AUTH_TRANSLATIONS.ar[code], code).toBeTruthy();
      expect(hookError("BAD_REQUEST", code, "english", "ar").message, code).not.toBe("english");
    }
    expect(AUTH_TRANSLATIONS.ar.INVALID_OTP).toBe(authErrorsAr.INVALID_OTP);
  });
});
