import { randomUUID } from "node:crypto";
import { expectAccessible } from "../support/a11y";
import { createOrganization } from "../support/auth";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import {
  addOneStage,
  adminContext,
  createDraftThroughUi,
  institutionWithTrainee,
  OPTIONS,
  optionGroup,
  pluralOne,
  publish,
  readyForAxe,
  saveEditor,
  stageGroup,
  visibleText,
} from "./admin-helpers";
import { fill, scoreText, SERVER_WAIT, stageLabel } from "./helpers";

// The scenario editor end to end (platform admin): create a draft for an institution, add a stage, the editor's
// rules (one correct answer), save, preview as a trainee without recording an attempt, publish, and a member trainee
// of that institution plays it. Once played, the scenario is locked (never edited in place).

test.describe("scenario editor", () => {
  // Two sign-ups, an institution, a long form and two play-throughs.
  test.describe.configure({ timeout: 240_000 });

  test("create, validate, save, preview, publish, play, then locked", async ({ page, browser, clientIp, uniqueEmail, strongPassword }, testInfo) => {
    const locale = "en";
    const admin = await adminContext(browser, clientIp);
    try {
      const institution = await institutionWithTrainee(admin, page, { email: uniqueEmail(), password: strongPassword() });
      const ap = await admin.newPage();

      // 1. A draft for the institution (meta only), then its first stage.
      const s = await createDraftThroughUi(ap, locale, institution.name);
      await expect(visibleText(ap, msg(locale, "simulations.admin.status.draft")).first()).toBeVisible();
      await expect(visibleText(ap, msg(locale, "simulations.admin.editor.noStages"))).toBeVisible();
      const stage = await addOneStage(ap, locale);

      // 2. The editor's rules: a one-answer stage needs exactly one correct option.
      const firstCorrect = optionGroup(stage, locale, 1).getByRole("checkbox", { name: new RegExp(msg(locale, "simulations.admin.fields.correct")) });
      await expect(firstCorrect).toBeChecked();
      await firstCorrect.uncheck();
      await ap.getByRole("button", { name: msg(locale, "simulations.admin.editor.save") }).click();
      const rule = stage.getByRole("alert").filter({ hasText: msg(locale, "simulations.admin.issues.singleNeedsOneCorrect") });
      await expect(rule).toBeVisible();
      await expect(rule).toBeFocused();
      await expect(visibleText(ap, msg(locale, "simulations.admin.editor.unsaved"), { exact: true })).toBeVisible();
      await firstCorrect.check();
      await expect(rule).toHaveCount(0);
      await saveEditor(ap, locale);
      await readyForAxe(ap);
      await expectAccessible(ap, testInfo, { label: "editor" });

      // 3. Preview as a trainee: the critical wrong choice gives a high risk, and nothing is recorded.
      await ap.getByRole("link", { name: msg(locale, "simulations.admin.actions.preview") }).click();
      await expect(visibleText(ap, msg(locale, "simulations.admin.preview.banner"))).toBeVisible({ timeout: SERVER_WAIT });
      const start = ap.getByRole("button", { name: msg(locale, "simulations.player.start") });
      await waitForHydration(start);
      await start.click();
      await expect(ap.getByRole("heading", { level: 2, name: stageLabel(locale, 1, 1) })).toBeFocused();
      await ap.getByRole("radio", { name: OPTIONS.wrong.textEn, exact: true }).click();
      await ap.getByRole("button", { name: msg(locale, "simulations.player.stage.confirmLast") }).click();
      await expect(ap.getByRole("heading", { level: 2, name: msg(locale, "simulations.admin.preview.resultTitle") })).toBeFocused();
      await expect(ap.getByRole("note").filter({ hasText: msg(locale, "simulations.result.critical.title") })).toBeVisible();
      await expect(ap.getByRole("region", { name: msg(locale, "simulations.result.summary.label") })).toContainText(msg(locale, "common.risk.high"));
      await readyForAxe(ap);
      await expectAccessible(ap, testInfo, { label: "preview-result" });
      await ap.getByRole("link", { name: msg(locale, "simulations.admin.preview.back") }).first().click();
      await expect(ap).toHaveURL(urlPath(`/${locale}/admin/scenarios/${s.id}`));
      // Still editable: the preview saved no attempt.
      await expect(ap.getByRole("button", { name: msg(locale, "simulations.admin.editor.save") })).toBeVisible({ timeout: SERVER_WAIT });
      await expect(visibleText(ap, msg(locale, "simulations.admin.locked.title"))).toHaveCount(0);

      // 4. Publish. The trainee of the institution finds it in the catalogue and plays it.
      await publish(ap, locale);
      await expect(visibleText(ap, msg(locale, "simulations.admin.editor.liveWarning"))).toBeVisible();

      await page.goto(`/${locale}/simulations`);
      const card = page.getByRole("article").filter({ has: page.getByRole("heading", { level: 3, name: s.titleEn, exact: true }) });
      await expect(card).toBeVisible({ timeout: SERVER_WAIT });
      await card.getByRole("link", { name: new RegExp(`^${msg(locale, "simulations.catalogue.card.start")}`) }).click();
      const play = page.getByRole("button", { name: msg(locale, "simulations.player.start") });
      await waitForHydration(play);
      await play.click();
      await page.getByRole("radio", { name: OPTIONS.right.textEn, exact: true }).click();
      await page.getByRole("button", { name: msg(locale, "simulations.player.stage.confirmLast") }).click();
      await expect(page).toHaveURL(/\/simulations\/attempts\/[^/?#]+$/, { timeout: SERVER_WAIT });
      await expect(page.getByRole("region", { name: msg(locale, "simulations.result.summary.label") })).toContainText(scoreText(locale, 100));

      // 5. Now that a trainee played it, the scenario is locked: read-only, with "create a new version".
      await ap.reload();
      await expect(visibleText(ap, msg(locale, "simulations.admin.locked.title"))).toBeVisible({ timeout: SERVER_WAIT });
      await expect(ap.getByRole("button", { name: msg(locale, "simulations.admin.locked.createVersion") })).toBeVisible();
      await expect(ap.getByRole("button", { name: msg(locale, "simulations.admin.editor.save") })).toHaveCount(0);
      await expect(visibleText(ap, OPTIONS.right.feedbackEn)).toBeVisible();
      await readyForAxe(ap);
      await expectAccessible(ap, testInfo, { label: "locked" });

      // The list shows it with its attempt.
      await ap.goto(`/${locale}/admin/scenarios?q=${encodeURIComponent(s.slug)}`);
      const row = ap.getByRole("article").filter({ hasText: s.titleEn });
      await expect(row).toBeVisible({ timeout: SERVER_WAIT });
      await expect(row).toContainText(msg(locale, "simulations.admin.status.published"));
      await expect(row).toContainText(pluralOne(locale, "simulations.admin.list.row.attempts"));
      await expect(row).toContainText(institution.name);
    } finally {
      await admin.close();
    }
  });

  test("reorders stages and options with the keyboard-friendly buttons", async ({ browser, clientIp }) => {
    const locale = "ar";
    const admin = await adminContext(browser, clientIp);
    try {
      const name = `مستشفى الترتيب ${randomUUID().slice(0, 8)}`;
      await createOrganization(admin.request, { name, slug: `e2e-${randomUUID().slice(0, 12)}`, type: "hospital" });
      const ap = await admin.newPage();
      await createDraftThroughUi(ap, locale, name);
      await addOneStage(ap, locale);
      // A second stage: focus goes to its first field and the addition is announced (UX-6).
      await ap.getByRole("button", { name: msg(locale, "simulations.admin.editor.addStage") }).click();
      const second = stageGroup(ap, locale, 2);
      await expect(second.getByLabel(msg(locale, "simulations.admin.fields.contextAr"))).toBeFocused();
      await expect(ap.getByRole("status").filter({ hasText: fill(msg(locale, "simulations.admin.editor.addedStage"), { n: 2 }) })).toBeAttached();
      // Adding an option focuses its first field too.
      await second.getByRole("button", { name: msg(locale, "simulations.admin.editor.addOption") }).click();
      await expect(optionGroup(second, locale, 3).getByLabel(msg(locale, "simulations.admin.fields.optionTextAr"))).toBeFocused();
      await optionGroup(second, locale, 3).getByRole("button", { name: fill(msg(locale, "simulations.admin.editor.removeOption"), { n: 3 }) }).click();
      await second.getByLabel(msg(locale, "simulations.admin.fields.promptAr")).fill("السؤال الثاني");

      // Collapse all: each stage becomes a one-line summary (its fields stay in the form); expand all brings them back.
      await ap.getByRole("button", { name: msg(locale, "simulations.admin.editor.collapseAll") }).click();
      await expect(second.getByLabel(msg(locale, "simulations.admin.fields.promptAr"))).toBeHidden();
      await expect(visibleText(second, "السؤال الثاني", { exact: true })).toBeVisible();
      await ap.getByRole("button", { name: msg(locale, "simulations.admin.editor.expandAll") }).click();
      await expect(second.getByLabel(msg(locale, "simulations.admin.fields.promptAr"))).toHaveValue("السؤال الثاني");

      // Then move it up: focus follows the moved stage and the move is announced.
      await second.getByRole("button", { name: fill(msg(locale, "simulations.admin.editor.moveStageUp"), { n: 2 }) }).click();
      await expect(stageGroup(ap, locale, 1).getByLabel(msg(locale, "simulations.admin.fields.promptAr"))).toHaveValue("السؤال الثاني");
      // At the top "move up" is disabled, so focus lands on "move down" of the same stage.
      await expect(stageGroup(ap, locale, 1).getByRole("button", { name: fill(msg(locale, "simulations.admin.editor.moveStageDown"), { n: 1 }) })).toBeFocused();
      await expect(ap.getByRole("status").filter({ hasText: fill(msg(locale, "simulations.admin.editor.movedStage"), { n: 1, total: 2 }) })).toBeAttached();

      // Options move inside their stage.
      const stage = stageGroup(ap, locale, 2);
      await optionGroup(stage, locale, 1).getByRole("button", { name: fill(msg(locale, "simulations.admin.editor.moveOptionDown"), { n: 1 }) }).click();
      await expect(optionGroup(stage, locale, 2).getByLabel(msg(locale, "simulations.admin.fields.optionTextEn"))).toHaveValue(OPTIONS.right.textEn);

      // Removing a stage asks first.
      await stageGroup(ap, locale, 1).getByRole("button", { name: fill(msg(locale, "simulations.admin.editor.removeStage"), { n: 1 }) }).click();
      const dialog = ap.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: fill(msg(locale, "simulations.admin.editor.removeStage"), { n: 1 }) }).click();
      await expect(stageGroup(ap, locale, 2)).toHaveCount(0);
      await expect(stageGroup(ap, locale, 1).getByLabel(msg(locale, "simulations.admin.fields.promptEn"))).toHaveValue(
        "What do you do with the needle after the injection?",
      );
      await saveEditor(ap, locale);
    } finally {
      await admin.close();
    }
  });
});
