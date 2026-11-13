/**
 * pnpm jobs:purge-photos — the daily retention job (Railway cron service "photo-purge", 15 0 * * * UTC,
 * restart policy NEVER; note 09 §1.6). Runs with --conditions=react-server so lib/settings.ts ("server-only")
 * can be imported. It must EXIT when done (Railway skips the next run while one is still active).
 *
 * PLACEHOLDER (foundation). OWNER: scans team — replace step 2 with the real purge:
 *   a. photos of scans finalised more than `retentionDays` ago (Scan.status = finalized, Scan.finalizedAt;
 *      index scan(status, finalizedAt)),
 *   b. ScanPhoto rows never attached to a scan (scanId null) older than 24 h,
 *   c. weekly: bucket objects under the photo prefix with no row, older than 24 h (failed confirms).
 *   Delete the bucket object first, then the row of each key that was deleted (a failed object delete keeps
 *   its row for the next run). Batched, idempotent, `PURGE_DRY_RUN=1` = count only. Log counts, never keys.
 *
 * Today it only reads the retention setting (strict: an invalid value stops the job) and prunes old
 * app_rate_limit rows. It deletes no photo.
 */
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const { prisma } = await import("../lib/prisma");
const { getPhotoRetentionDays } = await import("../lib/settings");
const { pruneAppRateLimits } = await import("../lib/app-rate-limit");
// One JSON line per event on stdout (Railway log explorer: @event:job.photo_purge.done), redacted like the app's.
const { log } = await import("../lib/log");

const started = Date.now();
let exitCode = 0;
try {
  // 1. Retention (admin setting -> PHOTO_RETENTION_DAYS -> 90). Throws on an invalid value.
  const retentionDays = await getPhotoRetentionDays();
  // 2. TODO(scans): purge photos (see the header). Nothing is deleted yet.
  const photos = { expired: 0, unattached: 0, orphans: 0, placeholder: true };
  // 3. Durable rate-limit rows whose window started more than 2 days ago (note 08, 2.8).
  const rateLimitRowsPruned = await pruneAppRateLimits(2);
  log.info("job.photo_purge.done", { retentionDays, ...photos, rateLimitRowsPruned, ms: Date.now() - started });
} catch (err) {
  exitCode = 1;
  log.error("job.photo_purge.failed", { err, ms: Date.now() - started });
} finally {
  await prisma.$disconnect();
}
process.exit(exitCode);
