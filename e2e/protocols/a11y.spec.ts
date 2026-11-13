import { expectAccessible } from "../support/a11y";
import { TRAINEE_STATE } from "../support/env";
import { expect, msg, test } from "../support/fixtures";

// Automated accessibility (axe, WCAG 2.2 A/AA) of the protocol library pages in light and dark, at desktop width
// and at 390 px (both projects). The institution copy with training scenarios is scanned in detail.spec.ts.

test.use({ storageState: TRAINEE_STATE });

const PAGES = [
  { path: "/ar/protocols", heading: (l: "ar" | "en") => msg(l, "protocols.title"), locale: "ar" as const },
  { path: "/en/protocols", heading: (l: "ar" | "en") => msg(l, "protocols.title"), locale: "en" as const },
  { path: "/ar/protocols?q=zzzz-nothing", heading: (l: "ar" | "en") => msg(l, "protocols.title"), locale: "ar" as const },
  { path: "/ar/protocols/sharps-safety", heading: null, locale: "ar" as const },
  { path: "/en/protocols/blood-spill-management", heading: null, locale: "en" as const },
];

for (const { path, heading, locale } of PAGES) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${path} (${scheme})`, async ({ page }, testInfo) => {
      test.slow(); // streamed data, fonts and a full WCAG scan of a long page
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(heading ? page.getByRole("heading", { level: 1, name: heading(locale) }) : h1).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: msg(locale, "common.notFound.title") })).toHaveCount(0);
      if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await expectAccessible(page, testInfo, { label: scheme });
    });
  }
}
