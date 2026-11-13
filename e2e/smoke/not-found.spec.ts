import { DIR, expect, LOCALES, msg, test } from "../support/fixtures";

// Unknown addresses show the localized not-found page (app/[locale]/not-found.tsx) in the right language and
// direction, with a way back home. UI assertions only (CONVENTIONS 4).

for (const locale of LOCALES) {
  test(`/${locale}/<unknown>: localized not-found page`, async ({ page }) => {
    await page.goto(`/${locale}/this-page-does-not-exist`);
    await expect(page.getByRole("heading", { level: 1, name: msg(locale, "common.notFound.title") })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", DIR[locale]);
    // Base UI renders <Button render={<Link/>}> as <a role="button">: find the way home by its target.
    const home = page.getByRole("main").locator(`a[href="/${locale}"]`);
    await expect(home).toHaveText(msg(locale, "common.notFound.home"));
    await home.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
  });
}
