/**
 * Browser calls of the scan API (use from "use client" components only). Every failure becomes a ScanApiError with a
 * stable code that scans.errors.* translates; nothing here shows text itself.
 */

export class ScanApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  constructor(code: string, status = 0, retryable?: boolean) {
    super(`scan api: ${code}`);
    this.name = "ScanApiError";
    this.code = code;
    this.status = status;
    this.retryable = retryable ?? (status === 0 || status === 429 || status >= 500);
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new ScanApiError("aborted");
    throw new ScanApiError("network");
  }
  const body = (await res.json().catch(() => null)) as (Record<string, unknown> & { error?: unknown; retryable?: unknown }) | null;
  if (!res.ok) {
    const code = typeof body?.error === "string" ? body.error : res.status === 401 ? "unauthorized" : "server_error";
    throw new ScanApiError(code, res.status, typeof body?.retryable === "boolean" ? body.retryable : undefined);
  }
  return body as T;
}

const post = <T>(path: string, data: unknown, signal?: AbortSignal) =>
  call<T>(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(data), signal });

/**
 * PUT to the presigned URL with upload progress (fetch has none). The Content-Type must be the signed one and the
 * body exactly the signed size (the browser sets Content-Length).
 */
function putWithProgress(
  url: string,
  file: Blob,
  headers: Record<string, string>,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (fraction: number) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ScanApiError("upload_failed", xhr.status, true)));
    xhr.onerror = () => reject(new ScanApiError("upload_failed", 0, true));
    xhr.ontimeout = () => reject(new ScanApiError("upload_failed", 0, true));
    xhr.onabort = () => reject(new ScanApiError("aborted"));
    if (signal) {
      if (signal.aborted) {
        reject(new ScanApiError("aborted"));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.timeout = 120_000;
    xhr.send(file);
  });
}

/** sign -> PUT -> confirm. Returns the ScanPhoto id. */
export async function uploadScanPhoto(
  photo: { file: File; width: number; height: number },
  options: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<string> {
  const signed = await post<{ url: string; key: string; headers: Record<string, string> }>(
    "/api/scans/photos/sign",
    { contentType: photo.file.type, size: photo.file.size },
    options.signal,
  );
  options.onProgress?.(0.02);
  await putWithProgress(signed.url, photo.file, signed.headers, options);
  const confirmed = await post<{ id: string }>(
    "/api/scans/photos",
    { key: signed.key, width: photo.width, height: photo.height },
    options.signal,
  );
  return confirmed.id;
}

/** Best effort: removes an upload no scan uses (keepalive so it also runs while the page unloads). */
export function discardScanPhoto(photoId: string): void {
  void fetch(`/api/scans/photos/${encodeURIComponent(photoId)}`, {
    method: "DELETE",
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}

export function createScanRequest(input: { protocolId: string; teamId: string | null; areaLabel: string; photoIds: string[] }) {
  return post<{ id: string }>("/api/scans", input);
}

export function analyzeScanRequest(scanId: string, signal?: AbortSignal) {
  return post<{ ok: true; steps: number; needsReview: number }>(`/api/scans/${encodeURIComponent(scanId)}/analyze`, {}, signal);
}

export function scanStatusRequest(scanId: string, signal?: AbortSignal) {
  return call<{ id: string; status: "draft" | "analyzing" | "review" | "finalized" | "failed" }>(
    `/api/scans/${encodeURIComponent(scanId)}`,
    { method: "GET", signal },
  );
}
