/**
 * Bilingual transactional email templates (recipient's locale). HTML + plain text, no tracking pixels,
 * no remote images. Strings live in messages/{ar,en}/email.json (+ common.roles for the invited role).
 */
import { createTranslator } from "next-intl";
import arCommon from "@/messages/ar/common.json";
import arEmail from "@/messages/ar/email.json";
import enCommon from "@/messages/en/common.json";
import enEmail from "@/messages/en/email.json";
import type { EmailMessage } from "./index";

export type EmailLocale = "ar" | "en";

const catalogs = {
  ar: { email: arEmail, common: arCommon },
  en: { email: enEmail, common: enCommon },
} as const;

function translator(locale: EmailLocale) {
  return createTranslator({ locale, messages: catalogs[locale], namespace: "email" });
}

function roleLabel(locale: EmailLocale, role: string): string {
  const roles = catalogs[locale].common.roles as Record<string, string>;
  return role
    .split(",")
    .map((r) => roles[r.trim()] ?? r.trim())
    .join("، ");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Block =
  | { kind: "p"; text: string; muted?: boolean }
  | { kind: "code"; code: string }
  | { kind: "button"; label: string; url: string }
  | { kind: "link"; url: string };

function layout(locale: EmailLocale, opts: { preheader: string; heading: string; blocks: Block[]; footer: string[] }) {
  const t = translator(locale);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  const font =
    locale === "ar"
      ? "'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif"
      : "'IBM Plex Sans', -apple-system, 'Segoe UI', Arial, sans-serif";

  const body = opts.blocks
    .map((b) => {
      switch (b.kind) {
        case "p":
          return `<p style="margin:0 0 16px;font-size:${b.muted ? 13 : 15}px;line-height:1.7;color:${b.muted ? "#5b6b73" : "#13242c"};">${escapeHtml(b.text)}</p>`;
        case "code":
          return `<p dir="ltr" style="margin:8px 0 20px;text-align:center;font-family:'Courier New',monospace;font-size:32px;letter-spacing:8px;font-weight:700;color:#0b5563;background:#e8f6f8;border-radius:10px;padding:14px 0;">${escapeHtml(b.code)}</p>`;
        case "button":
          return `<p style="margin:8px 0 20px;text-align:center;"><a href="${escapeHtml(b.url)}" style="display:inline-block;background:#0e6e7e;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">${escapeHtml(b.label)}</a></p>`;
        case "link":
          return `<p dir="ltr" style="margin:0 0 16px;font-size:12px;line-height:1.6;word-break:break-all;color:#0e6e7e;text-align:left;">${escapeHtml(b.url)}</p>`;
      }
    })
    .join("\n");

  const footer = opts.footer
    .map((line) => `<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#7a8a91;">${escapeHtml(line)}</p>`)
    .join("\n");

  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#f2f6f7;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:${font};text-align:${align};" dir="${dir}">
<tr><td style="background:#06141b;padding:18px 28px;"><span style="font-size:22px;font-weight:700;color:#5fd0e3;">${escapeHtml(t("brand"))}</span></td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.5;color:#13242c;">${escapeHtml(opts.heading)}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e3ecee;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function textVersion(lines: Array<string | undefined>): string {
  return lines.filter((l): l is string => l !== undefined).join("\n\n") + "\n";
}

type Rendered = Pick<EmailMessage, "subject" | "html" | "text">;

/** 6-digit sign-up verification code. */
export function renderVerificationOtpEmail(input: { locale: EmailLocale; code: string; minutes: number }): Rendered {
  const t = translator(input.locale);
  const subject = t("verification.subject", { code: input.code });
  const heading = t("verification.heading");
  const footer = [t("footer.ignore"), t("footer.automated")];
  return {
    subject,
    html: layout(input.locale, {
      preheader: t("verification.preheader"),
      heading,
      blocks: [
        { kind: "p", text: t("verification.intro") },
        { kind: "code", code: input.code },
        { kind: "p", text: t("verification.expires", { minutes: String(input.minutes) }), muted: true },
      ],
      footer,
    }),
    text: textVersion([
      heading,
      t("verification.intro"),
      input.code,
      t("verification.expires", { minutes: String(input.minutes) }),
      ...footer,
    ]),
  };
}

/** 6-digit password reset code. */
export function renderPasswordResetOtpEmail(input: { locale: EmailLocale; code: string; minutes: number }): Rendered {
  const t = translator(input.locale);
  const subject = t("passwordReset.subject", { code: input.code });
  const heading = t("passwordReset.heading");
  const footer = [t("footer.ignore"), t("footer.automated")];
  return {
    subject,
    html: layout(input.locale, {
      preheader: t("passwordReset.preheader"),
      heading,
      blocks: [
        { kind: "p", text: t("passwordReset.intro") },
        { kind: "code", code: input.code },
        { kind: "p", text: t("passwordReset.expires", { minutes: String(input.minutes) }), muted: true },
      ],
      footer,
    }),
    text: textVersion([
      heading,
      t("passwordReset.intro"),
      input.code,
      t("passwordReset.expires", { minutes: String(input.minutes) }),
      ...footer,
    ]),
  };
}

/** Organization invitation with an accept link (the copyable link in the app stays as a fallback). */
export function renderInvitationEmail(input: {
  locale: EmailLocale;
  inviterName: string;
  organizationName: string;
  role: string;
  url: string;
  days: number;
}): Rendered {
  const t = translator(input.locale);
  const args = {
    inviter: input.inviterName,
    organization: input.organizationName,
    role: roleLabel(input.locale, input.role),
  };
  const subject = t("invitation.subject", { organization: input.organizationName });
  const heading = t("invitation.heading");
  const footer = [t("footer.ignore"), t("footer.automated")];
  return {
    subject,
    html: layout(input.locale, {
      preheader: t("invitation.preheader", { inviter: args.inviter, organization: args.organization }),
      heading,
      blocks: [
        { kind: "p", text: t("invitation.intro", args) },
        { kind: "button", label: t("invitation.button"), url: input.url },
        { kind: "p", text: t("invitation.linkHint"), muted: true },
        { kind: "link", url: input.url },
        { kind: "p", text: t("invitation.expires", { days: String(input.days) }), muted: true },
      ],
      footer,
    }),
    text: textVersion([
      heading,
      t("invitation.intro", args),
      `${t("invitation.button")}: ${input.url}`,
      t("invitation.expires", { days: String(input.days) }),
      ...footer,
    ]),
  };
}

/** "28 October 2026, 3:15 PM" in the recipient's language, Riyadh time, Latin digits (CONVENTIONS 3). */
export function formatEmailDate(locale: EmailLocale, date: Date): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
  }).format(date);
}

/** 6-digit code that confirms deleting the account (lib/account/delete-account.ts). */
export function renderAccountDeletionCodeEmail(input: { locale: EmailLocale; code: string; minutes: number }): Rendered {
  const t = translator(input.locale);
  const subject = t("accountDeletion.subject", { code: input.code });
  const heading = t("accountDeletion.heading");
  const expires = t("accountDeletion.expires", { minutes: String(input.minutes) });
  const footer = [t("accountDeletion.notYou"), t("footer.automated")];
  return {
    subject,
    html: layout(input.locale, {
      preheader: t("accountDeletion.preheader"),
      heading,
      blocks: [
        { kind: "p", text: t("accountDeletion.intro") },
        { kind: "code", code: input.code },
        { kind: "p", text: t("accountDeletion.warning") },
        { kind: "p", text: expires, muted: true },
      ],
      footer,
    }),
    text: textVersion([heading, t("accountDeletion.intro"), input.code, t("accountDeletion.warning"), expires, ...footer]),
  };
}

/** Sent after the account is gone (lib/auth.ts user.deleteUser.afterDelete). */
export function renderAccountDeletedEmail(input: { locale: EmailLocale; date: Date }): Rendered {
  const t = translator(input.locale);
  const subject = t("accountDeleted.subject");
  const heading = t("accountDeleted.heading");
  const intro = t("accountDeleted.intro", { date: formatEmailDate(input.locale, input.date) });
  const footer = [t("accountDeleted.notYou"), t("footer.automated")];
  return {
    subject,
    html: layout(input.locale, {
      preheader: t("accountDeleted.preheader"),
      heading,
      blocks: [
        { kind: "p", text: intro },
        { kind: "p", text: t("accountDeleted.kept") },
      ],
      footer,
    }),
    text: textVersion([heading, intro, t("accountDeleted.kept"), ...footer]),
  };
}
