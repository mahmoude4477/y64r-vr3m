import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alreadyLoggedForRequest, logRequestError } from "./instrumentation-node";

let lines: Array<Record<string, unknown>> = [];
beforeEach(() => {
  lines = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
    return true;
  });
  vi.stubEnv("LOG_LEVEL", "debug");
  vi.stubEnv("LOG_FORMAT", "");
  vi.stubEnv("LOG_HASH_KEY", "unit-test-key");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

type OnRequestErrorArgs = Parameters<typeof logRequestError>;
const context = { routerKind: "App Router", routePath: "/[locale]/(app)/admin", routeType: "render", renderSource: "react-server-components" } as OnRequestErrorArgs[2];
const request = (headers: Record<string, string>, path = "/ar/admin?x=1"): OnRequestErrorArgs[1] => ({ path, method: "GET", headers });

describe("onRequestError: one line per Error per request", () => {
  it("logs a cached rejection awaited in three Suspense boundaries once (Next calls once per Flight task)", async () => {
    const err = Object.assign(new Error("failed to get the session"), { digest: "3772088063" });
    const req = request({ "x-request-id": "rv-req-20" });
    for (let i = 0; i < 3; i++) await logRequestError(err, req, context);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ event: "http.request.error", path: "/ar/admin", reqId: "rv-req-20" });
    expect((lines[0]!.err as { digest?: string }).digest).toBe("3772088063");
  });

  it("still logs the same Error on another request, and other Errors of the same request", async () => {
    const memoised = new Error("module-level rejection");
    await logRequestError(memoised, request({}), context);
    await logRequestError(memoised, request({}), context); // a new request (new headers object), no reqId
    const req = request({ "x-railway-request-id": "rq-1" });
    await logRequestError(new Error("a"), req, context);
    await logRequestError(new Error("b"), req, context);
    expect(lines).toHaveLength(4);
  });

  it("matches a request by reqId when Next rebuilds the headers object (proxy requests)", () => {
    const err = new Error("proxy");
    expect(alreadyLoggedForRequest(err, { "x-railway-request-id": "rq-2" }, "rq-2")).toBe(false);
    expect(alreadyLoggedForRequest(err, { "x-railway-request-id": "rq-2" }, "rq-2")).toBe(true);
    expect(alreadyLoggedForRequest(err, { "x-railway-request-id": "rq-3" }, "rq-3")).toBe(false);
    expect(alreadyLoggedForRequest("not an object", {}, undefined)).toBe(false);
    expect(alreadyLoggedForRequest(null, {}, undefined)).toBe(false);
  });
});
