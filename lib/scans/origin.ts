/**
 * Cross-site request check for the scan API (pure, unit-tested). Browsers send Sec-Fetch-Site on every request
 * (Chrome, Edge, Firefox, Safari 16.4+); older ones still send Origin on a cross-origin POST. A request with neither
 * header does not come from another site's page (a non-browser client), so it is allowed: the session cookie still
 * has to be valid.
 */
type Env = Record<string, string | undefined>;

/** BETTER_AUTH_URL plus BETTER_AUTH_TRUSTED_ORIGINS (the same list Better Auth trusts). */
export function appOrigins(env: Env = process.env): string[] {
  const out = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value?.trim()) return;
    try {
      out.add(new URL(value.trim()).origin);
    } catch {
      // ignore malformed entries
    }
  };
  add(env.BETTER_AUTH_URL);
  for (const o of (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",")) add(o);
  return [...out];
}

export function requestOriginAllowed(headers: Headers, env: Env = process.env): boolean {
  const site = headers.get("sec-fetch-site")?.toLowerCase();
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = headers.get("origin");
  if (!origin || site === "same-origin") return true;
  if (origin === "null") return false;
  return appOrigins(env).includes(origin);
}
