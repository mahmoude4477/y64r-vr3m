import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, CI, DIST, E2E_DATABASE_URL, EMAIL_FILE_SINK, PORT, ROOT } from "./e2e/support/env";

/**
 * End-to-end tests (note 09 §3; e2e/README.md). `pnpm e2e` runs them against a production build served by
 * `next start` on 127.0.0.1:<E2E_PORT> with its own database and an e-mail file sink.
 *
 * Build first, with the SAME values the server gets (cacheComponents freezes them into static shells):
 *   NEXT_DIST_DIR=.next-e2e BETTER_AUTH_URL=http://127.0.0.1:3100 EMAIL_PROVIDER=file WAQAYA_E2E=1 \
 *     ANTHROPIC_API_KEY= pnpm build
 *   NEXT_DIST_DIR=.next-e2e pnpm e2e
 * CI does this in .github/workflows/ci.yml (dist ".next", port 3100).
 *
 * Browsers: CI installs Playwright's own headless shell. Locally nothing is downloaded: Edge (E2E_CHANNEL=msedge,
 * the default) or a cached Chromium (E2E_CHROMIUM_PATH=…/chrome.exe).
 */

// Same path in the runner, the workers and the server: the server writes it, support/mail.ts reads it.
process.env.EMAIL_FILE_SINK = EMAIL_FILE_SINK;

/**
 * The test server's auth secret. CI sets a fresh one per run. Locally a random one is kept in .e2e/auth-secret
 * (gitignored), so sessions saved by the setup project stay valid across runs (`--no-deps` reruns).
 */
function authSecret(): string {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const file = path.join(ROOT, ".e2e", "auth-secret");
  try {
    const saved = readFileSync(file, "utf8").trim();
    if (saved.length >= 32) return saved;
  } catch {
    // first run: create it below
  }
  const secret = randomBytes(32).toString("base64url");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, secret);
  return secret;
}

const browser = CI
  ? {}
  : process.env.E2E_CHROMIUM_PATH
    ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH } }
    : { channel: process.env.E2E_CHANNEL ?? "msedge" };

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results",
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0, // a retried pass shows as "flaky" in the report
  workers: CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "ar-SA",
    timezoneId: "Asia/Riyadh",
    trace: CI ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // Seeds the platform admin (forced password change) and signs up a trainee; saves both sessions (e2e/.auth).
    { name: "setup", testMatch: /setup\/.*\.setup\.ts/, use: { ...devices["Desktop Chrome"], ...browser } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...browser }, dependencies: ["setup"] },
    {
      name: "mobile", // scans happen on phones: 390 px wide, touch, mobile user agent
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, ...browser },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // node directly, like the Railway start command (a package manager as PID 1 swallows SIGTERM), with its
    // --keepAliveTimeout: with Node's 5 s default a test that reused an API connection idle for ~5 s raced the server
    // closing it and failed with ECONNRESET (finish-round fix review).
    // -H 127.0.0.1: the test server (random auth secret, file e-mail sink) is never reachable from the network.
    command: "node node_modules/next/dist/bin/next start -H 127.0.0.1 --keepAliveTimeout 70000",
    url: `${BASE_URL}/api/health`, // ready only when the database answers (503 until then)
    reuseExistingServer: false, // a dev server on that port would have the wrong environment
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    ...(process.platform !== "win32" && { gracefulShutdown: { signal: "SIGTERM" as const, timeout: 10_000 } }),
    // Playwright passes { ...process.env, ...env }: these win, also over .env.local (@next/env never overrides a set
    // variable, even an empty one).
    env: {
      PORT: String(PORT),
      NEXT_DIST_DIR: DIST,
      DATABASE_URL: E2E_DATABASE_URL,
      BETTER_AUTH_URL: BASE_URL,
      BETTER_AUTH_SECRET: authSecret(),
      EMAIL_PROVIDER: "file",
      EMAIL_FILE_SINK,
      WAQAYA_E2E: "1",
      // Never reach real providers from tests, even when .env.local has keys.
      ANTHROPIC_API_KEY: "",
      CLOUDFLARE_ACCOUNT_ID: "",
      CLOUDFLARE_EMAIL_API_TOKEN: "",
      S3_ENDPOINT: "",
      S3_BUCKET: "",
      S3_ACCESS_KEY_ID: "",
      S3_SECRET_ACCESS_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
      LOG_LEVEL: "info",
      // Scan flow seams (e2e/README.md): photos on the local disk and a deterministic AI stub instead of S3 and Claude.
      // Opt-in with E2E_SCAN_SEAMS=1; both refuse to run outside a flagged loopback e2e server (lib/storage, lib/ai/model).
      ...(process.env.E2E_SCAN_SEAMS === "1"
        ? { STORAGE_PROVIDER: "file", STORAGE_FILE_DIR: path.join(ROOT, ".e2e", "storage"), AI_PROVIDER: "stub" }
        : { STORAGE_PROVIDER: "", AI_PROVIDER: "" }),
    },
  },
});
