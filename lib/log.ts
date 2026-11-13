/**
 * Structured logs (note 09 §4.1, PRODUCT 9 "structured JSON logs without personal data").
 *
 * One JSON line per EVENT on stdout, for Railway's log explorer (`@level:error`, `@event:auth.email.send_failed`,
 * `@ms:>1000`). stdout for every level: Railway turns stderr into "error". Not one line per request: Railway's
 * HTTP logs already have every request (join them with `reqId` = X-Railway-Request-Id).
 *
 *   import { log, requestLogger } from "@/lib/log";
 *   log.info("job.photo_purge.done", { expired: 3, ms: 120 });
 *   const l = requestLogger(req.headers);          // route handlers / actions: carries reqId
 *   l.error("scan.analyze.failed", { err, scanId });
 *
 * Event names: `area.object.verb`, lower case, dots between parts, `_` inside a part (`auth.email.send_failed`).
 * Units in the field name (`ms`, `bytes`). Row ids (`scanId`) are fine.
 *
 * Personal data never leaves this module in clear text:
 *  - keys named like secrets (password, token, secret, cookie, authorization, otp, code, headers, body, …) are dropped;
 *  - emails, IPs and user ids become HMAC pseudonyms (`h:1a2b…`), stable per secret, not reversible by brute force;
 *  - free text (messages, stacks) is scrubbed: URL query strings (of absolute URLs and of paths like
 *    `/ar/x?email=…`), emails (also percent-encoded, `a%40b.co`), IPv4/IPv6, bearer/basic credentials,
 *    `token=…`-style pairs, cookies, JWTs, API keys and "code 123456"-style one-time codes.
 * Still: never pass raw headers, request/response bodies, AI prompts or outputs, presigned URLs or text users typed.
 *
 * No `server-only` import (scripts, the Better Auth CLI and instrumentation.ts load it in plain Node). Never import it
 * from a "use client" file: it uses node:crypto and process.stdout.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomBytes } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** LOG_LEVEL (debug | info | warn | error), else info in production and debug elsewhere. Read on every call. */
export function minLevel(env: NodeJS.ProcessEnv = process.env): LogLevel {
  const value = env.LOG_LEVEL?.trim().toLowerCase();
  if (value && value in RANK) return value as LogLevel;
  return env.NODE_ENV === "production" ? "info" : "debug";
}

// ---------------------------------------------------------------------------------------------------------------
// Pseudonyms

// HMAC, not a bare hash: 2^32 IPv4 addresses (or a list of known emails) would reverse a plain SHA-256 in minutes.
let keyCache: { base: string; key: Buffer } | undefined;
function hmacKey(): Buffer {
  const base = process.env.LOG_HASH_KEY || process.env.BETTER_AUTH_SECRET || "";
  if (keyCache?.base !== base) {
    // No secret configured (a script, a unit test): a random key per process. Pseudonyms then only match
    // within one process, which is the safe failure mode.
    const key = base ? createHmac("sha256", base).update("waqaya-log-pseudonym-v1").digest() : randomBytes(32);
    keyCache = { base, key };
  }
  return keyCache.key;
}

/** Stable, non-reversible stand-in for an email, IP or user id: `h:` + 16 hex chars (trimmed, lower-cased first). */
export function pseudonym(value: string): string {
  return `h:${createHmac("sha256", hmacKey()).update(value.trim().toLowerCase()).digest("hex").slice(0, 16)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Free-text scrubbing

const MAX_TEXT = 4000;
const URL_QUERY = /(https?:\/\/[^\s?#"'<>]+)\?[^\s"'<>]*/gi; // presigned URLs, callbackUrl, invite and reset links
// The query of a bare path, e.g. Next's "Failed to handle request for /ar/reset-password?email=…" (req.url).
const PATH_QUERY = /(^|[\s"'(=,[])(\/[^\s?#"'<>]*)\?[^\s"'<>]*/g;
const EMAIL = /[A-Z0-9._%+-]+(?:@|%40)[A-Z0-9.-]+\.[A-Z]{2,}/gi; // also percent-encoded (a%40b.co in a URL)
const AUTH_SCHEME = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const COOKIE_LINE = /\b((?:set-)?cookie)(\s*:\s*)[^\r\n]*/gi;
const SECRET_PAIR =
  /\b([A-Za-z0-9_.-]*(?:token|secret|password|passwd|api[_-]?key|session|signature|credential)s?)("?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&"'}]+)/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const API_KEY = /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/g; // sk-ant-…, sk_live_…
const ONE_TIME_CODE = /\b(code|otp|pin)\b(\s*(?:is\b)?\s*[:=]?\s*)\d{4,8}\b/gi;
const IPV4 = /(?<![\d.])(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?![\d.])/g;
// Candidate IPv6 runs; the callback keeps only real-looking ones (a "::" or 3+ colons), so clock times
// like 12:30:45 survive.
const IPV6 = /(?<![0-9A-Za-z:])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![0-9A-Za-z:])/g;

function looksLikeIpv6(candidate: string): boolean {
  const colons = candidate.split(":").length - 1;
  if (!candidate.includes("::") && colons < 3) return false;
  return /[0-9A-Fa-f]/.test(candidate);
}

/** Removes secrets and personal data from free text (messages, stack traces, Better Auth log lines). */
export function scrub(text: string): string {
  return text
    .slice(0, MAX_TEXT * 2)
    .replace(URL_QUERY, "$1?[redacted]")
    .replace(PATH_QUERY, "$1$2?[redacted]")
    .replace(COOKIE_LINE, "$1$2[redacted]")
    .replace(AUTH_SCHEME, "$1 [redacted]")
    .replace(JWT, "[redacted-jwt]")
    .replace(API_KEY, "[redacted-key]")
    .replace(SECRET_PAIR, "$1$2[redacted]")
    .replace(EMAIL, (m) => `[email ${pseudonym(m.replace(/%40/gi, "@"))}]`)
    .replace(ONE_TIME_CODE, "$1$2[redacted]")
    .replace(IPV4, (m) => `[ip ${pseudonym(m)}]`)
    .replace(IPV6, (m) => (looksLikeIpv6(m) ? `[ip ${pseudonym(m)}]` : m))
    .slice(0, MAX_TEXT);
}

// ---------------------------------------------------------------------------------------------------------------
// Structured fields

const norm = (key: string) => key.toLowerCase().replace(/[-_\s]/g, "");

/** Keys whose values never reach the log (compared lower-case, without - and _). */
const DROP = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "secret",
  "token",
  "tokens",
  "apikey",
  "authorization",
  "proxyauthorization",
  "cookie",
  "cookies",
  "setcookie",
  "otp",
  "code",
  "backupcodes",
  "totpuri",
  "signature",
  "credentials",
  "headers",
  "body",
  "rawbody",
  "presignedurl",
  "prompt",
  "messages",
]);
const DROP_SUFFIXES = ["token", "secret", "password", "cookie", "otp", "apikey"];

/** Keys whose (string) values become pseudonyms. */
const HASH = new Set([
  "email",
  "emails",
  "to",
  "cc",
  "bcc",
  "replyto",
  "ip",
  "ips",
  "ipaddress",
  "clientip",
  "srcip",
  "remoteaddress",
  "xrealip",
  "xforwardedfor",
  "userid",
  "actorid",
  "memberid",
  "inviterid",
  "impersonatedby",
]);

const shouldDrop = (n: string) => DROP.has(n) || DROP_SUFFIXES.some((s) => n.endsWith(s));
const MAX_DEPTH = 4;
const MAX_ITEMS = 20;
const MAX_KEYS = 40;

function serializeError(err: Error, depth: number): Record<string, unknown> {
  const e = err as Error & { digest?: unknown; code?: unknown; statusCode?: unknown; cause?: unknown };
  return {
    name: e.name,
    message: scrub(e.message ?? ""),
    // The reference code Next shows on error.tsx (error.digest): lets support find this line.
    ...(typeof e.digest === "string" && { digest: e.digest.slice(0, 64) }),
    // Machine codes only (P2002, ECONNREFUSED, UND_ERR_CONNECT_TIMEOUT), never free text.
    ...(typeof e.code === "string" && /^[A-Za-z0-9_]{2,40}$/.test(e.code) && { errorCode: e.code }),
    ...(typeof e.statusCode === "number" && { statusCode: e.statusCode }),
    ...(e.stack && { stack: scrub(e.stack.split("\n").slice(0, 12).join("\n")) }),
    ...(e.cause !== undefined &&
      depth < 2 && { cause: e.cause instanceof Error ? serializeError(e.cause, depth + 1) : clean(e.cause, depth + 1) }),
  };
}

function hashValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return pseudonym(value);
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => (typeof v === "string" ? pseudonym(v) : clean(v, depth + 1)));
  return clean(value, depth + 1);
}

/** Makes any value safe and JSON-serialisable (exported for tests). */
export function clean(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return scrub(value);
  if (typeof value === "symbol" || typeof value === "function") return `[${typeof value}]`;
  if (value instanceof Error) return serializeError(value, depth);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof URL) return scrub(value.href);
  if (depth >= MAX_DEPTH) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => clean(v, depth + 1));
  if (typeof value === "object") {
    if (typeof Headers !== "undefined" && value instanceof Headers) return "[headers]";
    const out: Record<string, unknown> = {};
    let keys = 0;
    for (const [k, v] of Object.entries(value)) {
      if (keys++ >= MAX_KEYS) {
        out["[truncated]"] = true;
        break;
      }
      const n = norm(k);
      if (shouldDrop(n)) continue;
      out[k] = HASH.has(n) ? hashValue(v, depth) : clean(v, depth + 1);
    }
    return out;
  }
  return scrub(String(value));
}

// ---------------------------------------------------------------------------------------------------------------
// Output

const RESERVED = ["time", "level", "message", "event", "commit"] as const;

/**
 * The current time WITHOUT `new Date()` / `Date.now()`. Under cacheComponents Next treats those as sync I/O and
 * aborts a prerender (or ends a cacheable render stage) that reaches them, and a log line can be written inside a
 * render: Better Auth's logger in getSession, a library's console.warn (finish-round review). Next's own advice
 * (node-environment-extensions/date.js) is `performance` for introspection; `new Date(number)` is not hooked.
 */
export function logTime(): string {
  return new Date(performance.timeOrigin + performance.now()).toISOString();
}

function write(line: string, level: LogLevel) {
  if (typeof process !== "undefined" && typeof process.stdout?.write === "function") {
    process.stdout.write(`${line}\n`);
  } else {
    (level === "error" ? console.error : console.log)(line);
  }
}

function emit(level: LogLevel, event: string, fields: LogFields | undefined, base: LogFields | undefined, time?: string) {
  if (RANK[level] < RANK[minLevel()]) return;
  const name = scrub(String(event)).slice(0, 120);
  const data = (clean({ ...base, ...fields }) ?? {}) as Record<string, unknown>;
  for (const k of RESERVED) delete data[k];

  if (process.env.LOG_FORMAT === "pretty") {
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(`${level} ${name}`, data);
    return;
  }
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7);
  const record = { time: time ?? logTime(), level, message: name, event: name, ...(commit && { commit }), ...data };
  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    line = JSON.stringify({ time: record.time, level, message: name, event: name, note: "fields not serialisable" });
  }
  write(line, level);
}

export type Logger = { [L in LogLevel]: (event: string, fields?: LogFields) => void } & {
  /** A logger that adds `base` to every line (e.g. `{ reqId }`, `{ job: "photo-purge" }`). */
  child(base: LogFields): Logger;
};

function make(base?: LogFields): Logger {
  return {
    debug: (e, f) => emit("debug", e, f, base),
    info: (e, f) => emit("info", e, f, base),
    warn: (e, f) => emit("warn", e, f, base),
    error: (e, f) => emit("error", e, f, base),
    child: (more) => make({ ...base, ...more }),
  };
}

export const log: Logger = make();

// ---------------------------------------------------------------------------------------------------------------
// Request ids

type HeaderSource = Headers | Record<string, string | string[] | undefined> | null | undefined;

/** Railway's request id (also on its HTTP log line), else a caller's x-request-id. Only safe-looking values. */
export function requestId(headers: HeaderSource): string | undefined {
  if (!headers) return undefined;
  const get = (name: string): string | undefined => {
    if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.get(name) ?? undefined;
    const raw = (headers as Record<string, string | string[] | undefined>)[name];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const id = get("x-railway-request-id") ?? get("x-request-id");
  return id && /^[A-Za-z0-9._:-]{1,128}$/.test(id) ? id : undefined;
}

/** `log.child({ reqId })` for a route handler or server action. */
export function requestLogger(headers: HeaderSource): Logger {
  const reqId = requestId(headers);
  return reqId ? log.child({ reqId }) : log;
}

// ---------------------------------------------------------------------------------------------------------------
// Better Auth

/**
 * Better Auth's `logger` option (`@better-auth/core` Logger): its warnings and errors become `auth.log` events.
 * Usage in lib/auth.ts: `logger: betterAuthLogger`.
 */
export const betterAuthLogger = {
  disableColors: true,
  level: "warn" as const,
  log(level: "debug" | "info" | "warn" | "error", message: string, ...args: unknown[]) {
    const err = args.find((a): a is Error => a instanceof Error);
    log[level]("auth.log", { detail: message, ...(err && { err }) });
  },
};

// ---------------------------------------------------------------------------------------------------------------
// console.error / console.warn of Next and libraries (production server only)

const ANSI = /\u001b\[[0-9;]*m/g;
const PREFIXES: Array<[RegExp, string]> = [
  [/^\s*⨯\s*/u, "next"], // Next's Log.error (e.g. "⨯ Error [PrismaClientKnownRequestError]: …")
  [/^\s*⚠\s*/u, "next"], // Next's Log.warn
  [/^\s*# SERVER_ERROR:\s*/, "better-call"], // Better Auth's router, for an endpoint that threw a plain Error
];

/**
 * The fields of one console.error / console.warn call: `detail` (the strings, without colours or Next's prefix),
 * `err` (the first Error), `args` (anything else), `source`. The logger scrubs all of it.
 */
export function consoleFields(args: readonly unknown[]): LogFields {
  const err = args.find((a): a is Error => a instanceof Error);
  const strings: string[] = [];
  const rest: unknown[] = [];
  for (const a of args) {
    if (a === err) continue;
    if (typeof a === "string") strings.push(a.replace(ANSI, ""));
    else rest.push(a);
  }
  let detail = strings.join(" ").trim();
  let source = "console";
  for (const [re, name] of PREFIXES) {
    if (re.test(detail)) {
      detail = detail.replace(re, "").trim();
      source = name;
      break;
    }
  }
  return { source, ...(detail && { detail }), ...(err && { err }), ...(rest.length > 0 && { args: rest }) };
}

const globalForConsole = globalThis as typeof globalThis & {
  __waqayaConsoleRouted?: boolean;
  __waqayaConsolePending?: Set<() => void>;
};
/** Deferred console lines not written yet (routeConsoleToLog `deferMs`). */
const pending: Set<() => void> = (globalForConsole.__waqayaConsolePending ??= new Set());

/**
 * Writes every deferred console line now (still dropping the ones `skip` says were logged elsewhere). Runs on
 * process "exit": Next's fatal paths are `console.error(err); process.exit(1)`, and that line must not be lost.
 */
export function flushConsoleLines(): void {
  for (const flush of [...pending]) flush();
}

/**
 * Production server: console.error / console.warn (Next's "⨯ Error …" blocks with stack and Prisma `meta`, Better
 * Auth's router, libraries) become ONE JSON line each (`server.console.error` / `server.console.warn`), scrubbed
 * like every other line, instead of many plain-text lines that Railway would store one by one, unredacted.
 * `skip(err)` drops a call whose Error is (or becomes) logged elsewhere: instrumentation.ts onRequestError logs it
 * as http.request.error, before Next prints it (pages) or a moment after (route handlers), so a call that carries an
 * Error is written `deferMs` later and only if `skip` still says no; its `time` is still the time of the call, and a
 * line still pending is written on process exit. console.log / console.info (Next's start-up banner) are left alone.
 * Idempotent; off with LOG_FORMAT=pretty (that format prints through console itself).
 *
 * Lines are written OUTSIDE the caller's async context (an AsyncLocalStorage snapshot taken here, at start-up, outside
 * any request), like Next's own console wrapper (node-environment-extensions/console-exit.js): a console.warn during a
 * prerender must never count as the prerender's own I/O.
 */
export function routeConsoleToLog(options: { skip?: (err: Error) => boolean; deferMs?: number } = {}): void {
  if (globalForConsole.__waqayaConsoleRouted || process.env.LOG_FORMAT === "pretty") return;
  globalForConsole.__waqayaConsoleRouted = true;
  const original = { error: console.error.bind(console), warn: console.warn.bind(console) };
  const { skip, deferMs = 0 } = options;
  const outside = AsyncLocalStorage.snapshot();
  let busy = false;
  const write = (level: "error" | "warn", fields: LogFields, args: unknown[], time: string) => {
    if (busy) return original[level](...args); // never loop if writing a line itself prints to the console
    busy = true;
    try {
      if (fields.err instanceof Error && skip?.(fields.err)) return;
      emit(level, `server.console.${level}`, fields, undefined, time);
    } catch {
      original[level](...args);
    } finally {
      busy = false;
    }
  };
  const route = (level: "error" | "warn") => (...args: unknown[]) => {
    const time = logTime(); // when it happened, also for a line written later
    let fields: LogFields;
    try {
      fields = consoleFields(args);
    } catch {
      return original[level](...args);
    }
    if (fields.err instanceof Error && deferMs > 0) {
      const flush = () => {
        if (!pending.delete(flush)) return; // already written (by the timer or on exit)
        clearTimeout(timer);
        outside(() => write(level, fields, args, time));
      };
      const timer = setTimeout(flush, deferMs);
      timer.unref?.();
      pending.add(flush);
      return;
    }
    outside(() => write(level, fields, args, time));
  };
  console.error = route("error");
  console.warn = route("warn");
  if (!process.listeners("exit").includes(flushConsoleLines)) process.on("exit", flushConsoleLines);
}
