import { beforeEach, describe, expect, it, vi } from "vitest";

// User actions of the admin panel with every dependency mocked (no database, no session, no Better Auth): ending one
// session must leave an audit row that names the account (review round 2, R2-1).

const ctx = { user: { id: "admin-1", email: "admin@example.test" }, session: { impersonatedBy: null } };
const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  revokeUserSession: vi.fn(),
  sessionFindFirst: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock("@/lib/auth", () => ({ auth: { api: { revokeUserSession: mocks.revokeUserSession } } }));
vi.mock("@/lib/prisma", () => ({ prisma: { session: { findFirst: mocks.sessionFindFirst } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => `t:${key}` }));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { revokeUserSessionAction } = await import("./user-actions");
const { authAuditEntry } = await import("@/lib/auth-hooks");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePlatformAdmin.mockResolvedValue(ctx);
  mocks.revokeUserSession.mockResolvedValue({ success: true });
});

describe("revokeUserSessionAction", () => {
  it("looks the session up within that account and sends its owner along with the token", async () => {
    mocks.sessionFindFirst.mockResolvedValue({ token: "tok-1" });
    const result = await revokeUserSessionAction("en", { userId: "u-7", sessionId: "s-3" });
    expect(result).toEqual({ ok: true });
    expect(mocks.sessionFindFirst).toHaveBeenCalledWith({ where: { id: "s-3", userId: "u-7" }, select: { token: true } });
    const body = mocks.revokeUserSession.mock.calls[0]?.[0]?.body;
    expect(body).toEqual({ sessionToken: "tok-1", userId: "u-7" });

    // The automatic audit row Better Auth's after hook writes for that call names the account, and never the token.
    const entry = authAuditEntry({
      path: "/admin/revoke-user-session",
      body,
      returned: { success: true },
      session: { user: { id: "admin-1" }, session: { impersonatedBy: null } },
    });
    expect(entry).toMatchObject({ action: "auth.admin.revoke-user-session", actorId: "admin-1", targetType: "user", targetId: "u-7" });
    expect(entry?.meta).toEqual({ userId: "u-7" });
    expect(JSON.stringify(entry)).not.toContain("tok-1");
  });

  it("ends nothing when the session is not that account's", async () => {
    mocks.sessionFindFirst.mockResolvedValue(null);
    const result = await revokeUserSessionAction("en", { userId: "u-7", sessionId: "s-other" });
    expect(result).toMatchObject({ ok: false, error: "notFound" });
    expect(mocks.revokeUserSession).not.toHaveBeenCalled();
  });

  it("never ends the admin's own sessions here", async () => {
    const result = await revokeUserSessionAction("en", { userId: "admin-1", sessionId: "s-1" });
    expect(result).toMatchObject({ ok: false, error: "self" });
    expect(mocks.sessionFindFirst).not.toHaveBeenCalled();
    expect(mocks.revokeUserSession).not.toHaveBeenCalled();
  });
});
