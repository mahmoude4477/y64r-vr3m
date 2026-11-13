import type { Instrumentation } from "next";
import { cspStatus } from "./app/api/health/checks";
import { log, requestId, routeConsoleToLog } from "./lib/log";

// Node.js-only half of instrumentation.ts (imported only when NEXT_RUNTIME is "nodejs", so the Edge build never
// sees node:crypto or process.version).

// Errors logged as http.request.error (with route and reqId): Next prints the same Error object too, after
// onRequestError for pages (next-server.js instrumentationOnRequestError -> logError) and just before it for route
// handlers. routeConsoleToLog holds a console line that carries an Error for DEFER_MS and drops it when the Error was
// reported meanwhile. And Next calls onRequestError once per Flight task that threw: a cached getSession() rejection
// awaited in three Suspense boundaries arrives three times with the same Error (Next prints it once itself), so a
// request logs a given Error once. Together: each server error is ONE line.
const globalForErrors = globalThis as typeof globalThis & {
  __waqayaReportedErrors?: WeakSet<object>;
  __waqayaLoggedFor?: WeakMap<object, { headers: WeakSet<object>; reqId: string | undefined }>;
};
const reported: WeakSet<object> = (globalForErrors.__waqayaReportedErrors ??= new WeakSet());
// Error -> the requests it was already logged for: their headers object (one per request) and the last reqId. Per
// request, not per process: an Error object rethrown on later requests (a memoised rejection) is logged each time.
const loggedFor = (globalForErrors.__waqayaLoggedFor ??= new WeakMap());
const DEFER_MS = 100;

/** True when this Error was already logged for this request (and remembers the request for the next call). */
export function alreadyLoggedForRequest(err: unknown, headers: unknown, reqId: string | undefined): boolean {
  if (!err || typeof err !== "object") return false;
  let seen = loggedFor.get(err);
  if (!seen) {
    seen = { headers: new WeakSet(), reqId: undefined };
    loggedFor.set(err, seen);
  }
  const headersObject = headers && typeof headers === "object" ? headers : null;
  const duplicate = (headersObject !== null && seen.headers.has(headersObject)) || (reqId !== undefined && seen.reqId === reqId);
  if (headersObject) seen.headers.add(headersObject);
  if (reqId !== undefined) seen.reqId = reqId;
  return duplicate;
}

export function onServerStart() {
  // `next start` only: every console.error / console.warn becomes one scrubbed JSON line (PRODUCT 9). `next dev`
  // keeps Next's readable output and its error overlay.
  if (process.env.NODE_ENV === "production") routeConsoleToLog({ skip: (err) => reported.has(err), deferMs: DEFER_MS });
  log.info("server.start", {
    node: process.version,
    env: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
    region: process.env.RAILWAY_REPLICA_REGION ?? null,
  });
  // The CSP's bucket origin is fixed at build time (next.config.ts env.CSP_BUCKET_ORIGIN). If S3_* changed since
  // the build, browser photo uploads are blocked until the next deploy rebuilds: say so once at startup
  // (/api/health reports it as checks.csp too).
  if (cspStatus() === "stale") {
    log.error("server.csp.stale", { hint: "S3_* changed since the build: redeploy so the CSP allows the bucket" });
  }
}

export const logRequestError: Instrumentation.onRequestError = (err, request, context) => {
  if (err && typeof err === "object") reported.add(err);
  const reqId = requestId(request.headers);
  if (alreadyLoggedForRequest(err, request.headers, reqId)) return;
  log.error("http.request.error", {
    err,
    method: request.method,
    path: request.path.split("?")[0], // never the query string (callbackUrl, emails, codes)
    route: context.routePath,
    routeType: context.routeType, // render | route | action | proxy
    renderSource: context.renderSource ?? null,
    reqId,
  });
};
