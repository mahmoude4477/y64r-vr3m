import { expectAccessible } from "../support/a11y";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import { adminContext, institutionWithTrainee, OPTIONS, pluralBranch, publishedScenario, readyForAxe, visibleText } from "./admin-helpers";
import { fill, SERVER_WAIT } from "./helpers";

// CONVENTIONS 6: a scenario with attempts is never edited in place. "Create a new version" copies it; the copy is
// edited and published, and publishing it unpublishes the old version. Old results keep explaining every answer, and
// old links open the current version.

test.describe("scenario versions", () => {
  test.describe.configure({ timeout: 240_000 });

  test("a played scenario gets a new version that replaces it when published", async ({ page, browser, clientIp, uniqueEmail, strongPassword }, testInfo) => {
    const locale = "en";
    const admin = await adminContext(browser, clientIp);
    try {
      const institution = await institutionWithTrainee(admin, page, { email: uniqueEmail(), password: strongPassword() });
      const ap = await admin.newPage();
      const v1 = await publishedScenario(ap, locale, institution.name);

      // The trainee plays version 1 (a wrong answer, so the result has a mistake to explain).
      await page.goto(`/${locale}/simulations/${v1.slug}`);
      const start = page.getByRole("button", { name: msg(locale, "simulations.player.start") });
      await waitForHydration(start);
      await start.click();
      await page.getByRole("radio", { name: OPTIONS.wrong.textEn, exact: true }).click();
      await page.getByRole("button", { name: msg(locale, "simulations.player.stage.confirmLast") }).click();
      await expect(page).toHaveURL(/\/simulations\/attempts\/[^/?#]+$/, { timeout: SERVER_WAIT });
      const resultUrl = page.url();

      // Version 1 is locked; "create a new version" opens an unpublished copy, version 2.
      await ap.reload();
      await expect(visibleText(ap, msg(locale, "simulations.admin.locked.title"))).toBeVisible({ timeout: SERVER_WAIT });
      await ap.getByRole("button", { name: msg(locale, "simulations.admin.locked.createVersion") }).click();
      await expect(ap).not.toHaveURL(urlPath(`/${locale}/admin/scenarios/${v1.id}`), { timeout: SERVER_WAIT });
      await expect(visibleText(ap, fill(msg(locale, "simulations.admin.version"), { n: 2 })).first()).toBeVisible({ timeout: SERVER_WAIT });
      await expect(visibleText(ap, `/simulations/${v1.slug}-v2`)).toBeVisible();
      const v2Url = ap.url();

      // The copy holds the same content, and it is editable.
      const titleEn = ap.getByLabel(msg(locale, "simulations.admin.fields.titleEn"));
      await expect(titleEn).toHaveValue(v1.titleEn);
      await titleEn.fill(`${v1.titleEn} revised`);
      await ap.getByRole("button", { name: msg(locale, "simulations.admin.editor.save") }).click();
      await expect(visibleText(ap, msg(locale, "simulations.admin.editor.upToDate"), { exact: true })).toBeVisible({ timeout: SERVER_WAIT });

      // Meanwhile the trainee starts version 1 again and leaves the stage on screen.
      await page.goto(`/${locale}/simulations/${v1.slug}`);
      const again = page.getByRole("button", { name: msg(locale, "simulations.player.start") });
      await waitForHydration(again);
      await again.click();
      await expect(page.getByRole("radio", { name: OPTIONS.right.textEn, exact: true })).toBeVisible({ timeout: SERVER_WAIT });

      // Publishing version 2 says it unpublishes version 1 and closes the open attempt on it (SPEC-2), and does.
      await ap.reload();
      await expect(ap.getByRole("button", { name: msg(locale, "simulations.admin.actions.publish"), exact: true })).toBeVisible({ timeout: SERVER_WAIT });
      await ap.getByRole("button", { name: msg(locale, "simulations.admin.actions.publish"), exact: true }).click();
      const dialog = ap.getByRole("alertdialog", { name: msg(locale, "simulations.admin.actions.publishTitle") });
      await expect(dialog).toContainText(pluralBranch(locale, "simulations.admin.actions.publishReplaces", "one", { versions: "1" }));
      await expect(dialog).toContainText(pluralBranch(locale, "simulations.admin.actions.publishAbandons", "one", {}));
      await dialog.getByRole("button", { name: msg(locale, "simulations.admin.actions.publish"), exact: true }).click();
      // Unnamed on purpose: the closing dialog re-renders with the other title and label until it is gone.
      await expect(ap.getByRole("alertdialog")).toHaveCount(0, { timeout: SERVER_WAIT });
      await expect(ap.getByRole("button", { name: msg(locale, "simulations.admin.actions.unpublish"), exact: true })).toBeVisible({ timeout: SERVER_WAIT });
      const versions = ap.getByRole("navigation", { name: msg(locale, "simulations.admin.versions.title") });
      // Version 1 has attempts: it is "unpublished", not a draft.
      await expect(versions.getByRole("listitem").first()).toContainText(msg(locale, "simulations.admin.status.unpublished"));
      await readyForAxe(ap);
      await expectAccessible(ap, testInfo, { label: "version-2" });

      // The trainee's stale tab: the answer is not taken, and the page says the attempt was closed, with a way to the
      // version that replaced it.
      await page.getByRole("radio", { name: OPTIONS.right.textEn, exact: true }).click();
      await page.getByRole("button", { name: msg(locale, "simulations.player.stage.confirmLast") }).click();
      await expect(visibleText(page, msg(locale, "simulations.result.status.abandonedTitle"))).toBeVisible({ timeout: SERVER_WAIT });
      await expect(page.getByRole("link", { name: msg(locale, "simulations.result.status.start") })).toHaveAttribute(
        "href",
        `/${locale}/simulations/${v1.slug}-v2`,
      );

      // The trainee sees only version 2 in the catalogue.
      await page.goto(`/${locale}/simulations`);
      await expect(page.getByRole("heading", { level: 3, name: `${v1.titleEn} revised`, exact: true })).toBeVisible({ timeout: SERVER_WAIT });
      await expect(page.getByRole("heading", { level: 3, name: v1.titleEn, exact: true })).toHaveCount(0);

      // The old result still explains the answer given on version 1.
      await page.goto(resultUrl);
      await expect(page.getByRole("heading", { level: 1, name: v1.titleEn })).toBeVisible({ timeout: SERVER_WAIT });
      await expect(visibleText(page, OPTIONS.wrong.feedbackEn)).toBeVisible();

      // An old link to version 1 opens version 2.
      await page.goto(`/${locale}/simulations/${v1.slug}`);
      await expect(page).toHaveURL(urlPath(`/${locale}/simulations/${v1.slug}-v2`), { timeout: SERVER_WAIT });

      // Version 1, back in the editor: unpublished, still locked, and it links to version 2.
      await ap.goto(`/${locale}/admin/scenarios/${v1.id}`);
      await expect(visibleText(ap, msg(locale, "simulations.admin.locked.title"))).toBeVisible({ timeout: SERVER_WAIT });
      await expect(ap.getByRole("button", { name: msg(locale, "simulations.admin.actions.publish"), exact: true })).toBeVisible();
      await ap.getByRole("link", { name: fill(msg(locale, "simulations.admin.version"), { n: 2 }) }).click();
      await expect(ap).toHaveURL(v2Url);
    } finally {
      await admin.close();
    }
  });
});
