import { expectAccessible } from "../support/a11y";
import { expect, msg, test, waitForHydration } from "../support/fixtures";
import { adminContext, institutionWithTrainee, OPTIONS, pluralBranch, publishedScenario, visibleText } from "./admin-helpers";
import { SERVER_WAIT } from "./helpers";

// Unpublishing a scenario while a trainee is in the middle of it (review round 1, SEC-1 / SPEC-3): the open attempt
// takes no more answers (nothing lands in the institution's reports after access ended), the player says so with a
// way back, and the result page of an earlier attempt offers no "Try again" that would lead to the not-found page.

test.describe("unpublished while being played", () => {
  test.describe.configure({ timeout: 240_000 });

  test("an open attempt cannot be finished and results lead nowhere dead", async ({ page, browser, clientIp, uniqueEmail, strongPassword }, testInfo) => {
    const locale = "en";
    const admin = await adminContext(browser, clientIp);
    try {
      const institution = await institutionWithTrainee(admin, page, { email: uniqueEmail(), password: strongPassword() });
      const ap = await admin.newPage();
      const s = await publishedScenario(ap, locale, institution.name);

      // The trainee completes it once ("Try again" is offered), then starts it again and leaves the stage on screen.
      await page.goto(`/${locale}/simulations/${s.slug}`);
      const start = page.getByRole("button", { name: msg(locale, "simulations.player.start") });
      await waitForHydration(start);
      await start.click();
      await page.getByRole("radio", { name: OPTIONS.right.textEn, exact: true }).click();
      await page.getByRole("button", { name: msg(locale, "simulations.player.stage.confirmLast") }).click();
      await expect(page).toHaveURL(/\/simulations\/attempts\/[^/?#]+$/, { timeout: SERVER_WAIT });
      const resultUrl = page.url();
      const tryAgain = page.getByRole("link", { name: msg(locale, "simulations.result.actions.tryAgain"), exact: true });
      await expect(tryAgain).toBeVisible({ timeout: SERVER_WAIT });
      await tryAgain.click();
      const again = page.getByRole("button", { name: msg(locale, "simulations.player.start") });
      await waitForHydration(again);
      await again.click();
      await expect(page.getByRole("radio", { name: OPTIONS.wrong.textEn, exact: true })).toBeVisible({ timeout: SERVER_WAIT });

      // The admin unpublishes it; the dialog says the open attempt cannot be finished meanwhile.
      await ap.reload();
      await ap.getByRole("button", { name: msg(locale, "simulations.admin.actions.unpublish"), exact: true }).click();
      const dialog = ap.getByRole("alertdialog", { name: msg(locale, "simulations.admin.actions.unpublishTitle") });
      await expect(dialog).toContainText(pluralBranch(locale, "simulations.admin.actions.unpublishInProgress", "one", {}));
      await dialog.getByRole("button", { name: msg(locale, "simulations.admin.actions.unpublish"), exact: true }).click();
      // Unnamed on purpose: the closing dialog re-renders with the other title and label until it is gone.
      await expect(ap.getByRole("alertdialog")).toHaveCount(0, { timeout: SERVER_WAIT });
      await expect(ap.getByRole("button", { name: msg(locale, "simulations.admin.actions.publish"), exact: true })).toBeVisible({ timeout: SERVER_WAIT });

      // The trainee's answer is refused with a clear message and a link back to the catalogue; nothing is scored.
      await page.getByRole("radio", { name: OPTIONS.wrong.textEn, exact: true }).click();
      await page.getByRole("button", { name: msg(locale, "simulations.player.stage.confirmLast") }).click();
      const refusal = page.getByRole("alert").filter({ hasText: msg(locale, "simulations.player.errors.notPlayable") });
      await expect(refusal).toBeVisible({ timeout: SERVER_WAIT });
      const way = refusal.getByRole("link", { name: msg(locale, "simulations.player.backToCatalogue") });
      await expect(way).toHaveAttribute("href", `/${locale}/simulations`);
      await expect(page).not.toHaveURL(/\/simulations\/attempts\//);
      // Read-only from here (review round 2, UX-1): no options, no confirm and no "Start over" that could only fail
      // again or lose the way back; focus is on the way out.
      await expect(way).toBeFocused();
      await expect(page.getByRole("main").getByRole("radio")).toHaveCount(0);
      await expect(page.getByRole("button", { name: msg(locale, "simulations.player.stage.confirmLast") })).toHaveCount(0);
      await expect(page.getByRole("button", { name: msg(locale, "simulations.player.restart.button") })).toHaveCount(0);
      await expectAccessible(page, testInfo, { label: "player-unavailable" });

      // The earlier result still opens (history), without a "Try again" into the not-found page.
      await page.goto(resultUrl);
      await expect(page.getByRole("region", { name: msg(locale, "simulations.result.summary.label") })).toBeVisible({ timeout: SERVER_WAIT });
      await expect(page.getByRole("link", { name: msg(locale, "simulations.result.actions.tryAgain"), exact: true })).toHaveCount(0);
      // The catalogue does not offer the open attempt any more.
      await page.goto(`/${locale}/simulations`);
      await expect(page.getByRole("article").first()).toBeVisible({ timeout: SERVER_WAIT });
      await expect(visibleText(page, s.titleEn)).toHaveCount(0);
    } finally {
      await admin.close();
    }
  });
});
