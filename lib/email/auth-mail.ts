/**
 * Glue between Better Auth callbacks / account actions and the email library: recipient locale, per-address send
 * limit, template choice. Better Auth's sends are fire-and-forget (avoids timing attacks); failures are logged with
 * provider + status only. No `server-only`: lib/auth.ts (loaded by the `auth` CLI) imports this file.
 */
import { emailKey, takeAppRateLimit } from "@/lib/app-rate-limit";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { localeFromHeaders } from "@/lib/request-locale";
import { type SendResult, sendEmail } from "./index";
import {
  type EmailLocale,
  renderAccountDeletedEmail,
  renderAccountDeletionCodeEmail,
  renderInvitationEmail,
  renderPasswordResetOtpEmail,
  renderVerificationOtpEmail,
} from "./templates";

export const OTP_EXPIRES_SECONDS = 10 * 60;
export const INVITATION_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

const PER_ADDRESS_WINDOW_SECONDS = 15 * 60;
const PER_ADDRESS_MAX = 6;

/**
 * Per-address limit (6 per 15 min) in app_rate_limit under a hashed key ("email-send:<sha256>", no address stored).
 * It used to live in Better Auth's rateLimit table, which deletes every row older than its longest window (60 s),
 * so the 15-minute window never held (note 08 F2). Fails open: auth must not stop because the table is unavailable.
 */
export async function allowSendTo(address: string): Promise<boolean> {
  try {
    return await takeAppRateLimit(emailKey("email-send", address), PER_ADDRESS_MAX, PER_ADDRESS_WINDOW_SECONDS);
  } catch (err) {
    log.warn("ratelimit.unavailable", { limiter: "email-send", err });
    return true; // never block auth because the limiter table is unavailable
  }
}

const isEmailLocale = (v: unknown): v is EmailLocale => v === "ar" || v === "en";

async function recipientLocale(email: string, headers?: Headers | null): Promise<EmailLocale> {
  const user = await prisma.user
    .findUnique({ where: { email: email.toLowerCase() }, select: { locale: true } })
    .catch(() => null);
  if (user?.locale === "ar" || user?.locale === "en") return user.locale;
  return localeFromHeaders(headers) ?? "ar";
}

export type OtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

export async function deliverOtpEmail(input: { email: string; otp: string; type: OtpType; headers?: Headers | null }) {
  // Only verification and password reset codes are used by Waqaya (sign-in by OTP is disabled).
  if (input.type !== "email-verification" && input.type !== "forget-password") return;
  if (!(await allowSendTo(input.email))) {
    log.warn("email.limit_reached", { kind: input.type });
    return;
  }
  const locale = await recipientLocale(input.email, input.headers);
  const minutes = Math.round(OTP_EXPIRES_SECONDS / 60);
  const rendered =
    input.type === "email-verification"
      ? renderVerificationOtpEmail({ locale, code: input.otp, minutes })
      : renderPasswordResetOtpEmail({ locale, code: input.otp, minutes });
  await sendEmail({ to: input.email, ...rendered, devPreview: `${input.type} code ${input.otp}` });
}

export async function deliverInvitationEmail(input: {
  invitationId: string;
  email: string;
  role: string;
  organizationName: string;
  inviterName: string;
  headers?: Headers | null;
}) {
  if (!(await allowSendTo(input.email))) {
    log.warn("email.limit_reached", { kind: "invitation" });
    return;
  }
  const locale = await recipientLocale(input.email, input.headers);
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const url = `${base}/${locale}/invite/${encodeURIComponent(input.invitationId)}`;
  const rendered = renderInvitationEmail({
    locale,
    inviterName: input.inviterName,
    organizationName: input.organizationName,
    role: input.role,
    url,
    days: Math.round(INVITATION_EXPIRES_SECONDS / 86400),
  });
  await sendEmail({ to: input.email, ...rendered, devPreview: `invitation link ${url}` });
}

/**
 * Account deletion code (lib/account/delete-account.ts). Awaited by the caller, unlike Better Auth's OTP mails:
 * the user is signed in (nothing to enumerate) and the page must know whether the code went out.
 */
export async function deliverAccountDeletionCode(input: { email: string; locale: EmailLocale; code: string; minutes: number }): Promise<SendResult> {
  if (!(await allowSendTo(input.email))) {
    log.warn("email.limit_reached", { kind: "account-delete" });
    return { ok: false, reason: "failed" };
  }
  const rendered = renderAccountDeletionCodeEmail({ locale: input.locale, code: input.code, minutes: input.minutes });
  return sendEmail({ to: input.email, ...rendered, devPreview: `account-delete code ${input.code}` });
}

/**
 * "Your account was deleted" (lib/auth.ts afterDelete). No per-address limit on purpose: the purge has just removed
 * that row, and taking the limit would write a new one for an account that no longer exists. Deletions themselves
 * are limited (one per account, codes 3 per hour).
 */
export async function deliverAccountDeletedEmail(input: { email: string; locale?: unknown; date?: Date }) {
  const locale = isEmailLocale(input.locale) ? input.locale : "ar";
  const rendered = renderAccountDeletedEmail({ locale, date: input.date ?? new Date() });
  await sendEmail({ to: input.email, ...rendered, devPreview: "account-deleted" });
}

/** Run a send without awaiting it in the request path; errors are already swallowed by sendEmail. */
export function fireAndForget(task: Promise<unknown>) {
  task.catch((err: unknown) => log.error("email.background_failed", { err }));
}
