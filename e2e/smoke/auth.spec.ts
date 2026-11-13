import { authPost, createVerifiedUser, signInWithForm, signOutWithMenu } from "../support/auth";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import { codeFor } from "../support/mail";

// The account flows every visitor goes through: sign up → e-mailed code → the app, sign in, sign out.
// Each test makes its own account (signing out ends a session for good).

test("sign up in English, verify with the e-mailed code, land on the dashboard", async ({ page, uniqueEmail, strongPassword }) => {
  const email = uniqueEmail();
  const since = Date.now();
  await page.goto("/en/sign-up");
  await waitForHydration(page.locator("#name"));
  await page.locator("#name").fill("E2E Trainee");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(strongPassword());
  await page.getByRole("button", { name: msg("en", "auth.signUp.submit"), exact: true }).click();

  await expect(page).toHaveURL(/\/en\/verify-email/);
  // The code arrives through the e2e e-mail sink (lib/email EMAIL_PROVIDER=file), the same way a real e-mail would.
  const code = await codeFor(email, "email-verification", since);
  await page.locator("#otp").fill(code);
  await page.getByRole("button", { name: msg("en", "auth.verifyEmail.submit"), exact: true }).click();

  await expect(page).toHaveURL(urlPath("/en/dashboard"));
  await expect(page.getByRole("heading", { level: 1, name: msg("en", "dashboard.title") })).toBeVisible();
  await expect(page.getByRole("button", { name: msg("en", "nav.userMenu.label") })).toBeVisible();
});

test("a wrong code is refused and nothing is signed in", async ({ page, uniqueEmail, strongPassword }) => {
  const email = uniqueEmail();
  const since = Date.now();
  const signUp = await authPost(page.request, "/sign-up/email", { name: "E2E", email, password: strongPassword(), locale: "ar" });
  expect(signUp.ok()).toBe(true);
  const code = await codeFor(email, "email-verification", since);

  // page.request shares the browser's cookies: if the wrong code signed anyone in, the dashboard would open below.
  const verify = await authPost(page.request, "/email-otp/verify-email", { email, otp: code === "000000" ? "111111" : "000000" });
  expect(verify.status()).toBe(400);
  await page.goto("/ar/dashboard");
  await expect(page).toHaveURL(/\/ar\/sign-in\?callbackUrl=/);
});

test("sign in with the form, then sign out from the account menu", async ({ page, request, uniqueEmail, strongPassword }) => {
  // `request` is separate from the browser: the page is still signed out after the account is created.
  const account = await createVerifiedUser(request, { email: uniqueEmail(), password: strongPassword() });

  await signInWithForm(page, account);
  await expect(page.getByRole("heading", { level: 1, name: msg("ar", "dashboard.title") })).toBeVisible();

  await signOutWithMenu(page);
  // The session is gone: the app sends the visitor back to sign-in.
  await page.goto("/ar/dashboard");
  await expect(page).toHaveURL(/\/ar\/sign-in\?callbackUrl=%2Far%2Fdashboard$/);
});

test("a wrong password shows an error and stays on sign-in", async ({ page, request, uniqueEmail, strongPassword }) => {
  const account = await createVerifiedUser(request, { email: uniqueEmail(), password: strongPassword() });
  await page.goto("/ar/sign-in");
  await waitForHydration(page.locator("#email"));
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(`${account.password}-wrong`);
  await page.getByRole("button", { name: msg("ar", "auth.signIn.submit"), exact: true }).click();
  // The form's own error (Next's route announcer also has role=alert).
  await expect(page.locator('[data-slot="alert"][role="alert"]')).toBeVisible();
  await expect(page).toHaveURL(urlPath("/ar/sign-in"));
});
