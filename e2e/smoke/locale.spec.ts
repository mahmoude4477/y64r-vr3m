import { createVerifiedUser } from "../support/auth";
import { expect, msg, test, urlPath } from "../support/fixtures";

// The language switch keeps the visitor on the same page (and moves a callbackUrl to the new language too).
// It is a full page load on purpose (the root layout's lang/dir change).

test("guest: switching language on sign-in keeps the page and the callback", async ({ page }) => {
  await page.goto("/ar/sign-in?callbackUrl=%2Far%2Fprotocols");
  await page.getByRole("button", { name: msg("ar", "common.localeSwitcher.label") }).click();
  await expect(page).toHaveURL(urlPath("/en/sign-in?callbackUrl=%2Fen%2Fprotocols"));
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("button", { name: msg("en", "auth.signIn.submit"), exact: true })).toBeVisible();
});

test("guest: switching back from English on the landing page", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: msg("en", "common.localeSwitcher.label") }).click();
  await expect(page).toHaveURL(urlPath("/ar"));
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("signed in: switching language inside the app keeps the page", async ({ page, uniqueEmail, strongPassword }) => {
  // Own account: the switch also saves user.locale.
  await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword() });
  await page.goto("/ar/protocols");
  await expect(page).toHaveURL(urlPath("/ar/protocols"));
  await page.getByRole("button", { name: msg("ar", "common.localeSwitcher.label") }).click();
  await expect(page).toHaveURL(urlPath("/en/protocols"));
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: msg("en", "protocols.title") })).toBeVisible();
});
