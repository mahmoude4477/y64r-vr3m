import path from "node:path";

// Shared by playwright.config.ts, the setup project and the specs (the config is evaluated in every process).

/** Repository root (e2e/support/../..). */
export const ROOT = path.resolve(__dirname, "..", "..");

export const CI = !!process.env.CI;

/** next start port: 3100 in CI; agents pick their own (E2E_PORT=3102 …). */
export const PORT = Number(process.env.E2E_PORT ?? 3100);

/** 127.0.0.1, never "localhost": Better Auth compares the request Origin with BETTER_AUTH_URL (CSRF check). */
export const BASE_URL = `http://127.0.0.1:${PORT}`;

/** A separate database: dev data stays clean (`docker exec waqaya-postgres createdb -U waqaya waqaya_e2e`). */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://waqaya:waqaya_dev@127.0.0.1:5434/waqaya_e2e";

/** The e2e e-mail sink (lib/email EMAIL_PROVIDER=file): one JSON line per message, read by support/mail.ts. */
export const EMAIL_FILE_SINK = process.env.EMAIL_FILE_SINK ?? path.join(ROOT, ".e2e", "mail.jsonl");

/** Saved sessions and credentials written by the setup project (gitignored, random per run, test-only). */
export const AUTH_DIR = path.join(ROOT, "e2e", ".auth");
export const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");
export const ADMIN_CRED = path.join(AUTH_DIR, "admin-cred.json");
export const TRAINEE_STATE = path.join(AUTH_DIR, "trainee.json");
export const TRAINEE_CRED = path.join(AUTH_DIR, "trainee-cred.json");

/** The build `next start` serves: NEXT_DIST_DIR (agents: .next-<name>), else .next in CI and .next-e2e locally. */
export const DIST = process.env.NEXT_DIST_DIR ?? (CI ? ".next" : ".next-e2e");
