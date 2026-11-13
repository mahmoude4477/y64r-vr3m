/**
 * A small, bounded JSON body reader for Route Handlers (pure Web APIs, unit-tested in http.test.ts). Use it in every
 * Route Handler that reads a JSON body, with the smallest cap its body needs:
 * `const body = await readJsonBody(request, 4096); if (!body.ok) return Response.json({ error: body.error }, { status: body.status });`
 *
 * Route Handlers have no body size limit of their own (the 1 MB limit is for Server Actions only, and proxy.ts skips
 * /api), and `await request.json()` buffers and parses whatever arrives: one signed-in user could make the server hold
 * hundreds of megabytes (security review, SEC-2). This reader refuses anything that is not `application/json` (415:
 * also stops a cross-site `text/plain` form post, which needs no CORS preflight), refuses a declared length over the
 * cap (413) before reading, and stops reading as soon as the bytes received pass the cap (413), so a missing or false
 * Content-Length does not help either.
 */

export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413 | 415; error: "invalid_input" | "too_large" | "unsupported_media_type" };

/** Default cap: 1 KiB (e.g. the simulation debrief body, `{ prompt, locale }`). Pass a larger one when a body needs it. */
export const MAX_JSON_BODY_BYTES = 1024;

const JSON_TYPE = /^application\/json\s*(?:;|$)/i;

export async function readJsonBody(request: Request, maxBytes: number = MAX_JSON_BODY_BYTES): Promise<JsonBodyResult> {
  if (!JSON_TYPE.test(request.headers.get("content-type") ?? "")) return { ok: false, status: 415, error: "unsupported_media_type" };

  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isInteger(length) || length < 0) return { ok: false, status: 400, error: "invalid_input" };
    if (length > maxBytes) return { ok: false, status: 413, error: "too_large" };
  }
  if (!request.body) return { ok: false, status: 400, error: "invalid_input" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413, error: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "invalid_input" };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown };
  } catch {
    return { ok: false, status: 400, error: "invalid_input" };
  }
}

/**
 * For handlers that pass the request on (Better Auth): the request itself, an equivalent request whose body was read
 * with a running count (when it had no Content-Length, e.g. chunked), or a 413 JSON response. A declared length over
 * the cap is refused before reading (Node's HTTP parser reads exactly Content-Length bytes, so a declared length
 * within the cap bounds the body).
 */
export async function boundedRequest(request: Request, maxBytes: number): Promise<Request | Response> {
  const tooLarge = () => Response.json({ code: "PAYLOAD_TOO_LARGE", message: "Request body too large" }, { status: 413 });
  if (!request.body || request.method === "GET" || request.method === "HEAD") return request;
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    return Number.isFinite(length) && length > maxBytes ? tooLarge() : request;
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return tooLarge();
      }
      chunks.push(value);
    }
  } catch {
    return Response.json({ code: "INVALID_BODY", message: "Could not read the request body" }, { status: 400 });
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body: bytes });
}
