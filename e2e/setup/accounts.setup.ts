import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { ADMIN_CRED, ADMIN_STATE, E2E_DATABASE_URL, ROOT, TRAINEE_CRED, TRAINEE_STATE } from "../support/env";
import { expect, msg, test as setup, urlPath, waitForHydration } from "../support/fixtures";
import { codeFor } from "../support/mail";

// The "setup" project runs before desktop/mobile and saves two sessions (e2e/.auth, gitignored):
// - a platform admin, created by the real `pnpm db:seed-admin` (first-deploy flow, PRODUCT 6a), signed in once and
//   pushed through the forced password change;
// - a trainee who signed up and verified the address with the e-mailed code.
// Specs reuse them read-only: `test.use({ storageState: TRAINEE_STATE })`. A spec that signs out or changes the
// account creates its own user (support/auth.ts createVerifiedUser), because signing out ends the shared session.

setup("platform admin: seeded, first sign-in, forced password change", async ({ page, strongPassword }) => {
  setup.slow(); // the seed script loads lib/auth in its own process (about 15 s on a cold machine)
  const email = `e2e-admin-${randomUUID().slice(0, 8)}@example.com`;
  const initial = randomBytes(24).toString("base64url"); // test-only, random per run, never printed
  // One command string (no args array): the same `pnpm db:seed-admin` the first Railway deploy runs.
  const seed = spawnSync("pnpm db:seed-admin", {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL, ADMIN_EMAIL: email, ADMIN_INITIAL_PASSWORD: initial },
  });
  expect(seed.status, `db:seed-admin failed: ${seed.stderr}`).toBe(0);

  await page.goto("/ar/sign-in");
  await waitForHydration(page.locator("#email"));
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(initial);
  await page.getByRole("button", { name: msg("ar", "auth.signIn.submit"), exact: true }).click();
  // mustChangePassword: every page sends the user here first.
  await expect(page).toHaveURL(/\/ar\/settings\/password/);
  await expect(page.getByText(msg("ar", "auth.changePassword.required"))).toBeVisible();

  const password = strongPassword();
  await page.locator("#currentPassword").fill(initial);
  await page.locator("#newPassword").fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.getByRole("button", { name: msg("ar", "auth.changePassword.submit") }).click();
  await expect(page).toHaveURL(urlPath("/ar/dashboard"));

  // The gate is gone and the admin area renders for the platform admin (a trainee gets the not-found page there).
  await page.goto("/ar/admin", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(urlPath("/ar/admin"));
  await expect(page.getByRole("heading", { level: 1, name: msg("ar", "admin.title") })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: msg("ar", "common.notFound.title") })).toHaveCount(0);

  await page.context().storageState({ path: ADMIN_STATE });
  writeFileSync(ADMIN_CRED, JSON.stringify({ email, password, name: "admin" }));
});

setup("trainee: sign up, verify the e-mail with the code, land in the app", async ({ page, uniqueEmail, strongPassword }) => {
  const email = uniqueEmail();
  const password = strongPassword();
  const name = "متدرب اختبار";
  const since = Date.now();

  await page.goto("/ar/sign-up");
  await waitForHydration(page.locator("#name"));
  await page.locator("#name").fill(name);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: msg("ar", "auth.signUp.submit"), exact: true }).click();
  await expect(page).toHaveURL(/\/ar\/verify-email/);

  await page.locator("#otp").fill(await codeFor(email, "email-verification", since));
  await page.getByRole("button", { name: msg("ar", "auth.verifyEmail.submit"), exact: true }).click();
  await expect(page).toHaveURL(urlPath("/ar/dashboard"));
  await expect(page.getByRole("heading", { level: 1, name: msg("ar", "dashboard.title") })).toBeVisible();

  await page.context().storageState({ path: TRAINEE_STATE });
  writeFileSync(TRAINEE_CRED, JSON.stringify({ email, password, name }));
});
