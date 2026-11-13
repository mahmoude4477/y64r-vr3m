"use server";

// Server Actions of /settings. Each one validates its input, takes the signed-in user from the session (requireUser:
// guests go to sign-in, mustChangePassword users to /settings/password), applies a per-user limit and then calls
// Better Auth's own endpoint on the server (auth.api.*), so Better Auth's hooks in lib/auth.ts apply. Server-side
// auth.api calls skip Better Auth's rate limiter (04 Gotcha 7), hence takeAppRateLimit. Every failure returns a
// stable `error` code and a `message` already translated into `locale`. Success refreshes the page in the same
// round trip (refresh()), so the header and the lists show the change.
import { APIError } from "better-auth/api";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import * as z from "zod";
import { type AppLocale, routing } from "@/i18n/routing";
import { takeAppRateLimit } from "@/lib/app-rate-limit";
import { writeAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { zodErrorMap } from "@/lib/zod-i18n";
import { SETTINGS_ERROR_KEY, type SettingsErrorCode, type SettingsFailure, type SettingsResult } from "./errors";
import { localePreferenceSchema, profileSchema, sessionIdSchema } from "./schemas";

/** Per user and kind of change, in a 10-minute window: generous for people, a stop for scripts. */
const LIMIT_WINDOW_SEC = 600;
const PROFILE_WRITES = 20;
const LOCALE_WRITES = 20;
const SESSION_REVOKES = 20;

export type RevokeOthersResult = { ok: true; count: number } | SettingsFailure;

async function fail(
  locale: AppLocale,
  error: SettingsErrorCode,
  fieldErrors?: SettingsFailure["fieldErrors"],
): Promise<SettingsFailure> {
  const t = await getTranslations({ locale, namespace: "settings.errors" });
  return { ok: false, error, message: t(SETTINGS_ERROR_KEY[error]), ...(fieldErrors ? { fieldErrors } : {}) };
}

/** A Better Auth answer -> our code: 401 = the session ended meanwhile, anything else = "try again". */
function codeOf(e: unknown): SettingsErrorCode {
  return e instanceof APIError && e.statusCode === 401 ? "session_expired" : "failed";
}

function localeOf(locale: string): AppLocale | null {
  return hasLocale(routing.locales, locale) ? locale : null;
}

/** Name and profession of the signed-in user (the e-mail address is not editable here). */
export async function updateProfile(locale: string, input: unknown): Promise<SettingsResult> {
  const l = localeOf(locale);
  if (!l) return fail(routing.defaultLocale, "bad_locale");
  const t = await getTranslations({ locale: l, namespace: "validation" });
  const parsed = profileSchema.safeParse(input, { error: zodErrorMap(t, l) });
  if (!parsed.success) return fail(l, "invalid_input", z.flattenError(parsed.error).fieldErrors);

  const ctx = await requireUser();
  if (!(await takeAppRateLimit(`settings-profile:${ctx.user.id}`, PROFILE_WRITES, LIMIT_WINDOW_SEC))) {
    return fail(l, "too_many_requests");
  }
  try {
    await auth.api.updateUser({
      headers: await headers(),
      body: { name: parsed.data.name, profession: parsed.data.profession || null },
    });
  } catch (e) {
    log.warn("settings.profile.update_failed", { err: e });
    return fail(l, codeOf(e));
  }
  refresh();
  return { ok: true };
}

/**
 * The saved language (user.locale: e-mails, Better Auth's error texts). `locale` is the page's language. When the
 * new language differs from it, the client then loads the page in the new language (a full page load, like the
 * header's LocaleSwitcher, CONVENTIONS 9), so nothing is refreshed here.
 */
export async function saveLocalePreference(locale: string, input: unknown): Promise<SettingsResult> {
  const l = localeOf(locale);
  if (!l) return fail(routing.defaultLocale, "bad_locale");
  const parsed = localePreferenceSchema.safeParse(input);
  if (!parsed.success) return fail(l, "invalid_input");

  const ctx = await requireUser();
  const next = parsed.data.locale;
  if (ctx.user.locale !== next) {
    if (!(await takeAppRateLimit(`settings-locale:${ctx.user.id}`, LOCALE_WRITES, LIMIT_WINDOW_SEC))) {
      return fail(l, "too_many_requests");
    }
    try {
      await auth.api.updateUser({ headers: await headers(), body: { locale: next } });
    } catch (e) {
      log.warn("settings.locale.update_failed", { err: e });
      return fail(l, codeOf(e));
    }
  }
  if (next === l) refresh();
  return { ok: true };
}

/** Signs one other session of the signed-in user out (by row id: the session token never reaches the browser). */
export async function revokeSession(locale: string, input: unknown): Promise<SettingsResult> {
  const l = localeOf(locale);
  if (!l) return fail(routing.defaultLocale, "bad_locale");
  const parsed = sessionIdSchema.safeParse(input);
  if (!parsed.success) return fail(l, "invalid_input");

  const ctx = await requireUser();
  // A platform admin acting as this user never signs the user's own devices out (the admin panel has its own,
  // audited, revoke).
  if (ctx.session.impersonatedBy) return fail(l, "impersonating");
  const { sessionId } = parsed.data;
  if (sessionId === ctx.session.id) return fail(l, "current_session");
  if (!(await takeAppRateLimit(`settings-sessions:${ctx.user.id}`, SESSION_REVOKES, LIMIT_WINDOW_SEC))) {
    return fail(l, "too_many_requests");
  }
  // Scoped to the signed-in user: another person's session id is "not found".
  const row = await prisma.session.findFirst({ where: { id: sessionId, userId: ctx.user.id }, select: { token: true } });
  if (!row) return fail(l, "session_not_found");
  try {
    await auth.api.revokeSession({ headers: await headers(), body: { token: row.token } });
  } catch (e) {
    log.warn("settings.session.revoke_failed", { err: e });
    return fail(l, codeOf(e));
  }
  await writeAudit(ctx, "account.session.revoke", { type: "session", id: sessionId });
  refresh();
  return { ok: true };
}

/** Signs every other session of the signed-in user out; the current one stays. */
export async function revokeOtherSessions(locale: string): Promise<RevokeOthersResult> {
  const l = localeOf(locale);
  if (!l) return fail(routing.defaultLocale, "bad_locale");

  const ctx = await requireUser();
  if (ctx.session.impersonatedBy) return fail(l, "impersonating");
  if (!(await takeAppRateLimit(`settings-sessions:${ctx.user.id}`, SESSION_REVOKES, LIMIT_WINDOW_SEC))) {
    return fail(l, "too_many_requests");
  }
  const count = await prisma.session.count({
    where: { userId: ctx.user.id, id: { not: ctx.session.id }, expiresAt: { gt: new Date() } },
  });
  try {
    await auth.api.revokeOtherSessions({ headers: await headers() });
  } catch (e) {
    log.warn("settings.sessions.revoke_others_failed", { err: e });
    return fail(l, codeOf(e));
  }
  if (count > 0) await writeAudit(ctx, "account.sessions.revoke_others", { type: "user", id: ctx.user.id }, { count });
  refresh();
  return { ok: true, count };
}
