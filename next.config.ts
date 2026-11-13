import { readdirSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { headerRules, securityOptionsFromEnv } from "./lib/security-headers";

// Security headers on every response (lib/security-headers.ts, note 07). Fixed at BUILD time: after changing
// S3_*, BETTER_AUTH_URL or the Railway environment, rebuild. /api/health compares CSP_BUCKET_ORIGIN (inlined
// below at build) with the runtime S3_* values and reports `checks.csp`.
const security = securityOptionsFromEnv();
if (!security.dev && process.env.RAILWAY_ENVIRONMENT_NAME && !security.bucket) {
  console.warn("[csp] S3_ENDPOINT/S3_BUCKET not set at build time: browser photo uploads will be blocked by the CSP");
}

// Typed ICU arguments for every Arabic message file; new feature files are picked up automatically.
const arDir = path.join(__dirname, "messages", "ar");
const sourceMessages = readdirSync(arDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => `./messages/ar/${f}`);

const withNextIntl = createNextIntlPlugin({
  requestConfig: "./i18n/request.ts",
  experimental: { createMessagesDeclaration: sourceMessages },
});

const nextConfig: NextConfig = {
  // Parallel agents/CI jobs build into their own folder (NEXT_DIST_DIR=.next-<name>); unset = ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true, // every session/DB read must sit inside <Suspense>
  partialPrefetching: true, // must be set explicitly next to cacheComponents
  reactCompiler: false,
  typedRoutes: true,
  poweredByHeader: false,
  // Pin the root: the parent folder has a stray package.json / pnpm-lock.yaml / pnpm-workspace.yaml.
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
    // Tailwind 4 through Turbopack's loader (no postcss.config.mjs)
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
  // No serverActions.bodySizeLimit: photos never go through a Server Action (presigned PUT, crosscheck D9/D17).
  env: { CSP_BUCKET_ORIGIN: security.bucket ?? "" }, // build-time value, compared at runtime by /api/health
  async headers() {
    return headerRules(security);
  },
};

export default withNextIntl(nextConfig);
