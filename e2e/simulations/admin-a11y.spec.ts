import { randomUUID } from "node:crypto";
import { expectAccessible } from "../support/a11y";
import { createOrganization } from "../support/auth";
import { ADMIN_STATE } from "../support/env";
import { expect, LOCALES, msg, test } from "../support/fixtures";
import { addOneStage, createDraftThroughUi, saveEditor } from "./admin-helpers";
import { SERVER_WAIT } from "./helpers";

// Accessibility (axe, WCAG 2.2 AA) of the editor pages in both languages, light and dark, at desktop width and at
// 390 px (both projects run this file), with no sideways scrolling. The draft belongs to a fresh institution.

let draftId = "";

test.describe("scenario editor pages are accessible", () => {
  test.use({ storageState: ADMIN_STATE });
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({ storageState: ADMIN_STATE, extraHTTPHeaders: { "x-real-ip": `10.9.${Math.floor(Math.random() * 250)}.7` } });
    try {
      const name = `مستشفى الوصول ${randomUUID().slice(0, 8)}`;
      await createOrganization(context.request, { name, slug: `e2e-${randomUUID().slice(0, 12)}`, type: "hospital" });
      const page = await context.newPage();
      draftId = (await createDraftThroughUi(page, "en", name)).id;
      await addOneStage(page, "en");
      await saveEditor(page, "en");
    } finally {
      await context.close();
    }
  });

  for (const locale of LOCALES) {
    for (const scheme of ["light", "dark"] as const) {
      test(`/${locale}/admin/scenarios pages (${scheme})`, async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme: scheme });
        const pages = [
          { path: `/${locale}/admin/scenarios`, ready: msg(locale, "simulations.admin.list.new") },
          { path: `/${locale}/admin/scenarios/new`, ready: msg(locale, "simulations.admin.create.submit") },
          { path: `/${locale}/admin/scenarios/${draftId}`, ready: msg(locale, "simulations.admin.editor.save") },
          { path: `/${locale}/admin/scenarios/${draftId}/preview`, ready: msg(locale, "simulations.player.start") },
        ];
        for (const { path, ready } of pages) {
          await page.goto(path);
          await expect(page.getByRole(path.endsWith("/scenarios") ? "link" : "button", { name: ready }).first()).toBeVisible({ timeout: SERVER_WAIT });
          if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
          await expectAccessible(page, testInfo, { label: `${path}-${scheme}` });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
        }
      });
    }
  }
});
