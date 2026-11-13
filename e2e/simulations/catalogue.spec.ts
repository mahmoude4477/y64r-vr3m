import { scenarios } from "../../prisma/seed/scenarios";
import { expectAccessible } from "../support/a11y";
import { TRAINEE_STATE } from "../support/env";
import { expect, LOCALES, msg, test, waitForHydration } from "../support/fixtures";
import { protocolTitle, SERVER_WAIT, scenariosOf, title } from "./helpers";

// The catalogue as the shared setup trainee sees it (read-only: nothing here starts an attempt). Every published
// seed scenario is listed; filters by protocol and level live in the URL, so a reload or a shared link keeps them.

const published = scenarios.filter((s) => s.isPublished !== false);

test.describe("simulation catalogue", () => {
  test.use({ storageState: TRAINEE_STATE });
  test.slow(); // streamed data + axe scans of the app shell

  for (const locale of LOCALES) {
    for (const scheme of ["light", "dark"] as const) {
      test(`/${locale}/simulations is accessible (${scheme})`, async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`/${locale}/simulations`);
        await expect(page.getByRole("heading", { level: 1, name: msg(locale, "simulations.title") })).toBeVisible();
        await expect(page.getByRole("article")).toHaveCount(published.length, { timeout: SERVER_WAIT });
        if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
        await expectAccessible(page, testInfo, { label: scheme });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);
      });
    }
  }

  test("lists every published scenario with its protocol and a start link", async ({ page }) => {
    const locale = "en";
    await page.goto(`/${locale}/simulations`);
    await expect(page.getByRole("article")).toHaveCount(published.length, { timeout: SERVER_WAIT });
    for (const s of published) {
      const card = page.getByRole("article").filter({ has: page.getByRole("heading", { level: 3, name: title(s, locale), exact: true }) });
      await expect(card).toHaveCount(1);
      await expect(card.getByText(protocolTitle(s.protocolSlug, locale), { exact: true })).toBeVisible();
      await expect(card.getByRole("link", { name: new RegExp(`^${msg(locale, "simulations.catalogue.card.start")}`) })).toHaveAttribute(
        "href",
        `/${locale}/simulations/${s.slug}`,
      );
    }
  });

  test("filters by protocol and level, keeps them in the URL, and clears them", async ({ page }) => {
    const locale = "ar";
    const sharps = scenariosOf("sharps-safety");
    await page.goto(`/${locale}/simulations`);
    const protocolFilter = page.getByRole("combobox", { name: msg(locale, "simulations.catalogue.filters.protocol") });
    await expect(page.getByRole("article")).toHaveCount(published.length, { timeout: SERVER_WAIT });
    await waitForHydration(protocolFilter);

    await protocolFilter.click();
    await page.getByRole("option", { name: protocolTitle("sharps-safety", locale), exact: true }).click();
    await expect(page).toHaveURL(/\?protocol=sharps-safety$/);
    await expect(page.getByRole("article")).toHaveCount(sharps.length);
    for (const s of sharps) await expect(page.getByRole("heading", { level: 3, name: title(s, locale), exact: true })).toBeVisible();

    // A reload (or a shared link) shows the same filtered view.
    await page.reload();
    await expect(page.getByRole("article")).toHaveCount(sharps.length, { timeout: SERVER_WAIT });
    await expect(protocolFilter).toContainText(protocolTitle("sharps-safety", locale));

    // A level with no sharps scenario: a clear empty state with a way out.
    const levels = new Set(sharps.map((s) => s.difficulty));
    const missing = (["beginner", "intermediate", "advanced"] as const).find((d) => !levels.has(d));
    if (missing) {
      const levelFilter = page.getByRole("combobox", { name: msg(locale, "simulations.catalogue.filters.difficulty") });
      await waitForHydration(levelFilter);
      await levelFilter.click();
      await page.getByRole("option", { name: msg(locale, `common.difficulty.${missing}`), exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`difficulty=${missing}`));
      await expect(page.getByRole("article")).toHaveCount(0);
      await expect(page.getByText(msg(locale, "simulations.catalogue.noResults.title"))).toBeVisible();
      await page.getByRole("button", { name: msg(locale, "simulations.catalogue.filters.clear") }).last().click();
    } else {
      await page.getByRole("button", { name: msg(locale, "simulations.catalogue.filters.clear") }).click();
    }
    await expect(page.getByRole("article")).toHaveCount(published.length);
    await expect(page).toHaveURL(new RegExp(`/${locale}/simulations$`));
    // Clearing keeps keyboard focus in the filters (the button goes inactive or away): on the first filter (UX-5).
    await expect(protocolFilter).toBeFocused();
  });

  test("an unknown or unpublished scenario is not found", async ({ page }) => {
    await page.goto("/ar/simulations/no-such-scenario");
    await expect(page.getByRole("heading", { level: 1, name: msg("ar", "common.notFound.title") })).toBeVisible({ timeout: SERVER_WAIT });
  });
});
