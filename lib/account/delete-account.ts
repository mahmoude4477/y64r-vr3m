"use server";

// "Delete my account" (PRODUCT 9, note 08 B1-B4). Two Server Actions for the settings team's UI:
//   1. requestAccountDeletion(locale)        -> e-mails a 6-digit code (10 min, 3 requests per hour)
//   2. confirmAccountDeletion(locale, input) -> code + password (when the account has one) -> account deleted, then
//      a server-side redirect to /<locale>/account-deleted (it never returns on success, see below)
// The real delete is auth.api.deleteUser (its HTTP path is disabled): Better Auth checks the password, runs the
// blockers again (beforeDelete), deletes sessions + accounts, runs the purge (lib/account/purge.ts), deletes the
// user, clears the cookies and writes the anonymous "account.delete" audit row (afterDelete).
// Every failure returns a stable `error` code plus `message`, already translated into `locale`.
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import * as z from "zod";
import { routing } from "@/i18n/routing";
import { checkDeletionCode, DELETION_CODE_TTL_SECONDS, recordDeletionFailure, sendNewDeletionCode } from "@/lib/account/deletion-code";
import { withAccountLock } from "@/lib/account/deletion-lock";
import { blockerViews, type DeletionBlockerView, hasPasswordAccount } from "@/lib/account/deletion";
import { deletionBlockers } from "@/lib/account/deletion-rules";
import { confirmDeletionSchema } from "@/lib/account/schemas";
import { takeAppRateLimit } from "@/lib/app-rate-limit";
import { writeAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { isEmailEnabled } from "@/lib/email";
import { deliverAccountDeletionCode } from "@/lib/email/auth-mail";
import { log } from "@/lib/log";
import { requireUser } from "@/lib/session";
import { zodErrorMap } from "@/lib/zod-i18n";

export type DeletionErrorCode =
  | "bad_locale"
  | "invalid_input"
  | "impersonating"
  | "blocked"
  | "email_off"
  | "email_failed"
  | "too_many_requests"
  | "too_many_attempts"
  | "expired"
  | "invalid_code"
  | "too_many_tries"
  | "invalid_password"
  | "session_expired"
  | "failed";

export type DeletionFailure = {
  ok: false;
  error: DeletionErrorCode;
  /** Translated into the locale the action was called with. */
  message: string;
  /** Set when error === "blocked". */
  blockers?: DeletionBlockerView[];
  /** Set when error === "invalid_input": translated messages per field. */
  fieldErrors?: { code?: string[]; password?: string[] };
};

export type RequestDeletionResult = { ok: true; minutes: number } | DeletionFailure;
/** Only failures come back: on success the action redirects (the client sees Next's redirect, not a result). */
export type ConfirmDeletionResult = DeletionFailure;

const REQUESTS_PER_HOUR = 3;
const CONFIRMS_PER_15_MIN = 10; // on top of 5 tries per code: caps password checks across codes

const MESSAGE_KEY = {
  bad_locale: "generic",
  invalid_input: "generic",
  impersonating: "impersonating",
  blocked: "blocked",
  email_off: "emailOff",
  email_failed: "emailFailed",
  too_many_requests: "tooManyRequests",
  too_many_attempts: "tooManyAttempts",
  expired: "expired",
  invalid_code: "invalidCode",
  too_many_tries: "tooManyTries",
  invalid_password: "invalidPassword",
  session_expired: "sessionExpired",
  failed: "generic",
} as const satisfies Record<DeletionErrorCode, string>;

async function fail(
  locale: (typeof routing.locales)[number],
  error: DeletionErrorCode,
  extra: Pick<DeletionFailure, "blockers" | "fieldErrors"> = {},
): Promise<DeletionFailure> {
  const t = await getTranslations({ locale, namespace: "auth.deleteAccount.errors" });
  const message = error === "blocked" && extra.blockers?.length ? extra.blockers.map((b) => b.message).join(" ") : t(MESSAGE_KEY[error]);
  return { ok: false, error, message, ...extra };
}

/** Step 1: e-mail a confirmation code to the signed-in user's address. */
export async function requestAccountDeletion(locale: string): Promise<RequestDeletionResult> {
  const l = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  if (l !== locale) return fail(l, "bad_locale");
  const ctx = await requireUser();
  if (ctx.session.impersonatedBy) return fail(l, "impersonating");

  const blockers = await deletionBlockers(ctx.user.id);
  if (blockers.length > 0) return fail(l, "blocked", { blockers: await blockerViews(blockers, l) });
  if (!isEmailEnabled()) return fail(l, "email_off");
  if (!(await takeAppRateLimit(`account-delete-request:${ctx.user.id}`, REQUESTS_PER_HOUR, 3600))) {
    return fail(l, "too_many_requests");
  }

  const minutes = DELETION_CODE_TTL_SECONDS / 60;
  // The new code replaces an earlier one only once the e-mail went out: a failed send keeps the earlier code valid.
  const sent = await sendNewDeletionCode(ctx.user.id, (code) =>
    deliverAccountDeletionCode({ email: ctx.user.email, locale: l, code, minutes }),
  );
  if (!sent.ok) return fail(l, sent.reason === "email_off" ? "email_off" : "email_failed");
  await writeAudit(ctx, "account.delete.request", { type: "user", id: ctx.user.id });
  return { ok: true, minutes };
}

/**
 * Step 2: the e-mailed code (+ the password when the account has one). On success the account is gone and the action
 * REDIRECTS to /<locale>/account-deleted on the server. Returning instead would not work: deleting the session
 * cookie makes Next re-render the current (signed-in) page in the same response, whose requireUser() would send the
 * browser to sign-in before the client could navigate.
 */
export async function confirmAccountDeletion(locale: string, input: unknown): Promise<ConfirmDeletionResult> {
  const l = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  if (l !== locale) return fail(l, "bad_locale");

  const tv = await getTranslations({ locale: l, namespace: "validation" });
  const parsed = confirmDeletionSchema.safeParse(input, { error: zodErrorMap(tv, l) });
  if (!parsed.success) return fail(l, "invalid_input", { fieldErrors: z.flattenError(parsed.error).fieldErrors });

  const ctx = await requireUser();
  if (ctx.session.impersonatedBy) return fail(l, "impersonating");
  const userId = ctx.user.id;

  const hasPassword = await hasPasswordAccount(userId);
  const password = parsed.data.password ?? "";
  if (hasPassword && password.length === 0) {
    return fail(l, "invalid_input", { fieldErrors: { password: [tv("required")] } });
  }
  // Server-side auth.api.* calls skip Better Auth's rate limiter (04 Gotcha 7): ours caps password checks.
  if (!(await takeAppRateLimit(`account-delete-confirm:${userId}`, CONFIRMS_PER_15_MIN, 15 * 60))) {
    return fail(l, "too_many_attempts");
  }

  const check = await checkDeletionCode(userId, parsed.data.code);
  if (check === "expired") return fail(l, "expired");
  if (check === "too_many") return fail(l, "too_many_tries");
  if (check === "invalid") return fail(l, "invalid_code");

  const requestHeaders = await headers();
  let outcome: "deleted" | DeletionFailure;
  try {
    // The blocker check and the delete run under the account lock (lib/account/deletion-lock.ts), so a co-owner or
    // the other platform admin cannot leave, be demoted or delete their own account in between.
    outcome = await withAccountLock(async (): Promise<"deleted" | DeletionFailure> => {
      // Things may have changed since the code was sent (beforeDelete checks again, authoritatively).
      const blockers = await deletionBlockers(userId);
      if (blockers.length > 0) return fail(l, "blocked", { blockers: await blockerViews(blockers, l) });
      try {
        await auth.api.deleteUser({ headers: requestHeaders, body: hasPassword ? { password } : {} });
        return "deleted";
      } catch (e) {
        if (!(e instanceof APIError)) throw e;
        const code = (e.body as { code?: string } | undefined)?.code;
        if (code === "INVALID_PASSWORD") {
          const r = await recordDeletionFailure(userId); // a wrong password also uses up one of the code's tries
          return fail(l, r === "invalid" ? "invalid_password" : r === "too_many" ? "too_many_tries" : "expired");
        }
        if (code === "SESSION_EXPIRED") return fail(l, "session_expired");
        if (code === "NOT_WHILE_IMPERSONATING") return fail(l, "impersonating");
        if (code === "ACCOUNT_DELETION_BLOCKED") {
          return fail(l, "blocked", { blockers: await blockerViews(await deletionBlockers(userId), l) });
        }
        log.error("account.delete.failed", { errorCode: code ?? null, status: e.status });
        return fail(l, "failed");
      }
    }, "account.delete");
  } catch (err) {
    // The lock could not be taken in time (another deletion was running) or the database failed.
    log.error("account.delete.failed", { err });
    return fail(l, "failed");
  }
  if (outcome !== "deleted") return outcome;
  redirect(`/${l}/account-deleted`); // outside every try/catch: it throws NEXT_REDIRECT
}
