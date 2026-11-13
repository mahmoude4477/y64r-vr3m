/**
 * Outgoing email (PRODUCT.md 6b).
 *
 * EMAIL_PROVIDER:
 *  - "cloudflare": Cloudflare Email Sending REST API (the app runs on Railway, so no Worker binding).
 *  - "console":    development only. Logs the subject and the OTP / link (`devPreview`), never the full
 *                  address. Refused when NODE_ENV=production.
 *  - "file":       end-to-end tests only (note 09 §3.4). Appends one JSON line per message to EMAIL_FILE_SINK:
 *                  { at, toHash (sha256 of the lower-cased address), subject, preview (`devPreview`) }. Refused
 *                  unless WAQAYA_E2E=1, BETTER_AUTH_URL is a loopback http:// origin and no RAILWAY_* id is set,
 *                  so a misconfigured production service gets "email off", never a file of codes.
 *  - unset / anything else: email is off. `isEmailEnabled()` is false and features show "email off".
 *
 * Errors carry provider + HTTP status only, never addresses, codes or tokens.
 * No `server-only` import: the Better Auth CLI loads lib/auth.ts (which imports this) in plain Node.
 */
import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { log } from "@/lib/log";

export type EmailProviderName = "cloudflare" | "console" | "file";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Console and file providers only: the OTP or link for development / e2e. Never sent or logged elsewhere. */
  devPreview?: string;
};

export interface EmailSender {
  readonly provider: EmailProviderName;
  send(message: EmailMessage): Promise<void>;
}

export class EmailError extends Error {
  readonly provider: EmailProviderName;
  readonly status: number | null;
  constructor(provider: EmailProviderName, status: number | null, reason: string) {
    super(`[email:${provider}] send failed (${status ?? "no status"}): ${reason}`);
    this.name = "EmailError";
    this.provider = provider;
    this.status = status;
  }
}

export const DEFAULT_EMAIL_FROM = "وقاية Waqaya <waqaya@tirazkit.com>";
export const EMAIL_TIMEOUT_MS = 15_000;

/** Parses `Name <address>` or a bare address. */
export function parseFrom(value: string): { address: string; name?: string } {
  const match = /^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(value);
  if (match) return match[1] ? { name: match[1].replace(/^"|"$/g, ""), address: match[2] } : { address: match[2] };
  return { address: value.trim() };
}

/** "user@example.com" -> "u***@e***.com" for development logs. */
export function maskAddress(address: string): string {
  const [user = "", domain = ""] = address.split("@");
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${user.slice(0, 1)}***@${host.slice(0, 1)}***${tld}`;
}

class CloudflareEmailSender implements EmailSender {
  readonly provider = "cloudflare" as const;
  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId)}/email/sending/send`;
    // REST payload differs from the Worker binding: `from.address` (not `email`), `reply_to` snake_case.
    const body: Record<string, unknown> = {
      to: message.to,
      from: parseFrom(this.from),
      subject: message.subject,
      html: message.html,
      text: message.text,
    };
    if (message.replyTo) body.reply_to = message.replyTo;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
      });
    } catch (e) {
      const timeout = e instanceof DOMException && e.name === "TimeoutError";
      throw new EmailError(this.provider, null, timeout ? "timeout" : "network error");
    }

    // Success: { success: true, result: { delivered: [], permanent_bounces: [], queued: [] } }
    // Error:   { success: false, errors: [{ code: number, message }] } with 400/401/429/500.
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      errors?: Array<{ code?: number }>;
      result?: { delivered?: string[]; permanent_bounces?: string[]; queued?: string[] } | null;
    } | null;
    if (!res.ok || !json?.success) {
      const codes = (json?.errors ?? []).map((e) => e.code).filter((c) => typeof c === "number");
      throw new EmailError(this.provider, res.status, codes.length ? `api error ${codes.join(",")}` : "api error");
    }
    if ((json.result?.permanent_bounces ?? []).length > 0) {
      throw new EmailError(this.provider, res.status, "permanent bounce");
    }
  }
}

class ConsoleEmailSender implements EmailSender {
  readonly provider = "console" as const;
  async send(message: EmailMessage): Promise<void> {
    console.info(
      `[email:console] to=${maskAddress(message.to)} subject="${message.subject}"` +
        (message.devPreview ? ` preview=${message.devPreview}` : ""),
    );
  }
}

/** sha256 of the trimmed, lower-cased address: how the file sink (and e2e/support/mail.ts) names a recipient. */
export function recipientHash(address: string): string {
  return createHash("sha256").update(address.trim().toLowerCase()).digest("hex");
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The e2e file sink: WAQAYA_E2E=1, never on Railway, only for a loopback http origin (note 09 §3.4). */
export function fileSinkAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (env.WAQAYA_E2E !== "1") return false;
  if (env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID || env.RAILWAY_ENVIRONMENT_NAME) {
    return false;
  }
  try {
    const url = new URL(env.BETTER_AUTH_URL ?? "");
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

class FileEmailSender implements EmailSender {
  readonly provider = "file" as const;
  constructor(private readonly path: string) {}
  async send(message: EmailMessage): Promise<void> {
    // No address in the file either: tests look mail up by the same hash of the lower-cased address.
    const line = JSON.stringify({
      at: Date.now(),
      toHash: recipientHash(message.to),
      subject: message.subject,
      preview: message.devPreview ?? null,
    });
    try {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${line}\n`, "utf8");
    } catch {
      throw new EmailError(this.provider, null, "file write failed");
    }
  }
}

let warned = false;
function warnOnce(msg: string) {
  if (warned) return;
  warned = true;
  log.warn("email.config", { detail: msg });
}

/** The configured sender, or null when email is off. Reads env on every call (cheap). */
export function getEmailSender(): EmailSender | null {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM;
  if (provider === "cloudflare") {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const token = process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim();
    if (!accountId || !token) {
      warnOnce("[email] EMAIL_PROVIDER=cloudflare but CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_EMAIL_API_TOKEN is missing: email is off");
      return null;
    }
    return new CloudflareEmailSender(accountId, token, from);
  }
  if (provider === "console") {
    if (process.env.NODE_ENV === "production") {
      warnOnce("[email] EMAIL_PROVIDER=console is refused in production: email is off");
      return null;
    }
    return new ConsoleEmailSender();
  }
  if (provider === "file") {
    const path = process.env.EMAIL_FILE_SINK?.trim();
    if (!path || !fileSinkAllowed()) {
      warnOnce("[email] EMAIL_PROVIDER=file is for local/CI end-to-end tests only (WAQAYA_E2E=1, loopback http origin, EMAIL_FILE_SINK): email is off");
      return null;
    }
    return new FileEmailSender(path);
  }
  return null;
}

export function isEmailEnabled(): boolean {
  return getEmailSender() !== null;
}

export type SendResult = { ok: true } | { ok: false; reason: "email_off" | "failed" };

/** Sends one message. Never throws: logs provider + status only and returns a result. */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const sender = getEmailSender();
  if (!sender) return { ok: false, reason: "email_off" };
  try {
    await sender.send(message);
    return { ok: true };
  } catch (e) {
    log.error("email.send_failed", {
      provider: sender.provider,
      status: e instanceof EmailError ? e.status : null,
      ...(e instanceof EmailError ? {} : { err: e }),
    });
    return { ok: false, reason: "failed" };
  }
}
