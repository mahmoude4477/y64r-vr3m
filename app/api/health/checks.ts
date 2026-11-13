import { bucketOrigin } from "@/lib/security-headers";

// Health checks used by app/api/health/route.ts and instrumentation.ts (note 09 §5, note 07 §1.3). No Prisma
// import here: the database query is passed in, so this file stays cheap to load and easy to test.

export type DbStatus = "ok" | "error" | "timeout";
export type DbCheck = { status: DbStatus; latencyMs: number };

/** Runs `query` with a hard timeout. Never throws. (The pg pool's 5 s connect timeout does not cover a hung query.) */
export async function checkDatabase(query: () => Promise<unknown>, timeoutMs: number): Promise<DbCheck> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const status = await Promise.race<DbStatus>([
    Promise.resolve()
      .then(query)
      .then(
        () => "ok" as const,
        () => "error" as const,
      ),
    new Promise<DbStatus>((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  return { status, latencyMs: Math.round(performance.now() - started) };
}

/**
 * Caches one check result for `ttlMs` and shares an in-flight check between concurrent callers, so hammering
 * /api/health costs at most one database round trip per `ttlMs`. `onFresh` sees every new result (for logging).
 */
export function cachedCheck<T>(
  run: () => Promise<T>,
  ttlMs: number,
  onFresh?: (result: T, previous: T | undefined) => void,
  now: () => number = Date.now,
): () => Promise<T> {
  let last: { at: number; value: T } | undefined;
  let inFlight: Promise<T> | undefined;
  return () => {
    if (last && now() - last.at <= ttlMs) return Promise.resolve(last.value);
    inFlight ??= run()
      .then((value) => {
        onFresh?.(value, last?.value);
        last = { at: now(), value };
        return value;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };
}

/**
 * "ok" when the CSP built into this deployment allows the bucket the runtime S3_* variables point at, else "stale"
 * (S3_* changed after the build: browser photo uploads are blocked until a rebuild). CSP_BUCKET_ORIGIN is inlined
 * at build time by next.config.ts `env`; bucketOrigin() reads the runtime variables. Reported, never fatal: a stale
 * CSP breaks uploads, not the site.
 */
export function cspStatus(builtOrigin: string | undefined = process.env.CSP_BUCKET_ORIGIN): "ok" | "stale" {
  return (builtOrigin ?? "") === (bucketOrigin() ?? "") ? "ok" : "stale";
}
