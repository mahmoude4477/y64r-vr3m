/**
 * Text for a Better Auth client error. The server's i18n plugin already translated `message` into the
 * page's language; only 429 has no code. Pass t = useTranslations("auth.errors").
 */
export type AuthClientError = { status: number; code?: string; message?: string; statusText?: string };

export function authErrorText(
  error: AuthClientError,
  t: (key: "rateLimited" | "generic") => string,
): string {
  // A 429 with a code (a future lockout, e.g. two-factor) keeps its own translated message (note 08 F8).
  if (error.status === 429 && !error.code) return t("rateLimited");
  return error.message || t("generic");
}
