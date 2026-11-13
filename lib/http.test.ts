import { describe, expect, it } from "vitest";
import { boundedRequest, MAX_JSON_BODY_BYTES, readJsonBody } from "./http";

/** The bounded JSON reader of the feature's Route Handlers (SEC-2: no unbounded request.json()). */

const JSON_HEADERS = { "content-type": "application/json" };

function post(body: BodyInit | null, headers: Record<string, string> = JSON_HEADERS) {
  return new Request("http://127.0.0.1/api/x", { method: "POST", headers, body, duplex: "half" } as RequestInit);
}

/** A streamed body (no Content-Length), sent in `chunks` pieces of `size` bytes. */
function streamed(chunks: number, size: number) {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunks) return controller.close();
      sent++;
      controller.enqueue(new Uint8Array(size).fill(0x61));
    },
  });
}

describe("readJsonBody", () => {
  it("parses a small JSON body", async () => {
    expect(await readJsonBody(post(JSON.stringify({ locale: "ar" })))).toEqual({ ok: true, value: { locale: "ar" } });
    expect(await readJsonBody(post("{}", { "content-type": "application/json; charset=utf-8" }))).toEqual({ ok: true, value: {} });
  });

  it("refuses anything that is not application/json", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/jsonp"]) {
      expect(await readJsonBody(post("{}", { "content-type": type }))).toMatchObject({ ok: false, status: 415 });
    }
    expect(await readJsonBody(post("{}", {}))).toMatchObject({ ok: false, status: 415 });
  });

  it("refuses a declared length over the cap before reading, and a bad declared length", async () => {
    const declared = post("{}", { ...JSON_HEADERS, "content-length": String(MAX_JSON_BODY_BYTES + 1) });
    expect(await readJsonBody(declared)).toMatchObject({ ok: false, status: 413, error: "too_large" });
    expect(await readJsonBody(post("{}", { ...JSON_HEADERS, "content-length": "-1" }))).toMatchObject({ ok: false, status: 400 });
  });

  it("stops reading a streamed body once it passes the cap (no Content-Length to trust)", async () => {
    const r = await readJsonBody(post(streamed(1000, 512)));
    expect(r).toMatchObject({ ok: false, status: 413 });
  });

  it("refuses an empty, broken or non-UTF-8 body", async () => {
    expect(await readJsonBody(post(null))).toMatchObject({ ok: false, status: 400 });
    expect(await readJsonBody(post("not json"))).toMatchObject({ ok: false, status: 400 });
    expect(await readJsonBody(post(new Uint8Array([0x22, 0xff, 0x22])))).toMatchObject({ ok: false, status: 400 });
  });

  it("takes a body of exactly the cap", async () => {
    const value = "a".repeat(MAX_JSON_BODY_BYTES - 2);
    expect(await readJsonBody(post(JSON.stringify(value)))).toEqual({ ok: true, value });
  });
});

describe("boundedRequest", () => {
  const big = (n: number) => new Uint8Array(n).fill(97);
  it("passes small and bodiless requests through, refuses a declared length over the cap", async () => {
    const get = new Request("http://x/api/auth/get-session");
    expect(await boundedRequest(get, 10)).toBe(get);
    const small = new Request("http://x/a", { method: "POST", body: "{}", headers: { "content-length": "2" } });
    expect(await boundedRequest(small, 10)).toBe(small);
    const declared = new Request("http://x/a", { method: "POST", body: "{}", headers: { "content-length": "11" } });
    const refused = await boundedRequest(declared, 10);
    expect(refused).toBeInstanceOf(Response);
    expect((refused as Response).status).toBe(413);
  });
  it("counts a body without Content-Length and rebuilds the request when it fits", async () => {
    const stream = (n: number) =>
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(big(n));
          c.close();
        },
      });
    const over = new Request("http://x/a", { method: "POST", body: stream(11), duplex: "half" } as RequestInit);
    expect(((await boundedRequest(over, 10)) as Response).status).toBe(413);
    const fits = (await boundedRequest(new Request("http://x/a", { method: "POST", body: stream(10), duplex: "half" } as RequestInit), 10)) as Request;
    expect(fits).toBeInstanceOf(Request);
    expect(await fits.text()).toBe("a".repeat(10));
  });
});
