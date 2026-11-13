/**
 * pnpm db:bootstrap — Railway pre-deploy step, after `pnpm db:deploy` (note 09 §1.11, docs/DEPLOY.md):
 *   pre-deploy command:  pnpm db:deploy && pnpm db:bootstrap
 *
 * Idempotent; safe on every deploy:
 * 1. Global content (protocols) is seeded ONLY when the database has none. The seed overwrites protocol content, so
 *    running it on every deploy would undo the admin panel's edits; after the first deploy the admin panel owns it.
 *    Later seed updates are run on purpose: `railway ssh --service web -- pnpm db:seed`.
 * 2. The first platform admin is created ONLY when no platform admin exists yet and ADMIN_EMAIL and
 *    ADMIN_INITIAL_PASSWORD are both set (`pnpm db:seed-admin`, which never touches an existing account). Delete
 *    ADMIN_INITIAL_PASSWORD once the admin has signed in and changed the password.
 * A failure exits non-zero, so Railway stops the deploy and keeps the previous version serving.
 * Never prints secrets: only counts and decisions, as JSON log lines (lib/log.ts).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const { log } = await import("../lib/log");
const { prisma } = await import("../lib/prisma");

/** Runs another package script with the same environment; stops the deploy when it fails. */
function run(script: "db:seed" | "db:seed-admin") {
  const started = Date.now();
  // One command string (no args array): works the same with the Windows shell and on Linux.
  const result = spawnSync(`pnpm ${script}`, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    log.error("deploy.bootstrap.step_failed", { script, status: result.status, ms: Date.now() - started });
    throw new Error(`${script} failed`);
  }
  log.info("deploy.bootstrap.step_done", { script, ms: Date.now() - started });
}

let exitCode = 0;
try {
  const globals = await prisma.protocol.count({ where: { organizationId: null } });
  if (globals === 0) {
    log.info("deploy.bootstrap.seed", { reason: "no global protocols yet" });
    run("db:seed");
  } else {
    log.info("deploy.bootstrap.seed_skipped", { globalProtocols: globals, reason: "content exists; edit it in /admin" });
  }

  // The FIRST admin only: once any platform admin exists, a left-over ADMIN_INITIAL_PASSWORD can never bring a
  // deleted or removed admin account back on the next deploy (review round 1).
  const admins = await prisma.user.count({ where: { role: { contains: "admin" } } });
  if (admins > 0) {
    log.info("deploy.bootstrap.admin_skipped", { reason: "a platform admin exists", admins });
  } else if (process.env.ADMIN_EMAIL?.trim() && process.env.ADMIN_INITIAL_PASSWORD) {
    run("db:seed-admin"); // never promotes or changes an existing account
  } else {
    log.info("deploy.bootstrap.admin_skipped", { reason: "ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD are not both set" });
  }
  log.info("deploy.bootstrap.done");
} catch (err) {
  exitCode = 1;
  log.error("deploy.bootstrap.failed", { err });
} finally {
  await prisma.$disconnect();
}
process.exit(exitCode);
