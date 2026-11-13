import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock("@/lib/session", () => ({ getAuthContext: async () => session.ctx }));

const { platformAdminOrNull } = await import("./authorize");

const user = (over: Record<string, unknown> = {}) => ({ id: "u", mustChangePassword: false, ...over });

describe("platformAdminOrNull", () => {
  it("lets a platform admin through", async () => {
    session.ctx = { user: user(), isPlatformAdmin: true, isContentEditor: true };
    expect(await platformAdminOrNull()).toBe(session.ctx);
  });

  it("lets a protocol editor through", async () => {
    session.ctx = { user: user(), isPlatformAdmin: false, isContentEditor: true };
    expect(await platformAdminOrNull()).toBe(session.ctx);
  });

  it("refuses guests, other users, institution admins and admins who must change their password", async () => {
    for (const ctx of [
      null,
      { user: user(), isPlatformAdmin: false, isContentEditor: false },
      { user: user(), isPlatformAdmin: false, isContentEditor: false, orgRole: "admin", organizationId: "org" },
      { user: user({ mustChangePassword: true }), isPlatformAdmin: true, isContentEditor: true },
      { user: user({ mustChangePassword: true }), isPlatformAdmin: false, isContentEditor: true },
    ]) {
      session.ctx = ctx;
      expect(await platformAdminOrNull()).toBeNull();
    }
  });
});
