import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AUTH_DIR, BASE_URL, DIST, EMAIL_FILE_SINK, ROOT } from "./env";

/**
 * Runs once per `pnpm e2e`, in the runner process.
 * 1. Empties the e-mail sink (tests also filter by time, this only keeps the file small).
 * 2. Checks that the build matches this run: static metadata and the sitemap freeze BETTER_AUTH_URL at build time
 *    (cacheComponents), so a build for another origin would make the SEO checks fail in confusing ways.
 */
export default function globalSetup() {
  mkdirSync(path.dirname(EMAIL_FILE_SINK), { recursive: true });
  writeFileSync(EMAIL_FILE_SINK, "");
  mkdirSync(AUTH_DIR, { recursive: true });

  const sitemap = path.join(ROOT, DIST, "server", "app", "sitemap.xml.body");
  if (existsSync(sitemap) && !readFileSync(sitemap, "utf8").includes(`${BASE_URL}/`)) {
    throw new Error(
      `${DIST} was built for another origin. Rebuild for this run:\n` +
        `  NEXT_DIST_DIR=${DIST} BETTER_AUTH_URL=${BASE_URL} EMAIL_PROVIDER=file WAQAYA_E2E=1 pnpm build`,
    );
  }
}
