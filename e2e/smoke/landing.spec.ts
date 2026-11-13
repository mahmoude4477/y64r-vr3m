import { DIR, expect, LOCALES, msg, test, urlPath } from "../support/fixtures";

// The public landing page in both languages: Arabic is the default and right-to-left, English left-to-right,
// nothing scrolls sideways (phones), and the bare domain goes to Arabic.

for (const locale of LOCALES) {
  test(`/${locale}: lang=${locale}, dir=${DIR[locale]}, one h1, no sideways scroll`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", locale);
    await expect(html).toHaveAttribute("dir", DIR[locale]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page).toHaveTitle(`${msg(locale, "landing.meta.title")} | ${msg(locale, "meta.title")}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
  });

  test(`/${locale}: the sign-up call to action opens the sign-up page`, async ({ page }) => {
    await page.goto(`/${locale}`);
    // Navigation is a real link (CONVENTIONS 9: <Link className={buttonVariants()}>), never <a role="button">.
    const cta = page.locator("section[aria-labelledby=hero-title]").getByRole("link", { name: msg(locale, "landing.hero.primaryCta") });
    await expect(cta).toHaveAttribute("href", `/${locale}/sign-up`);
    await expect(cta).toHaveText(msg(locale, "landing.hero.primaryCta"));
    await cta.click();
    await expect(page).toHaveURL(urlPath(`/${locale}/sign-up`));
    await expect(page.locator("#email")).toBeVisible();
  });
}

test("the bare domain redirects to Arabic", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(urlPath("/ar"));
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
