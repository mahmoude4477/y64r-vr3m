import { existsSync, readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { recipientHash } from "../../lib/email";
import { EMAIL_FILE_SINK } from "./env";

// Reads the e2e e-mail sink (lib/email EMAIL_PROVIDER=file, note 09 §3.4). The server appends one JSON line per
// message: { at, toHash, subject, preview }. No address is stored, only the same sha256 the tests compute.
// The sink is refused outside a local/CI e2e run (WAQAYA_E2E=1, loopback http BETTER_AUTH_URL, no RAILWAY_* ids),
// so production can never write codes to a file. Sends are fire-and-forget: poll.

type Mail = { at: number; toHash: string; subject: string; preview: string | null };

function mails(): Mail[] {
  if (!existsSync(EMAIL_FILE_SINK)) return [];
  return readFileSync(EMAIL_FILE_SINK, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Mail);
}

/** The newest message for `email` sent at or after `since` (ms) whose preview matches `pattern`. Polls up to 15 s. */
export async function waitForMail(email: string, pattern: RegExp, since: number): Promise<RegExpExecArray> {
  const hash = recipientHash(email);
  let hit: RegExpExecArray | null = null;
  await expect
    .poll(
      () => {
        hit =
          mails()
            .filter((m) => m.toHash === hash && m.at >= since)
            .map((m) => pattern.exec(m.preview ?? ""))
            .filter((m): m is RegExpExecArray => m !== null)
            .at(-1) ?? null;
        return hit !== null;
      },
      { message: `no e-mail matching ${pattern} for this address (is the server running with EMAIL_PROVIDER=file?)`, timeout: 15_000, intervals: [100, 250, 500, 1000] },
    )
    .toBe(true);
  return hit!;
}

export type CodeKind = "email-verification" | "forget-password";

/** The 6-digit code of the newest verification / password-reset e-mail. */
export async function codeFor(email: string, kind: CodeKind, since: number): Promise<string> {
  return (await waitForMail(email, new RegExp(`^${kind} code (\\d{6})$`), since))[1];
}

/** The invitation link of the newest invitation e-mail. */
export async function inviteLinkFor(email: string, since: number): Promise<string> {
  return (await waitForMail(email, /^invitation link (\S+)$/, since))[1];
}

/** The 6-digit code of the newest "delete my account" e-mail (lib/account/delete-account.ts). */
export async function deletionCodeFor(email: string, since: number): Promise<string> {
  return (await waitForMail(email, /^account-delete code (\d{6})$/, since))[1];
}
