import type { Page, TestInfo } from "@playwright/test";
import { authPost, createVerifiedUser } from "../support/auth";
import { expectAccessible } from "../support/a11y";
import { expect, type Locale, msg, test, waitForHydration } from "../support/fixtures";
import { institutionWithOwner } from "./helpers";

// Automated accessibility (axe, WCAG 2.2 A/AA) of the institution pages and the invitation page, in light and dark,
// at desktop width and at 390 px (both projects). One institution per test, owned by the page's user.

async function bothSchemes(page: Page, testInfo: TestInfo, label: string, open: () => Promise<void>) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await open();
    if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expectAccessible(page, testInfo, { label: `${label} ${scheme}` });
  }
}

for (const locale of ["ar", "en"] as const satisfies readonly Locale[]) {
  test(`institution pages and dialogs (${locale})`, async ({ browser, page, clientIp, uniqueEmail, strongPassword }, testInfo) => {
    test.setTimeout(180_000); // a sign-up, an institution and eight full axe scans of the app shell
    const headers = { "x-real-ip": clientIp };
    const { admin, org } = await institutionWithOwner(browser, page.request, {
      headers,
      email: uniqueEmail(),
      password: strongPassword(),
      locale,
    });
    try {
      // Content for every list: a department, a pending invitation.
      const team = await authPost(page.request, "/organization/create-team", { name: "قسم المختبر", organizationId: org.id });
      expect(team.ok(), await team.text()).toBe(true);
      const invite = await authPost(page.request, "/organization/invite-member", { email: uniqueEmail(), role: "examiner", organizationId: org.id });
      expect(invite.ok(), await invite.text()).toBe(true);

      await bothSchemes(page, testInfo, "overview", async () => {
        await page.goto(`/${locale}/org`);
        await expect(page.getByRole("heading", { level: 1, name: msg(locale, "org.title") })).toBeVisible();
      });
      await bothSchemes(page, testInfo, "members", async () => {
        await page.goto(`/${locale}/org/members`);
        await expect(page.getByRole("region", { name: msg(locale, "org.invitations.title") })).toBeVisible();
      });
      await bothSchemes(page, testInfo, "departments", async () => {
        await page.goto(`/${locale}/org/departments`);
        await expect(page.getByRole("heading", { level: 3, name: "قسم المختبر" })).toBeVisible();
      });
      await bothSchemes(page, testInfo, "invite dialog", async () => {
        await page.goto(`/${locale}/org/members`);
        const button = page.getByRole("button", { name: msg(locale, "org.invite.button") });
        await waitForHydration(button);
        await button.click();
        await expect(page.getByRole("dialog", { name: msg(locale, "org.invite.title") })).toBeVisible();
      });
    } finally {
      await admin.close();
    }
  });
}

test("invitation page (ar, light and dark)", async ({ browser, page, clientIp, uniqueEmail, strongPassword }, testInfo) => {
  test.setTimeout(120_000);
  const headers = { "x-real-ip": clientIp };
  const inviteeEmail = uniqueEmail();
  const { admin, org } = await institutionWithOwner(browser, page.request, { headers, email: uniqueEmail(), password: strongPassword() });
  const invitee = await browser.newContext({ extraHTTPHeaders: headers });
  try {
    const res = await authPost(page.request, "/organization/invite-member", { email: inviteeEmail, role: "examiner", organizationId: org.id });
    expect(res.ok(), await res.text()).toBe(true);
    const { id } = (await res.json()) as { id: string };
    await createVerifiedUser(invitee.request, { email: inviteeEmail, password: strongPassword(), name: "مدعو" });
    const p = await invitee.newPage();
    await bothSchemes(p, testInfo, "invite", async () => {
      await p.goto(`/ar/invite/${id}`);
      await expect(p.getByRole("button", { name: msg("ar", "org.invitePage.open.accept") })).toBeVisible();
    });
  } finally {
    await invitee.close();
    await admin.close();
  }
});
