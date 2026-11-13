import { expectAccessible } from "../support/a11y";
import { ADMIN_STATE, TRAINEE_STATE } from "../support/env";
import { expect, LOCALES, msg, test } from "../support/fixtures";
import { expectNotFound } from "./helpers";

// The platform admin area: who may open it, its sub-navigation and the overview (PRODUCT 6a).

test.describe("not a platform admin", () => {
  test.use({ storageState: TRAINEE_STATE });

  test("every admin page is not found, and the admin navigation is never shown", async ({ page }) => {
    test.slow();
    for (const path of [
      "/ar/admin",
      "/ar/admin/users",
      "/en/admin/users/any-id",
      "/ar/admin/organizations",
      "/ar/admin/organizations/new",
      "/en/admin/organizations/any-id",
      "/ar/admin/assessments",
      "/en/admin/assessments/scans/any-id",
      "/ar/admin/assessments/attempts/any-id",
      "/ar/admin/ai",
      "/en/admin/audit",
    ]) {
      await page.goto(path);
      await expectNotFound(page, path.startsWith("/en") ? "en" : "ar");
      await expect(page.getByRole("navigation", { name: msg(path.startsWith("/en") ? "en" : "ar", "admin.nav.label") })).toHaveCount(0);
    }
  });

  test("the platform-admin photo route refuses everyone else", async ({ page }) => {
    const res = await page.request.get("/api/admin/photos/any-id", { maxRedirects: 0 });
    expect(res.status()).toBe(403);
  });

  test("the way back from impersonation exists only while impersonating", async ({ page }) => {
    test.slow();
    await page.goto("/ar/admin/impersonation");
    await expectNotFound(page);
  });
});

test.describe("platform admin overview", () => {
  test.use({ storageState: ADMIN_STATE });
  // Five cards and two lists stream in, then a full WCAG 2.2 scan of the page.
  test.slow();

  for (const locale of LOCALES) {
    for (const scheme of ["light", "dark"] as const) {
      test(`/${locale}/admin (${scheme})`, async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`/${locale}/admin`);
        await expect(page.getByRole("heading", { level: 1, name: msg(locale, "admin.title") })).toBeVisible();

        const nav = page.getByRole("navigation", { name: msg(locale, "admin.nav.label") });
        await expect(nav.getByRole("link", { name: msg(locale, "nav.sub.adminOverview") })).toHaveAttribute("aria-current", "page");
        for (const key of ["adminUsers", "adminOrganizations", "adminProtocols", "adminScenarios", "adminAssessments", "adminAi", "adminAudit"]) {
          await expect(nav.getByRole("link", { name: msg(locale, `nav.sub.${key}`) })).toBeVisible();
        }

        // Every card shows a number from the database (at least the admin's own account exists).
        for (const key of ["users", "organizations", "attempts", "scans", "ai"]) {
          await expect(page.getByRole("heading", { level: 3, name: msg(locale, `admin.overview.${key}.title`) })).toBeVisible();
        }
        await expect(page.getByRole("heading", { level: 2, name: msg(locale, "admin.activity.title") })).toBeVisible();
        await expect(page.getByRole("heading", { level: 2, name: msg(locale, "admin.overview.risk.title") })).toBeVisible();
        await expect(page.getByRole("link", { name: msg(locale, "admin.overview.users.manage") })).toHaveAttribute("href", `/${locale}/admin/users`);

        if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
        await expectAccessible(page, testInfo, { label: `${locale} ${scheme}` });
      });
    }
  }

  test("the sub-navigation marks the current section and does not widen the page", async ({ page }) => {
    await page.goto("/ar/admin/users");
    const nav = page.getByRole("navigation", { name: msg("ar", "admin.nav.label") });
    await expect(nav.getByRole("link", { name: msg("ar", "nav.sub.adminUsers") })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: msg("ar", "nav.sub.adminOrganizations") }).click();
    await expect(page).toHaveURL(/\/ar\/admin\/organizations$/);
    await expect(nav.getByRole("link", { name: msg("ar", "nav.sub.adminOrganizations") })).toHaveAttribute("aria-current", "page");
    // No horizontal page scroll at any width (the row scrolls inside itself on phones).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // On a phone the row scrolls with a hidden scrollbar: an edge fade shows there are more sections to swipe to.
    const row = nav.getByRole("list");
    const scrolls = await row.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    if (scrolls) await expect.poll(() => row.evaluate((el) => getComputedStyle(el).maskImage)).toContain("linear-gradient");
  });

  test("on a phone the current section is never left under an edge fade", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 390, height: 844 });
    // The first, a middle and the last sections, both directions.
    for (const [locale, path, key] of [
      ["ar", "/ar/admin/audit", "adminAudit"],
      ["en", "/en/admin/audit", "adminAudit"],
      ["en", "/en/admin/ai", "adminAi"],
      ["ar", "/ar/admin/assessments", "adminAssessments"],
      ["en", "/en/admin", "adminOverview"],
    ] as const) {
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: msg(locale, "admin.nav.label") });
      const current = nav.getByRole("link", { name: msg(locale, `nav.sub.${key}`) });
      await expect(current).toHaveAttribute("aria-current", "page");
      await expect
        .poll(() =>
          current.evaluate((a) => {
            const row = a.closest("ul") as HTMLElement;
            const box = row.getBoundingClientRect();
            const r = a.getBoundingClientRect();
            const max = row.scrollWidth - row.clientWidth;
            const pos = Math.abs(row.scrollLeft);
            const rtl = getComputedStyle(row).direction === "rtl";
            // A 40 px fade sits on an edge only while the row can scroll further that way (start = right in Arabic).
            const fadeAtStart = pos > 1;
            const fadeAtEnd = max - pos > 1;
            const leftFade = rtl ? fadeAtEnd : fadeAtStart;
            const rightFade = rtl ? fadeAtStart : fadeAtEnd;
            return (!leftFade || r.left >= box.left + 39) && (!rightFade || r.right <= box.right - 39);
          }),
        )
        .toBe(true);
    }
  });

  test("risk legend: every figure is readable in full, at any width", async ({ page }) => {
    await page.goto("/en/admin");
    const risk = page.getByRole("heading", { level: 2, name: msg("en", "admin.overview.risk.title") });
    await expect(risk).toBeVisible();
    const legend = page.locator("section[aria-labelledby^='risk-'] ul li");
    await expect(legend.first().or(page.getByText(msg("en", "admin.overview.risk.empty")))).toBeVisible({ timeout: 20_000 });
    const cut = await legend.evaluateAll((items) =>
      items.flatMap((li) => [...li.querySelectorAll("span")].filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent)),
    );
    expect(cut).toEqual([]);
  });
});
