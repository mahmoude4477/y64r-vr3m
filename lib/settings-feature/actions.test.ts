import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The /settings Server Actions: input checked before anything happens, writes go through Better Auth's endpoints for
// the signed-in user only, the session token never comes from the client, an admin acting as the user cannot sign
// the user's devices out, and every failure has a stable code and a translated message.

const s = vi.hoisted(() => ({
  session: { id: "s-current", impersonatedBy: null as string | null },
  userLocale: "ar" as string | null,
  rateLimitOk: true,
  rateKeys: [] as string[],
  sessionRow: { token: "other-token" } as { token: string } | null,
  sessionWhere: [] as unknown[],
  otherCount: 2,
  apiCalls: [] as Array<{ name: string; body?: unknown }>,
  apiError: null as unknown,
  audit: [] as Array<{ action: string; target: unknown; meta?: unknown }>,
  refreshed: 0,
}));

vi.mock("next-intl", () => ({ hasLocale: (locales: readonly string[], l: unknown) => locales.includes(l as string) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string) => `[${namespace}.${key}]`,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "better-auth.session_token=current" }) }));
vi.mock("next/cache", () => ({ refresh: () => void (s.refreshed += 1) }));
vi.mock("@/i18n/routing", () => ({ routing: { locales: ["ar", "en"], defaultLocale: "ar" } }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ user: { id: "u-1", email: "me@example.com", locale: s.userLocale }, session: s.session }),
}));
vi.mock("@/lib/app-rate-limit", () => ({
  takeAppRateLimit: async (key: string) => (s.rateKeys.push(key), s.rateLimitOk),
}));
vi.mock("@/lib/audit", () => ({
  writeAudit: async (_ctx: unknown, action: string, target: unknown, meta?: unknown) => void s.audit.push({ action, target, meta }),
}));
vi.mock("@/lib/log", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/zod-i18n", () => ({ zodErrorMap: () => () => "[invalid]" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findFirst: async (args: { where: unknown }) => (s.sessionWhere.push(args.where), s.sessionRow),
      count: async () => s.otherCount,
    },
  },
}));
function api(name: string) {
  return async ({ body }: { body?: unknown } = {}) => {
    s.apiCalls.push({ name, body });
    if (s.apiError) throw s.apiError;
    return { status: true };
  };
}
vi.mock("@/lib/auth", () => ({
  auth: { api: { updateUser: api("updateUser"), revokeSession: api("revokeSession"), revokeOtherSessions: api("revokeOtherSessions") } },
}));

const { updateProfile, saveLocalePreference, revokeSession, revokeOtherSessions } = await import("./actions");

beforeEach(() => {
  Object.assign(s, {
    session: { id: "s-current", impersonatedBy: null },
    userLocale: "ar",
    rateLimitOk: true,
    rateKeys: [],
    sessionRow: { token: "other-token" },
    sessionWhere: [],
    otherCount: 2,
    apiCalls: [],
    apiError: null,
    audit: [],
    refreshed: 0,
  });
});

describe("updateProfile", () => {
  it("saves the trimmed name and profession through update-user and refreshes", async () => {
    expect(await updateProfile("en", { name: "  Sara  ", profession: " Nurse " })).toEqual({ ok: true });
    expect(s.apiCalls).toEqual([{ name: "updateUser", body: { name: "Sara", profession: "Nurse" } }]);
    expect(s.rateKeys).toEqual(["settings-profile:u-1"]);
    expect(s.refreshed).toBe(1);
  });

  it("stores an empty profession as null", async () => {
    await updateProfile("ar", { name: "سارة", profession: "  " });
    expect(s.apiCalls[0].body).toEqual({ name: "سارة", profession: null });
  });

  it("returns field errors and writes nothing for invalid input", async () => {
    const result = await updateProfile("ar", { name: "", profession: "" });
    expect(result).toMatchObject({ ok: false, error: "invalid_input", message: "[settings.errors.invalidInput]" });
    expect(result.ok === false && result.fieldErrors?.name).toEqual(["[invalid]"]);
    expect(s.apiCalls).toEqual([]);
  });

  it("refuses an unknown locale before reading the session", async () => {
    expect(await updateProfile("fr", { name: "Sara", profession: "" })).toMatchObject({ ok: false, error: "bad_locale" });
    expect(s.rateKeys).toEqual([]);
  });

  it("stops at the rate limit", async () => {
    s.rateLimitOk = false;
    expect(await updateProfile("ar", { name: "Sara", profession: "" })).toMatchObject({ ok: false, error: "too_many_requests" });
    expect(s.apiCalls).toEqual([]);
  });

  it("maps Better Auth failures", async () => {
    s.apiError = new APIError("UNAUTHORIZED", { message: "Unauthorized" });
    expect(await updateProfile("ar", { name: "Sara", profession: "" })).toMatchObject({ ok: false, error: "session_expired" });
    s.apiError = new Error("db down");
    expect(await updateProfile("ar", { name: "Sara", profession: "" })).toMatchObject({ ok: false, error: "failed", message: "[settings.errors.generic]" });
    expect(s.refreshed).toBe(0);
  });
});

describe("saveLocalePreference", () => {
  it("saves a new language without refreshing when the page then loads in that language", async () => {
    expect(await saveLocalePreference("ar", { locale: "en" })).toEqual({ ok: true });
    expect(s.apiCalls).toEqual([{ name: "updateUser", body: { locale: "en" } }]);
    expect(s.refreshed).toBe(0);
  });

  it("refreshes when the saved language is the page's language", async () => {
    s.userLocale = "en";
    expect(await saveLocalePreference("ar", { locale: "ar" })).toEqual({ ok: true });
    expect(s.apiCalls).toHaveLength(1);
    expect(s.refreshed).toBe(1);
  });

  it("does not write when nothing changes", async () => {
    expect(await saveLocalePreference("ar", { locale: "ar" })).toEqual({ ok: true });
    expect(s.apiCalls).toEqual([]);
    expect(s.rateKeys).toEqual([]);
  });

  it("refuses a language the app does not have", async () => {
    expect(await saveLocalePreference("ar", { locale: "fr" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(s.apiCalls).toEqual([]);
  });
});

describe("revokeSession", () => {
  it("looks the token up for the signed-in user only and revokes it", async () => {
    expect(await revokeSession("ar", { sessionId: "s-2" })).toEqual({ ok: true });
    expect(s.sessionWhere).toEqual([{ id: "s-2", userId: "u-1" }]);
    expect(s.apiCalls).toEqual([{ name: "revokeSession", body: { token: "other-token" } }]);
    expect(s.audit).toEqual([{ action: "account.session.revoke", target: { type: "session", id: "s-2" }, meta: undefined }]);
    expect(s.refreshed).toBe(1);
  });

  it("answers not found for a session of someone else (or one that ended)", async () => {
    s.sessionRow = null;
    expect(await revokeSession("ar", { sessionId: "s-foreign" })).toMatchObject({ ok: false, error: "session_not_found" });
    expect(s.apiCalls).toEqual([]);
    expect(s.audit).toEqual([]);
  });

  it("does not revoke the current session (that is signing out)", async () => {
    expect(await revokeSession("ar", { sessionId: "s-current" })).toMatchObject({ ok: false, error: "current_session" });
    expect(s.sessionWhere).toEqual([]);
  });

  it("refuses while a platform admin acts as the user", async () => {
    s.session = { id: "s-current", impersonatedBy: "admin-1" };
    expect(await revokeSession("ar", { sessionId: "s-2" })).toMatchObject({ ok: false, error: "impersonating" });
    expect(s.apiCalls).toEqual([]);
  });

  it("refuses malformed input", async () => {
    expect(await revokeSession("ar", { sessionId: "" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(await revokeSession("ar", "s-2")).toMatchObject({ ok: false, error: "invalid_input" });
  });
});

describe("revokeOtherSessions", () => {
  it("revokes the other sessions, audits the count and refreshes", async () => {
    expect(await revokeOtherSessions("en")).toEqual({ ok: true, count: 2 });
    expect(s.apiCalls).toEqual([{ name: "revokeOtherSessions", body: undefined }]);
    expect(s.audit).toEqual([{ action: "account.sessions.revoke_others", target: { type: "user", id: "u-1" }, meta: { count: 2 } }]);
    expect(s.refreshed).toBe(1);
  });

  it("writes no audit row when there was nothing to sign out", async () => {
    s.otherCount = 0;
    expect(await revokeOtherSessions("ar")).toEqual({ ok: true, count: 0 });
    expect(s.audit).toEqual([]);
  });

  it("refuses while a platform admin acts as the user", async () => {
    s.session = { id: "s-current", impersonatedBy: "admin-1" };
    expect(await revokeOtherSessions("ar")).toMatchObject({ ok: false, error: "impersonating", message: "[settings.errors.impersonating]" });
    expect(s.apiCalls).toEqual([]);
  });

  it("stops at the rate limit and reports Better Auth failures", async () => {
    s.rateLimitOk = false;
    expect(await revokeOtherSessions("ar")).toMatchObject({ ok: false, error: "too_many_requests" });
    s.rateLimitOk = true;
    s.apiError = new Error("boom");
    expect(await revokeOtherSessions("ar")).toMatchObject({ ok: false, error: "failed" });
    expect(s.audit).toEqual([]);
  });
});
