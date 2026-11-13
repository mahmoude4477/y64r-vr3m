// Better Auth's error texts in Arabic and English, and the errors lib/auth.ts throws from `hooks.before`.
// CLI-safe (no "server-only"): lib/auth.ts imports it and the `auth` CLI loads lib/auth.ts in plain Node.
//
// Why the hook errors are translated here (final review, 2026-10-29): @better-auth/i18n translates only in an AFTER
// hook, and Better Auth runs no after hook when a before hook throws (better-auth api/dispatch: runBeforeHooks
// rethrows, the endpoint and runAfterHooks never run). So ROLE_NOT_ALLOWED, ACCOUNT_LOCK_BUSY, MUST_CHANGE_PASSWORD,
// … reached Arabic users in English. hookError() picks the text the way the plugin is configured in lib/auth.ts.
import { locales } from "@better-auth/i18n";
import { APIError } from "better-auth/api";
import { accountErrorsAr } from "@/lib/account/errors-ar";
import { authErrorsAr } from "@/lib/auth-errors-ar";
import { localeFromHeaders, type RequestLocale } from "@/lib/request-locale";

/** The i18n plugin's dictionaries (lib/auth.ts `i18n({ translations })`). English falls back to the thrown text. */
export const AUTH_TRANSLATIONS: Record<RequestLocale, Record<string, string>> = {
  ar: { ...locales.ar, ...authErrorsAr, ...accountErrorsAr },
  en: { ...locales.en },
};

/**
 * The locale of a before-hook error, with the plugin's detection (`detection: ["session", "callback"]`,
 * `defaultLocale: "ar"`): the signed-in user's saved locale, else the page the request came from (same-origin
 * Referer), else Arabic. Never Accept-Language (crosscheck C5).
 */
export function hookLocale(userLocale: unknown, headers: Headers | null | undefined): RequestLocale {
  if (userLocale === "ar" || userLocale === "en") return userLocale;
  return localeFromHeaders(headers) ?? "ar";
}

type Status = ConstructorParameters<typeof APIError>[0];

/**
 * An APIError for `hooks.before`, already in the caller's language: `{ code, message, originalMessage }`, the same
 * body the i18n plugin produces for endpoint errors. `english` is used when the locale has no text for `code`.
 */
export function hookError(status: Status, code: string, english: string, locale: RequestLocale): APIError {
  const message = AUTH_TRANSLATIONS[locale][code] ?? english;
  return new APIError(status, { code, message, originalMessage: english });
}
