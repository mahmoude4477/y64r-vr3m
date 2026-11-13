import "server-only";
import { isAPIError } from "better-auth/api";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import type { AppLocale } from "@/i18n/routing";
import { type AdminErrorKey, adminErrorKeyForCode, apiErrorParts } from "@/lib/admin/errors";
import { log } from "@/lib/log";

// Shared result shape and error translation of the admin Server Actions (lib/admin/*-actions.ts).

export type ActionFailure = { ok: false; error: AdminErrorKey | "bad_locale"; message: string };
export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionFailure;

export const badLocale = (): ActionFailure => ({ ok: false, error: "bad_locale", message: "Bad locale" });

export async function failure(locale: AppLocale, key: AdminErrorKey): Promise<ActionFailure> {
  const t = await getTranslations({ locale, namespace: "admin.errors" });
  return { ok: false, error: key, message: t(key) };
}

/**
 * A Better Auth APIError (or anything else thrown by an auth.api call) as an action failure with the admin.errors
 * text for its code. Unknown codes get the generic text; the code is logged (never the message: it may echo input).
 */
export async function fromAuthError(locale: AppLocale, error: unknown, event: string): Promise<ActionFailure> {
  if (!isAPIError(error)) {
    log.error(event, { err: error });
    return failure(locale, "generic");
  }
  const { status, code } = apiErrorParts(error);
  const key = adminErrorKeyForCode(code) ?? (status === 429 ? "rateLimited" : null);
  if (key) return failure(locale, key);
  log.warn(event, { status, errorCode: code });
  return failure(locale, "generic");
}

export const DB_FAILED = Symbol("db_failed");

/**
 * Runs the database part of an action. An unexpected error (the database unreachable, a pool or transaction timeout)
 * is logged and comes back as DB_FAILED, so the action answers the generic failure instead of throwing (a thrown
 * action error reaches the browser as a broken request). Session checks (requirePlatformAdmin) stay outside: their
 * redirect / not-found must not be caught.
 */
export async function attempt<T>(event: string, fn: () => Promise<T>): Promise<T | typeof DB_FAILED> {
  try {
    return await fn();
  } catch (err) {
    log.error(event, { err });
    return DB_FAILED;
  }
}

/** Every admin page shows live data: drop the router cache of the whole /admin tree after a change. */
export function revalidateAdmin(locale: AppLocale) {
  revalidatePath(`/${locale}/admin`, "layout");
}
