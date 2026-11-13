/**
 * Review action failures -> message keys in the "scans" namespace (pure, unit-tested). An unknown code falls back to the
 * generic text, so a new server code never shows a raw identifier.
 */
export const REVIEW_ERROR_KEYS = [
  "errors.network",
  "errors.forbidden",
  "errors.notFound",
  "errors.analysisRunning",
  "errors.slowDown",
  "errors.generic",
  "detail.errors.finalized",
  "detail.errors.incomplete",
] as const;
export type ReviewErrorKey = (typeof REVIEW_ERROR_KEYS)[number];

const MAP: Record<string, ReviewErrorKey> = {
  network: "errors.network",
  forbidden: "errors.forbidden",
  not_found: "errors.notFound",
  analysis_running: "errors.analysisRunning",
  slow_down: "errors.slowDown",
  finalized: "detail.errors.finalized",
  incomplete: "detail.errors.incomplete",
};

export function reviewErrorKey(code: string | null | undefined): ReviewErrorKey {
  return (code && MAP[code]) || "errors.generic";
}

/** A Server Action call that threw (offline, a new deployment, a crash) is reported as "network". */
export async function callAction<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | { ok: false; error: "network" }> {
  try {
    // No value at all (the router took over, e.g. a redirect to sign-in): treat it like a lost connection.
    return (await fn()) ?? { ok: false, error: "network" };
  } catch (e) {
    if (isRedirect(e)) throw e;
    return { ok: false, error: "network" };
  }
}

/** Next's redirect (session expired -> sign-in): the router is already navigating. */
export function isRedirect(e: unknown): boolean {
  return typeof e === "object" && e !== null && String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");
}
