import { randomUUID } from "node:crypto";
import type { Page, TestInfo } from "@playwright/test";
import { authPost, createOrganization, createVerifiedUser } from "../support/auth";
import { expectAccessible } from "../support/a11y";
import { expect, type Locale, msg, test, waitForHydration } from "../support/fixtures";
import { institutionWithOwner } from "../org/helpers";
import { signedInElsewhere } from "./helpers";

// Automated accessibility (axe, WCAG 2.2 A/AA) of /settings in light and dark, at desktop width and at 390 px (both
// projects), in both languages: once with every list filled (an institution, another session, an invitation, the
// confirmation dialog) and once for an individual user (the empty institutions state).

async function bothSchemes(page: Page, testInfo: TestInfo, label: string, open: () => Promise<void>) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await open();
    if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expectAccessible(page, testInfo, { label: `${label} ${scheme}` });
  }
}

for (const locale of ["ar", "en"] as const satisfies readonly Locale[]) {
  test(`settings with institutions, sessions and an invitation (${locale})`, async (
    { browser, page, clientIp, uniqueEmail, strongPassword },
    testInfo,
  ) => {
    test.setTimeout(180_000); // a sign-up, two institutions, a second sign-in and six full axe scans
    const headers = { "x-real-ip": clientIp };
    const password = strongPassword();
    const { admin, owner } = await institutionWithOwner(browser, page.request, { headers, email: uniqueEmail(), password, locale });
    const other = await signedInElsewhere(browser, { email: owner.email, password }, headers);
    try {
      const tag = randomUUID().slice(0, 6);
      const second = await createOrganization(admin.request, {
        name: `مستشفى الدعوة ${tag}`,
        nameEn: `Invitation Hospital ${tag}`,
        slug: `e2e-settings-a11y-${randomUUID().slice(0, 12)}`,
        type: "hospital",
      });
      const invited = await authPost(admin.request, "/organization/invite-member", { email: owner.email, role: "examiner", organizationId: second.id });
      expect(invited.ok(), await invited.text()).toBe(true);

      await bothSchemes(page, testInfo, "settings", async () => {
        await page.goto(`/${locale}/settings`);
        await expect(page.getByRole("heading", { level: 1, name: msg(locale, "settings.title") })).toBeVisible();
        await expect(page.getByRole("list", { name: msg(locale, "settings.institutions.invitations.title") })).toBeVisible();
        await expect(page.getByRole("list", { name: msg(locale, "settings.security.sessions.title") }).getByRole("listitem")).toHaveCount(2);
        // The theme radios settle once the page is interactive (the saved theme is only known in the browser).
        await expect(page.getByRole("radio", { name: msg(locale, "common.theme.system") })).toBeChecked();
      });
      await bothSchemes(page, testInfo, "sign out dialog", async () => {
        await page.goto(`/${locale}/settings`);
        const button = page.getByRole("button", { name: msg(locale, "settings.security.sessions.signOutOthers") });
        await waitForHydration(button);
        await button.click();
        await expect(page.getByRole("alertdialog", { name: msg(locale, "settings.security.sessions.confirmTitle") })).toBeVisible();
      });
    } finally {
      await other.close();
      await admin.close();
    }
  });
}

test("settings of an individual user (ar, light and dark)", async ({ page, uniqueEmail, strongPassword }, testInfo) => {
  test.setTimeout(120_000);
  await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword() });
  await bothSchemes(page, testInfo, "individual", async () => {
    await page.goto("/ar/settings");
    // Visible matches only: see openSettings (e2e/settings/helpers.ts) about the hidden copy a late stream can leave.
    await expect(page.getByText(msg("ar", "settings.institutions.empty.title")).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(msg("ar", "settings.security.sessions.onlyThis")).filter({ visible: true })).toBeVisible();
    // Interactive (the theme radios settle): the radios are named in the server HTML and after hydration alike.
    await expect(page.getByRole("radio", { name: msg("ar", "common.theme.system") })).toBeChecked();
  });
});
