import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => state.session } } }));

const { GET } = await import("./route");

// As Next builds request.url under `next start`: the server's own host and port, whatever the browser used.
const call = (query: string, cookie?: string) =>
  GET(
    new NextRequest(`http://localhost:8080/api/session/expired${query}`, {
      headers: {
        host: "waqaya.example",
        "x-forwarded-host": "waqaya.example",
        "x-forwarded-proto": "https",
        ...(cookie ? { cookie } : {}),
      },
    }),
  );

beforeEach(() => {
  state.session = null;
});

describe("GET /api/session/expired (review round 2: never redirect to the server's own host)", () => {
  it("a dead session cookie: cleared, relative redirect to sign-in, never cached", async () => {
    const res = await call("?locale=en", "better-auth.session_token=stale; __Secure-better-auth.session_token=stale");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/en/sign-in");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toMatch(/better-auth\.session_token=;/);
    expect(cookies).toMatch(/__Secure-better-auth\.session_token=;.*Secure/i);
  });

  it("a valid session goes back to the app; an unknown locale falls back to Arabic", async () => {
    state.session = { user: { id: "u1" } };
    const res = await call("?locale=xx");
    expect(res.headers.get("location")).toBe("/ar/dashboard");
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("the Location never names a host", async () => {
    for (const query of ["", "?locale=ar", "?locale=en"]) {
      const location = (await call(query)).headers.get("location") ?? "";
      expect(location).toMatch(/^\/(ar|en)\/sign-in$/);
      expect(location).not.toMatch(/localhost|127\.0\.0\.1|:\/\//);
    }
  });
});
