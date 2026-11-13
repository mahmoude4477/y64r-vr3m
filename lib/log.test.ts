import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  betterAuthLogger,
  clean,
  consoleFields,
  flushConsoleLines,
  log,
  logTime,
  minLevel,
  pseudonym,
  requestId,
  requestLogger,
  routeConsoleToLog,
  scrub,
} from "./log";

type Line = Record<string, unknown>;

let lines: string[] = [];
beforeEach(() => {
  lines = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  vi.stubEnv("LOG_LEVEL", "debug");
  vi.stubEnv("LOG_FORMAT", "");
  vi.stubEnv("LOG_HASH_KEY", "unit-test-key");
  vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const parsed = (): Line[] => lines.map((l) => JSON.parse(l) as Line);

describe("log output", () => {
  it("writes one JSON line per event with time, level, message and event", () => {
    log.info("job.photo_purge.done", { expired: 3, ms: 120 });
    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith("\n")).toBe(true);
    expect(lines[0].trimEnd()).not.toContain("\n");
    const [line] = parsed();
    expect(line).toMatchObject({ level: "info", message: "job.photo_purge.done", event: "job.photo_purge.done", expired: 3, ms: 120 });
    expect(Number.isNaN(Date.parse(String(line.time)))).toBe(false);
  });

  it("filters by LOG_LEVEL and defaults to info in production", () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    log.info("a.b.c");
    log.debug("a.b.d");
    log.warn("a.b.e");
    log.error("a.b.f");
    expect(parsed().map((l) => l.level)).toEqual(["warn", "error"]);
    expect(minLevel({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("info");
    expect(minLevel({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("debug");
    expect(minLevel({ NODE_ENV: "production", LOG_LEVEL: "ERROR" } as NodeJS.ProcessEnv)).toBe("error");
    expect(minLevel({ NODE_ENV: "production", LOG_LEVEL: "loud" } as NodeJS.ProcessEnv)).toBe("info");
  });

  it("adds the short commit and never lets fields overwrite reserved keys", () => {
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "0123456789abcdef");
    log.warn("health.db.failed", { level: "debug", message: "x", event: "y", time: "z", status: "timeout" });
    const [line] = parsed();
    expect(line).toMatchObject({ level: "warn", event: "health.db.failed", message: "health.db.failed", commit: "0123456", status: "timeout" });
    expect(line.time).not.toBe("z");
  });

  it("child loggers carry their base fields", () => {
    log.child({ reqId: "req-1", job: "photo-purge" }).info("job.photo_purge.started", { batch: 1 });
    expect(parsed()[0]).toMatchObject({ reqId: "req-1", job: "photo-purge", batch: 1 });
  });

  it("survives values that JSON cannot serialise", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    log.error("x.y.z", { circular, big: 10n, inf: Number.POSITIVE_INFINITY, fn: () => 1, when: new Date(0) });
    const [line] = parsed();
    expect(line).toMatchObject({ big: "10", inf: "Infinity", fn: "[function]", when: "1970-01-01T00:00:00.000Z" });
  });

  it("never reads the clock with new Date() or Date.now() (sync I/O that aborts a prerender under cacheComponents)", () => {
    const RealDate = Date;
    class TrapDate extends RealDate {
      constructor(...args: [] | [string | number | Date]) {
        if (args.length === 0) throw new Error("new Date() without an argument");
        super(...(args as [string | number | Date]));
      }
      static now(): number {
        throw new Error("Date.now()");
      }
    }
    globalThis.Date = TrapDate as DateConstructor;
    try {
      log.info("a.b.c", { n: 1 });
      expect(() => logTime()).not.toThrow();
    } finally {
      globalThis.Date = RealDate;
    }
    const [line] = parsed();
    expect(Math.abs(Date.parse(String(line!.time)) - Date.now())).toBeLessThan(5_000);
  });

  it("pretty format goes to the console instead of stdout", () => {
    vi.stubEnv("LOG_FORMAT", "pretty");
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("dev.thing.done", { email: "a@b.co" });
    expect(lines).toHaveLength(0);
    expect(info).toHaveBeenCalledWith("info dev.thing.done", { email: pseudonym("a@b.co") });
  });
});

describe("redaction of fields", () => {
  it("drops secret-like keys at any depth", () => {
    const out = clean({
      password: "p",
      newPassword: "p",
      "set-cookie": "s",
      Cookie: "c",
      authorization: "Bearer x",
      otp: "123456",
      code: "123456",
      sessionToken: "t",
      ANTHROPIC_API_KEY: "sk-ant-xxx",
      BETTER_AUTH_SECRET: "s",
      headers: { a: 1 },
      body: "raw",
      nested: { refresh_token: "r", ok: 1 },
      status: 401,
    }) as Record<string, unknown>;
    expect(out).toEqual({ nested: { ok: 1 }, status: 401 });
  });

  it("turns emails, IPs and user ids into stable pseudonyms", () => {
    const out = clean({ email: "Admin@Example.com", ip: "10.1.2.3", userId: "u_123", to: ["a@b.co"], scanId: "s_1" }) as Record<
      string,
      unknown
    >;
    expect(out.email).toBe(pseudonym("admin@example.com"));
    expect(out.email).toMatch(/^h:[0-9a-f]{16}$/);
    expect(out.ip).toBe(pseudonym("10.1.2.3"));
    expect(out.userId).toBe(pseudonym("u_123"));
    expect(out.to).toEqual([pseudonym("a@b.co")]);
    expect(out.scanId).toBe("s_1");
  });

  it("pseudonyms depend on the key and are not a plain hash", () => {
    const a = pseudonym("10.0.0.1");
    vi.stubEnv("LOG_HASH_KEY", "another-key");
    expect(pseudonym("10.0.0.1")).not.toBe(a);
  });

  it("serialises errors with digest, machine code and cause, scrubbing their text", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432"), { code: "ECONNREFUSED" });
    const err = Object.assign(new Error("failed for admin@example.com", { cause }), { digest: "123456789", code: "P2002" });
    log.error("db.query.failed", { err });
    const line = parsed()[0] as { err: Record<string, unknown> & { cause: Record<string, unknown> } };
    expect(line.err.name).toBe("Error");
    expect(line.err.digest).toBe("123456789");
    expect(line.err.errorCode).toBe("P2002");
    expect(line.err.message).not.toContain("admin@example.com");
    expect(line.err.cause.errorCode).toBe("ECONNREFUSED");
    expect(line.err.cause.message).not.toContain("10.0.0.5");
    expect(String(line.err.stack)).toContain("Error:");
  });

  it("never prints a secret that sits in a nested value", () => {
    log.info("auth.email.sent", { meta: { to: "x@y.io", token: "abc" }, note: "reset link https://w.sa/r?token=abc" });
    const raw = lines.join("");
    expect(raw).not.toContain("abc");
    expect(raw).not.toContain("x@y.io");
  });
});

describe("scrub", () => {
  it.each([
    ["https://waqaya.sa/ar/sign-in?callbackUrl=%2Far%2Fscans&x=1", "https://waqaya.sa/ar/sign-in?[redacted]"],
    ["Authorization: Bearer abc.def-ghi", "Authorization: Bearer [redacted]"],
    ["email-verification code 482913", "email-verification code [redacted]"],
    ["your otp is 123456", "your otp is [redacted]"],
    ["token=abcdef; path=/", "token=[redacted]; path=/"],
    ['{"apiKey":"k-123"}', '{"apiKey":[redacted]}'],
    ["Cookie: better-auth.session_token=xyz; other=1", "Cookie: [redacted]"],
    ["key sk-ant-api03-AAAAAAAAAAAAAAAAAAAA used", "key [redacted-key] used"],
    ["jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_value", "jwt [redacted-jwt]"],
    // the query of a bare path (Next's "Failed to handle request for ${req.url}"), not only of absolute URLs
    [
      "Failed to handle request for /ar/reset-password?email=leak.me%40example.com&callbackUrl=%2Far%2Fadmin&state=xyz",
      "Failed to handle request for /ar/reset-password?[redacted]",
    ],
    ['{"url":"/api/x?a=1&b=2"}', '{"url":"/api/x?[redacted]"}'],
    ["path=/ar/sign-in?callbackUrl=%2Far", "path=/ar/sign-in?[redacted]"],
    ["(/ar/invite/abc?x=1)", "(/ar/invite/abc?[redacted]"], // like absolute URLs: the rest of the token goes
    ["is it 12:30? yes", "is it 12:30? yes"],
  ])("%s", (input, expected) => {
    expect(scrub(input)).toBe(expected);
  });

  it("hashes emails and IP addresses (v4 and v6) but keeps times, versions and ports", () => {
    const out = scrub("from 192.168.1.20 and 2001:db8::1 and ::ffff:10.0.0.1 by sara.n+x@uni.edu.sa at 12:30:45 on v24.20.0");
    expect(out).not.toMatch(/192\.168|2001:db8|10\.0\.0\.1|sara/);
    expect(out).toContain(`[ip ${pseudonym("192.168.1.20")}]`);
    expect(out).toContain(`[ip ${pseudonym("2001:db8::1")}]`);
    expect(out).toContain(`[email ${pseudonym("sara.n+x@uni.edu.sa")}]`);
    expect(out).toContain("12:30:45");
    expect(out).toContain("v24.20.0");
    expect(scrub("at file.ts:123:45")).toBe("at file.ts:123:45");
  });

  it("hashes percent-encoded e-mails like plain ones", () => {
    const out = scrub("invite for leak.me%40example.com in /api/u/sara%40uni.edu.sa");
    expect(out).not.toMatch(/leak\.me|sara|example\.com|uni\.edu/);
    expect(out).toContain(`[email ${pseudonym("leak.me@example.com")}]`);
    expect(out).toContain(`[email ${pseudonym("sara@uni.edu.sa")}]`);
  });

  it("caps very long text", () => {
    expect(scrub("a".repeat(10_000))).toHaveLength(4000);
  });

  it("scrubs the event name too", () => {
    log.info("auth.user admin@example.com");
    expect(lines.join("")).not.toContain("admin@example.com");
  });
});

describe("request ids", () => {
  it("prefers Railway's id, accepts x-request-id, rejects odd values", () => {
    expect(requestId(new Headers({ "x-railway-request-id": "abc-123", "x-request-id": "other" }))).toBe("abc-123");
    expect(requestId({ "x-request-id": ["r1", "r2"] })).toBe("r1");
    expect(requestId(new Headers({ "x-request-id": "bad id <script>" }))).toBeUndefined();
    expect(requestId(null)).toBeUndefined();
  });

  it("requestLogger adds reqId to every line", () => {
    requestLogger(new Headers({ "x-railway-request-id": "rq_9" })).warn("scan.analyze.slow", { ms: 9000 });
    expect(parsed()[0]).toMatchObject({ reqId: "rq_9", ms: 9000 });
  });
});

describe("betterAuthLogger", () => {
  it("logs Better Auth messages as auth.log events, scrubbed", () => {
    betterAuthLogger.log("warn", "Rate limit hit for 10.9.8.7 (user a@b.co)", new Error("boom"));
    const [line] = parsed() as Array<{ level: string; event: string; detail: string; err: { message: string } }>;
    expect(line.level).toBe("warn");
    expect(line.event).toBe("auth.log");
    expect(line.detail).not.toMatch(/10\.9\.8\.7|a@b\.co/);
    expect(line.err.message).toBe("boom");
  });
});

describe("console.error / console.warn on the production server", () => {
  const E = String.fromCharCode(27); // ANSI escape (colour codes)
  it("consoleFields strips colours and Next's prefix, keeps the Error and the other arguments", () => {
    const err = Object.assign(new Error("Transaction API error"), { code: "P2028" });
    expect(consoleFields([`${E}[31m${E}[1m⨯${E}[22m${E}[39m`, err])).toEqual({ source: "next", err });
    expect(consoleFields(["# SERVER_ERROR: ", err])).toEqual({ source: "better-call", err });
    expect(consoleFields([`${E}[33m⚠${E}[39m Slow query`, { ms: 900 }])).toEqual({
      source: "next",
      detail: "Slow query",
      args: [{ ms: 900 }],
    });
    expect(consoleFields(["plain text"])).toEqual({ source: "console", detail: "plain text" });
  });

  it("routeConsoleToLog turns each call into ONE scrubbed JSON line and skips errors already reported", () => {
    const g = globalThis as typeof globalThis & { __waqayaConsoleRouted?: boolean };
    const saved = { error: console.error, warn: console.warn, routed: g.__waqayaConsoleRouted };
    g.__waqayaConsoleRouted = false;
    try {
      const seen = new Error("already logged");
      routeConsoleToLog({ skip: (e) => e === seen });
      const err = new Error("connect failed for user a@b.co from 10.1.2.3");
      err.stack = ["Error: connect failed", "    at a (file.js:1:1)", "    at b (file.js:2:2)"].join("\n");
      console.error(`${E}[31m⨯${E}[39m`, err);
      console.warn("token=abc123 expired");
      console.error(seen);
      const out = parsed() as Array<Record<string, unknown> & { err?: { message: string; stack: string } }>;
      expect(lines).toHaveLength(2);
      expect(out[0]).toMatchObject({ level: "error", event: "server.console.error", source: "next" });
      expect(out[0]!.err!.message).not.toMatch(/a@b\.co|10\.1\.2\.3/);
      expect(out[0]!.err!.stack).toContain("at a (file.js:1:1)"); // the stack stays inside the one line
      expect(out[1]).toMatchObject({ level: "warn", event: "server.console.warn", detail: "token=[redacted] expired" });
    } finally {
      console.error = saved.error;
      console.warn = saved.warn;
      g.__waqayaConsoleRouted = saved.routed;
    }
  });

  it("writes outside the caller's async context (a console.warn inside a prerender is not the prerender's I/O)", () => {
    const g = globalThis as typeof globalThis & { __waqayaConsoleRouted?: boolean };
    const saved = { error: console.error, warn: console.warn, routed: g.__waqayaConsoleRouted };
    g.__waqayaConsoleRouted = false;
    const store = new AsyncLocalStorage<string>(); // stands in for Next's workUnitAsyncStorage
    const seenStores: Array<string | undefined> = [];
    vi.mocked(process.stdout.write).mockImplementation((chunk: string | Uint8Array) => {
      seenStores.push(store.getStore());
      lines.push(String(chunk));
      return true;
    });
    try {
      routeConsoleToLog(); // installed at start-up, outside any request
      store.run("prerender", () => {
        console.warn("a library warns during a render");
        log.info("direct.line.inside"); // a direct log call stays where it is (it reads no clock any more)
      });
      expect(parsed().map((l) => l.event)).toEqual(["server.console.warn", "direct.line.inside"]);
      expect(seenStores).toEqual([undefined, "prerender"]);
    } finally {
      console.error = saved.error;
      console.warn = saved.warn;
      g.__waqayaConsoleRouted = saved.routed;
    }
  });

  it("a deferred Error line keeps the time of the call and is written on exit when still pending", async () => {
    const g = globalThis as typeof globalThis & { __waqayaConsoleRouted?: boolean };
    const saved = { error: console.error, warn: console.warn, routed: g.__waqayaConsoleRouted };
    g.__waqayaConsoleRouted = false;
    try {
      const reported = new WeakSet<Error>();
      routeConsoleToLog({ skip: (e) => reported.has(e), deferMs: 60_000 });
      expect(process.listeners("exit")).toContain(flushConsoleLines);
      const fatal = new Error("fatal setup error");
      const logged = new Error("already an http.request.error");
      const before = Date.now();
      console.error(fatal);
      console.error(logged);
      await new Promise((r) => setTimeout(r, 30));
      console.warn("written at once, called later");
      reported.add(logged);
      expect(lines).toHaveLength(1);
      flushConsoleLines(); // what process "exit" runs: `console.error(err); process.exit(1)` keeps its line
      flushConsoleLines(); // idempotent
      const out = parsed() as Array<Record<string, unknown> & { err?: { message: string } }>;
      expect(out.map((l) => l.event)).toEqual(["server.console.warn", "server.console.error"]);
      expect(out[1]!.err!.message).toBe("fatal setup error"); // the reported one is still dropped
      const errorTime = Date.parse(String(out[1]!.time));
      expect(errorTime).toBeGreaterThanOrEqual(before - 5);
      expect(errorTime).toBeLessThan(Date.parse(String(out[0]!.time))); // the call's time, not the write's
    } finally {
      console.error = saved.error;
      console.warn = saved.warn;
      g.__waqayaConsoleRouted = saved.routed;
    }
  });

  it("with deferMs, drops an Error line when the Error is reported a moment later (route handlers)", async () => {
    const g = globalThis as typeof globalThis & { __waqayaConsoleRouted?: boolean };
    const saved = { error: console.error, warn: console.warn, routed: g.__waqayaConsoleRouted };
    g.__waqayaConsoleRouted = false;
    vi.useFakeTimers();
    try {
      const reported = new WeakSet<Error>();
      routeConsoleToLog({ skip: (e) => reported.has(e), deferMs: 100 });
      const later = new Error("reported after the print");
      const never = new Error("only printed");
      console.error(`${E}[31m⨯${E}[39m`, later);
      console.error(`${E}[31m⨯${E}[39m`, never);
      console.warn("no error: written at once");
      expect(lines).toHaveLength(1);
      reported.add(later); // onRequestError runs a few ms after Next printed it
      await vi.advanceTimersByTimeAsync(100);
      const out = parsed() as Array<Record<string, unknown> & { err?: { message: string } }>;
      expect(out.map((l) => l.event)).toEqual(["server.console.warn", "server.console.error"]);
      expect(out[1]!.err!.message).toBe("only printed");
    } finally {
      vi.useRealTimers();
      console.error = saved.error;
      console.warn = saved.warn;
      g.__waqayaConsoleRouted = saved.routed;
    }
  });
});
