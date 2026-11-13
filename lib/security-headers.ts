// Security headers for every response (note 07 §1, PRODUCT 9 "Security"). Pure: no "@/" imports and no
// "server-only", because next.config.ts loads this file outside the bundler. headers() in next.config.ts is
// evaluated at BUILD time (next start serves them from the routes manifest): changing S3_*, BETTER_AUTH_URL or
// RAILWAY_ENVIRONMENT_NAME needs a rebuild, not a restart.
//
// Rules (CONVENTIONS 9):
// - CSP option (b) of note 07: a fixed policy with 'unsafe-inline' scripts. Cache Components / partial
//   prerendering serves static shells without nonces, so a nonce policy would break hydration. NEVER add a
//   nonce or hash next to 'unsafe-inline' in script-src: browsers then ignore 'unsafe-inline' and every inline
//   flight-data script of Next is blocked.
// - No third-party scripts, styles, fonts, frames or fetch targets. A new external origin is a foundation change
//   here, with a reason. Never 'unsafe-eval' in production (dev only, for React's dev tooling).
// - The only external origin is the photo bucket, as an EXACT origin (never *.t3.storageapi.dev: a wildcard
//   would let injected code PUT into any Railway bucket).

type Env = Record<string, string | undefined>;

export type SecurityHeaderOptions = {
  /** next dev (NODE_ENV=development): adds 'unsafe-eval', drops HSTS. */
  dev: boolean;
  /** BETTER_AUTH_URL is https: HSTS + upgrade-insecure-requests. */
  https: boolean;
  /** Exact photo bucket origin, or null when storage is not configured. */
  bucket: string | null;
  /** false = staging / local / CI: X-Robots-Tag noindex on every response. */
  indexable: boolean;
};

/** Origin the browser PUTs / GETs photos to. Same rule as the AWS SDK: virtual-hosted unless S3_URL_STYLE=path. */
export function bucketOrigin(env: Env = process.env): string | null {
  const endpoint = env.S3_ENDPOINT?.trim();
  const bucket = env.S3_BUCKET?.trim();
  if (!endpoint || !bucket) return null;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  return env.S3_URL_STYLE?.trim() === "path" ? u.origin : `${u.protocol}//${bucket}.${u.host}`;
}

export const isHttpsApp = (env: Env = process.env) => (env.BETTER_AUTH_URL ?? "").trim().startsWith("https://");

/**
 * Only the Railway "production" environment may be indexed. Staging, PR environments, local and CI builds send
 * X-Robots-Tag: noindex (and app/robots.ts disallows everything there). Railway passes its provided variables,
 * RAILWAY_ENVIRONMENT_NAME included, to the build (docs: "How Railway injects variables").
 */
export const isIndexableEnvironment = (env: Env = process.env) => env.RAILWAY_ENVIRONMENT_NAME?.trim() === "production";

export function contentSecurityPolicy(o: Pick<SecurityHeaderOptions, "dev" | "https" | "bucket">): string {
  const b = o.bucket ? ` ${o.bucket}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${o.dev ? " 'unsafe-eval'" : ""}`, // NEVER a nonce/hash here (see above)
    "style-src 'self' 'unsafe-inline'", // React style attributes, Base UI positioning, chart.tsx <style>, sonner
    `img-src 'self' blob: data:${b}`, // blob: photo previews; the bucket after the photo route's 302
    "font-src 'self'", // next/font self-hosts IBM Plex
    `connect-src 'self'${b}`, // presigned PUT; 'self' also covers the dev HMR websocket
    "media-src 'self' blob:", // a blob: preview of a captured clip (a camera MediaStream srcObject is not URL-checked)
    "manifest-src 'self'",
    "worker-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(o.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** camera only for our own origin (scans happen on phones); everything else off. */
export const PERMISSIONS_POLICY = [
  "camera=(self)",
  "microphone=()",
  "geolocation=()",
  "display-capture=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "hid=()",
  "bluetooth=()",
  "midi=()",
  "accelerometer=()",
  "gyroscope=()",
  "magnetometer=()",
  "browsing-topics=()",
  "publickey-credentials-get=(self)", // keeps passkeys possible later
  "fullscreen=(self)",
].join(", ");

export const HSTS_VALUE = "max-age=63072000; includeSubDomains"; // 2 years; no `preload` until the domain is decided
export const NOINDEX_VALUE = "noindex, nofollow";

export type HeaderEntry = { key: string; value: string };

/** The headers sent on EVERY response (pages, redirects, /api/*, static files, 404s). */
export function securityHeaders(o: SecurityHeaderOptions): HeaderEntry[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(o) },
    ...(o.https && !o.dev ? [{ key: "Strict-Transport-Security", value: HSTS_VALUE }] : []),
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Same-origin requests keep the full Referer: Better Auth's error-language detection reads its path.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" }, // "same-origin-allow-popups" if OAuth popups come
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Origin-Agent-Cluster", value: "?1" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    ...(o.indexable ? [] : [{ key: "X-Robots-Tag", value: NOINDEX_VALUE }]),
  ];
}

/** Brand images other sites and mail clients may embed (Open Graph, icons): a later rule wins for the same key. */
export const PUBLIC_BRAND_HEADERS: HeaderEntry[] = [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }];

/** The full headers() list for next.config.ts. Source patterns keep "\\." (a lost backslash = "any character"). */
export function headerRules(o: SecurityHeaderOptions) {
  return [
    { source: "/:path*", headers: securityHeaders(o) },
    {
      source: "/:dir(og|icons)/:path*",
      headers: [...PUBLIC_BRAND_HEADERS, { key: "Cache-Control", value: "public, max-age=86400" }],
    },
    { source: "/:file(icon\\.svg|apple-icon\\.png|favicon\\.ico)", headers: PUBLIC_BRAND_HEADERS },
  ];
}

/** Options from the environment (what next.config.ts uses). */
export function securityOptionsFromEnv(env: Env = process.env): SecurityHeaderOptions {
  return {
    dev: env.NODE_ENV === "development", // "production" during next build (note 07, verified)
    https: isHttpsApp(env),
    bucket: bucketOrigin(env),
    indexable: isIndexableEnvironment(env),
  };
}
