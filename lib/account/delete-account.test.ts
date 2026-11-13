import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The order of the "delete my account" server actions: blockers before any code is sent, the code before the
// password, the blockers again and the delete UNDER the account lock, and the error codes the settings UI relies on.

const s = vi.hoisted(() => ({
  session: { impersonatedBy: null as string | null },
  blockers: [] as Array<{ kind: string }>,
  emailEnabled: true,
  rateLimitOk: true,
  hasPassword: true,
  code: "ok" as "ok" | "invalid" | "expired" | "too_many",
  failure: "invalid" as "invalid" | "too_many" | "expired",
  sendOk: true,
  locked: false,
  deleteCalls: [] as Array<{ body: unknown; locked: boolean }>,
  deleteError: null as unknown,
  sent: 0,
  audit: [] as string[],
}));

vi.mock("next-intl", () => ({ hasLocale: (locales: readonly string[], l: unknown) => locales.includes(l as string) }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => `[${key}]` }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("@/i18n/routing", () => ({ routing: { locales: ["ar", "en"], defaultLocale: "ar" } }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ user: { id: "u-1", email: "me@example.com" }, session: s.session }),
}));
vi.mock("@/lib/account/deletion-rules", () => ({ deletionBlockers: async () => s.blockers }));
vi.mock("@/lib/account/deletion", () => ({
  hasPasswordAccount: async () => s.hasPassword,
  blockerViews: async (b: Array<{ kind: string }>) => b.map((x) => ({ kind: x.kind, message: `[blocked:${x.kind}]` })),
}));
vi.mock("@/lib/account/deletion-code", () => ({
  DELETION_CODE_TTL_SECONDS: 600,
  checkDeletionCode: async () => s.code,
  recordDeletionFailure: async () => s.failure,
  sendNewDeletionCode: async (_: string, deliver: (code: string) => Promise<{ ok: boolean }>) => deliver("123456"),
}));
vi.mock("@/lib/account/deletion-lock", () => ({
  withAccountLock: async <T,>(fn: () => Promise<T>) => {
    s.locked = true;
    try {
      return await fn();
    } finally {
      s.locked = false;
    }
  },
}));
vi.mock("@/lib/app-rate-limit", () => ({ takeAppRateLimit: async () => s.rateLimitOk }));
vi.mock("@/lib/audit", () => ({ writeAudit: async (_: unknown, action: string) => void s.audit.push(action) }));
vi.mock("@/lib/email", () => ({ isEmailEnabled: () => s.emailEnabled }));
vi.mock("@/lib/email/auth-mail", () => ({
  deliverAccountDeletionCode: async () => {
    s.sent += 1;
    return s.sendOk ? { ok: true } : { ok: false, reason: "failed" };
  },
}));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/zod-i18n", () => ({ zodErrorMap: () => () => undefined }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      deleteUser: async ({ body }: { body: unknown }) => {
        s.deleteCalls.push({ body, locked: s.locked });
        if (s.deleteError) throw s.deleteError;
        return { success: true };
      },
    },
  },
}));

const { requestAccountDeletion, confirmAccountDeletion } = await import("./delete-account");

beforeEach(() => {
  Object.assign(s, {
    session: { impersonatedBy: null },
    blockers: [],
    emailEnabled: true,
    rateLimitOk: true,
    hasPassword: true,
    code: "ok",
    failure: "invalid",
    sendOk: true,
    locked: false,
    deleteCalls: [],
    deleteError: null,
    sent: 0,
    audit: [],
  });
});

describe("requestAccountDeletion", () => {
  it("e-mails a code and audits the request", async () => {
    expect(await requestAccountDeletion("ar")).toEqual({ ok: true, minutes: 10 });
    expect(s.sent).toBe(1);
    expect(s.audit).toEqual(["account.delete.request"]);
  });

  it("sends nothing to a blocked account, while impersonating, with e-mail off or over the limit", async () => {
    s.blockers = [{ kind: "only_owner" }];
    expect(await requestAccountDeletion("ar")).toMatchObject({ ok: false, error: "blocked", message: "[blocked:only_owner]" });
    s.blockers = [];
    s.session = { impersonatedBy: "admin-1" };
    expect(await requestAccountDeletion("ar")).toMatchObject({ ok: false, error: "impersonating" });
    s.session = { impersonatedBy: null };
    s.emailEnabled = false;
    expect(await requestAccountDeletion("en")).toMatchObject({ ok: false, error: "email_off" });
    s.emailEnabled = true;
    s.rateLimitOk = false;
    expect(await requestAccountDeletion("en")).toMatchObject({ ok: false, error: "too_many_requests" });
    expect(s.sent).toBe(0);
  });

  it("reports a failed send (the earlier code stays valid, see deletion-code)", async () => {
    s.sendOk = false;
    expect(await requestAccountDeletion("ar")).toMatchObject({ ok: false, error: "email_failed" });
    expect(s.audit).toEqual([]);
  });

  it("refuses an unknown locale", async () => {
    expect(await requestAccountDeletion("fr")).toMatchObject({ ok: false, error: "bad_locale" });
  });
});

describe("confirmAccountDeletion", () => {
  it("deletes with the password, under the account lock, then redirects to account-deleted on the server", async () => {
    await expect(confirmAccountDeletion("en", { code: "123 456", password: "secret-password" })).rejects.toThrow(
      "NEXT_REDIRECT:/en/account-deleted",
    );
    expect(s.deleteCalls).toEqual([{ body: { password: "secret-password" }, locked: true }]);
  });

  it("checks the code before the password: a wrong or used-up code never reaches the delete", async () => {
    for (const [code, error] of [
      ["invalid", "invalid_code"],
      ["expired", "expired"],
      ["too_many", "too_many_tries"],
    ] as const) {
      s.code = code;
      expect(await confirmAccountDeletion("ar", { code: "000000", password: "x" })).toMatchObject({ ok: false, error });
    }
    expect(s.deleteCalls).toEqual([]);
  });

  it("asks for the password when the account has one, and validates the code format", async () => {
    expect(await confirmAccountDeletion("ar", { code: "123456" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(await confirmAccountDeletion("ar", { code: "12ab", password: "x" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(s.deleteCalls).toEqual([]);
  });

  it("a wrong password uses up one try of the code", async () => {
    s.deleteError = APIError.from("BAD_REQUEST", { message: "Invalid password", code: "INVALID_PASSWORD" });
    expect(await confirmAccountDeletion("ar", { code: "123456", password: "wrong" })).toMatchObject({ ok: false, error: "invalid_password" });
    s.failure = "too_many";
    expect(await confirmAccountDeletion("ar", { code: "123456", password: "wrong" })).toMatchObject({ ok: false, error: "too_many_tries" });
  });

  it("a blocker that appeared after the code was sent stops the delete", async () => {
    s.blockers = [{ kind: "last_platform_admin" }];
    expect(await confirmAccountDeletion("ar", { code: "123456", password: "x" })).toMatchObject({ ok: false, error: "blocked" });
    expect(s.deleteCalls).toEqual([]);
  });

  it("is refused while a platform admin acts as the user, and over the confirm limit", async () => {
    s.session = { impersonatedBy: "admin-1" };
    expect(await confirmAccountDeletion("ar", { code: "123456", password: "x" })).toMatchObject({ ok: false, error: "impersonating" });
    s.session = { impersonatedBy: null };
    s.rateLimitOk = false;
    expect(await confirmAccountDeletion("ar", { code: "123456", password: "x" })).toMatchObject({ ok: false, error: "too_many_attempts" });
    expect(s.deleteCalls).toEqual([]);
  });

  it("maps an unexpected failure to `failed` without throwing", async () => {
    s.deleteError = new Error("database down");
    expect(await confirmAccountDeletion("ar", { code: "123456", password: "x" })).toMatchObject({ ok: false, error: "failed" });
  });
});
