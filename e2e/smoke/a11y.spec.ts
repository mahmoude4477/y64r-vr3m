import { expectAccessible } from "../support/a11y";
import { TRAINEE_STATE } from "../support/env";
import { expect, msg, test } from "../support/fixtures";

// Automated accessibility (axe, WCAG 2.2 A/AA): serious and critical violations fail, plus one h1 and one main per
// page (support/a11y.ts). Both projects run these, so every page is checked at desktop width and at 390 px.

const PUBLIC_PAGES = ["/ar", "/en", "/ar/sign-in", "/en/sign-in", "/ar/sign-up", "/en/sign-up", "/ar/account-deleted", "/en/account-deleted"];

for (const path of PUBLIC_PAGES) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${path} (${scheme})`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      // next-themes follows the system setting by default (defaultTheme "system").
      if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await expectAccessible(page, testInfo, { label: scheme });
    });
  }
}

test.describe("signed in", () => {
  test.use({ storageState: TRAINEE_STATE });
  // Load, streamed data, fonts and a full WCAG 2.2 scan of the app shell: 20-30 s under the default workers.
  // Slow (3 x 30 s), so a busy machine never fails an accessibility test on time alone (review round 2).
  test.slow();

  for (const path of ["/ar/dashboard", "/en/dashboard"]) {
    for (const scheme of ["light", "dark"] as const) {
      test(`${path} (${scheme})`, async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
        await expectAccessible(page, testInfo, { label: scheme });
      });
    }
  }

  // The first step of "delete my account" (its destructive button). Read-only: nothing is sent.
  // The code step is checked in e2e/account/delete.spec.ts with a throwaway account.
  for (const locale of ["ar", "en"] as const) {
    for (const scheme of ["light", "dark"] as const) {
      test(`/${locale}/settings/delete-account (${scheme})`, async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`/${locale}/settings/delete-account`);
        await expect(page.getByRole("button", { name: msg(locale, "auth.deleteAccount.sendCode") })).toBeVisible();
        if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
        await expectAccessible(page, testInfo, { label: scheme });
      });
    }
  }
});
