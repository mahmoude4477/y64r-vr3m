import { randomUUID } from "node:crypto";
import { addMember, createOrganization, createVerifiedUser } from "../support/auth";
import { ADMIN_STATE, TRAINEE_STATE } from "../support/env";
import { expect, msg, test, urlPath } from "../support/fixtures";
import { scenario, SERVER_WAIT } from "./helpers";

// The scenario editor is for platform admins only (requirePlatformAdmin in every page; the Server Actions answer
// "forbidden", unit-tested in lib/simulations/admin/actions.test.ts). Everyone else gets the not-found page, and none
// of a scenario's answers or feedback reach their browser (the preview page carries the correct answers).

const notFound = (locale: "ar" | "en") => ({ level: 1 as const, name: msg(locale, "common.notFound.title") });

/** The editor id of a seed scenario, read from the admin list (the shared admin session, read-only). */
async function seedScenarioId(browser: import("@playwright/test").Browser, slug: string): Promise<string> {
  const admin = await browser.newContext({ storageState: ADMIN_STATE });
  try {
    const page = await admin.newPage();
    await page.goto(`/en/admin/scenarios?q=${slug}`);
    const link = page.getByRole("link", { name: new RegExp(`^${msg("en", "simulations.admin.list.row.open")}`) }).first();
    await expect(link).toBeVisible({ timeout: SERVER_WAIT });
    const href = (await link.getAttribute("href")) ?? "";
    return href.split("/").pop() ?? "";
  } finally {
    await admin.close();
  }
}

test.describe("scenario editor access", () => {
  test.describe.configure({ timeout: 120_000 });

  test("guests are sent to sign-in", async ({ page }) => {
    await page.goto("/ar/admin/scenarios/new");
    await expect(page).toHaveURL(urlPath("/ar/sign-in?callbackUrl=%2Far%2Fadmin%2Fscenarios%2Fnew"));
  });

  test.describe("a trainee", () => {
    test.use({ storageState: TRAINEE_STATE });

    test("gets the not-found page on every editor page and sees no answers", async ({ page, browser }) => {
      const s = scenario("used-needle-after-injection");
      const id = await seedScenarioId(browser, s.slug);
      for (const path of ["/ar/admin/scenarios", "/ar/admin/scenarios/new", `/ar/admin/scenarios/${id}`, `/ar/admin/scenarios/${id}/preview`]) {
        await page.goto(path);
        await expect(page.getByRole("heading", notFound("ar"))).toBeVisible({ timeout: SERVER_WAIT });
      }
      // The preview payload (correct answers, feedback) never reached the page.
      await expect(page.getByText(s.stages[0].options[0].feedbackAr)).toHaveCount(0);
      expect(await page.content()).not.toContain(s.stages[0].options[0].feedbackAr);
    });
  });

  test("an institution admin is not a platform admin", async ({ page, browser, clientIp, uniqueEmail, strongPassword }) => {
    test.slow(); // a sign-up with an e-mailed code and an invitation
    const admin = await browser.newContext({ storageState: ADMIN_STATE, extraHTTPHeaders: { "x-real-ip": clientIp } });
    try {
      const manager = await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword(), locale: "en" });
      const org = await createOrganization(admin.request, { name: `مؤسسة ${randomUUID().slice(0, 6)}`, slug: `e2e-${randomUUID().slice(0, 12)}`, type: "hospital" });
      await addMember(admin.request, page.request, { organizationId: org.id, email: manager.email, role: "admin" });

      const s = scenario("food-on-night-shift");
      const id = await seedScenarioId(browser, s.slug);
      for (const path of ["/en/admin/scenarios", `/en/admin/scenarios/${id}`, `/en/admin/scenarios/${id}/preview`]) {
        await page.goto(path);
        await expect(page.getByRole("heading", notFound("en"))).toBeVisible({ timeout: SERVER_WAIT });
      }
      expect(await page.content()).not.toContain(s.stages[0].options[0].feedbackEn);
    } finally {
      await admin.close();
    }
  });
});
