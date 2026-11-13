import { expectAccessible } from "../support/a11y";
import { createVerifiedUser } from "../support/auth";
import { expect, type Locale, msg, test } from "../support/fixtures";
import {
  answerStage,
  correctChoice,
  feedback,
  openAndStart,
  playScenario,
  scenario,
  scoreText,
  SERVER_WAIT,
  stageLabel,
  text,
  title,
  wrongChoice,
} from "./helpers";

// The simulation flow end to end: intro -> stages (server-saved answers, final once confirmed) -> scored result with
// the explanation of every choice, recommendations and the AI debrief (off in e2e: the keys are blank). Every test
// makes its own trainee, because one user has one open attempt per scenario (parallel projects would share it).

async function noHorizontalScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);
}

async function checkSchemes(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo, label: string) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: SERVER_WAIT });
    if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await expectAccessible(page, testInfo, { label: `${label}-${scheme}` });
  }
}

test.describe("playing a scenario", () => {
  // A sign-up with an e-mailed code, five or six saved answers and up to four axe scans.
  test.describe.configure({ timeout: 180_000 });

  test("a perfect run scores 100 with low risk and explains every choice (Arabic)", async ({ page, uniqueEmail, strongPassword }, testInfo) => {
    const locale: Locale = "ar";
    const s = scenario("used-needle-after-injection");
    const trainee = await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword(), locale, name: `متدرب الطباعة ${Date.now() % 100000}` });

    await openAndStart(page, locale, s.slug);
    // The tab names the scenario (UX-8), not just "Play simulation".
    await expect(page).toHaveTitle(new RegExp(title(s, locale)));
    // Confirming with nothing chosen says what is missing and stays on the stage.
    await expect(page.getByRole("heading", { level: 2, name: stageLabel(locale, 1, s.stages.length) })).toBeFocused({ timeout: SERVER_WAIT });
    await page.getByRole("button", { name: msg(locale, "simulations.player.stage.confirm") }).click();
    await expect(page.getByText(msg(locale, "simulations.player.stage.required"))).toBeVisible();
    await expectAccessible(page, testInfo, { label: "stage-error" });

    for (let i = 0; i < s.stages.length; i++) await answerStage(page, locale, s, i, correctChoice(s.stages[i]));
    // After the last answer focus continues at the result's heading, as it did at each stage heading (UX-4).
    await expect(page.getByRole("heading", { level: 1, name: title(s, locale) })).toBeFocused({ timeout: SERVER_WAIT });
    await expect(page).toHaveTitle(new RegExp(title(s, locale)));

    const summary = page.getByRole("region", { name: msg(locale, "simulations.result.summary.label") });
    await expect(summary).toContainText(scoreText(locale, 100));
    await expect(summary).toContainText(msg(locale, "common.risk.low"));
    // A clean run says every step was followed; the score is read once (no hidden second badge, UX-16).
    await expect(summary).toContainText(msg(locale, "simulations.result.summary.riskHint.clean"));
    await expect(summary.getByText(scoreText(locale, 100), { exact: true })).toHaveCount(1);
    await expect(page.getByRole("note").filter({ hasText: msg(locale, "simulations.result.critical.title") })).toHaveCount(0);
    await expect(page.getByText(msg(locale, "simulations.result.recommendations.empty"))).toBeVisible();

    // The review explains every option: each correct choice is marked and its feedback is shown.
    const review = page.getByRole("region", { name: msg(locale, "simulations.result.review.title") });
    const correctCount = s.stages.reduce((n, st) => n + correctChoice(st).length, 0);
    await expect(review.getByText(msg(locale, "simulations.result.review.state.chosen_correct"), { exact: true })).toHaveCount(correctCount);
    await expect(review.getByText(msg(locale, "simulations.result.review.state.chosen_wrong"), { exact: true })).toHaveCount(0);
    for (const st of s.stages) {
      for (const o of st.options) await expect(review.getByText(feedback(o, locale), { exact: true })).toBeVisible();
    }

    // The AI debrief is off on the e2e server (no key): a clear notice instead of a broken button.
    const debrief = page.getByRole("region", { name: msg(locale, "simulations.result.debrief.title") });
    await expect(debrief.getByText(msg(locale, "common.states.aiOff"))).toBeVisible();
    await expect(debrief.getByRole("button")).toHaveCount(0);

    // Printed: the owner's own sheet names the trainee, and leaves out the AI notice (UX-10, SPEC-10).
    const printedName = page.getByText(`${msg(locale, "simulations.result.trainee")}: ${trainee.name}`);
    await expect(printedName).toBeHidden();
    await page.emulateMedia({ media: "print" });
    await expect(printedName).toBeVisible();
    await expect(debrief).toBeHidden();
    await page.emulateMedia({ media: "screen" });

    await noHorizontalScroll(page);
    await checkSchemes(page, testInfo, "result");
  });

  test("a run with critical mistakes is high risk and every mistake names its protocol step (English)", async ({
    page,
    uniqueEmail,
    strongPassword,
  }, testInfo) => {
    const locale: Locale = "en";
    const s = scenario("used-needle-after-injection");
    await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword(), locale });

    await playScenario(page, locale, s, wrongChoice);

    const summary = page.getByRole("region", { name: msg(locale, "simulations.result.summary.label") });
    await expect(summary).toContainText(msg(locale, "common.risk.high"));
    await expect(summary).not.toContainText(scoreText(locale, 100));
    const criticalNote = page.getByRole("note").filter({ hasText: msg(locale, "simulations.result.critical.title") });
    await expect(criticalNote).toBeVisible();
    // The tile names the cause, the note states the rule and lists the steps: the rule is said once (UX-3).
    await expect(summary.getByText(msg(locale, "simulations.result.summary.riskHint.critical"), { exact: true })).toBeVisible();
    await expect(criticalNote).toContainText(msg(locale, "simulations.result.critical.description"));
    await expect(summary).not.toContainText(msg(locale, "simulations.result.critical.description"));
    // Screen readers hear "Risk level" once: the badge says it, the visible tile label is hidden from them (UX-2).
    const tree = await summary.ariaSnapshot();
    expect(tree.split(msg(locale, "common.risk.label")).length - 1, tree).toBe(1);

    const review = page.getByRole("region", { name: msg(locale, "simulations.result.review.title") });
    await expect(review.getByText(msg(locale, "simulations.result.review.state.chosen_wrong"), { exact: true })).toHaveCount(s.stages.length);
    // SPEC-6: in a one-answer stage answered wrongly the other wrong options are only "not chosen", never praised;
    // in a "choose all that apply" stage each wrong option left out is "correctly avoided".
    const wrongLeftOut = (kind: "single" | "multi") =>
      s.stages.filter((st) => st.kind === kind).reduce((n, st) => n + st.options.filter((o) => !o.isCorrect).length - 1, 0);
    await expect(review.getByText(msg(locale, "simulations.result.review.state.not_chosen"), { exact: true })).toHaveCount(wrongLeftOut("single"));
    await expect(review.getByText(msg(locale, "simulations.result.review.state.avoided"), { exact: true })).toHaveCount(wrongLeftOut("multi"));
    await expect(review.getByText(msg(locale, "simulations.result.review.criticalOption"), { exact: true }).first()).toBeVisible();
    for (const st of s.stages) {
      const chosen = st.options[wrongChoice(st)[0]];
      await expect(review.getByText(feedback(chosen, locale), { exact: true })).toBeVisible();
    }
    // Every mistake mapped to a step shows that step (stage 3: recapping breaks "never recap").
    expect(await review.getByText(`${msg(locale, "simulations.result.review.step")}:`).count()).toBeGreaterThan(0);

    // Recommendations exist without the AI, most important first, with a scenario to practise.
    const recs = page.getByRole("region", { name: msg(locale, "simulations.result.recommendations.title") });
    await expect(recs.getByRole("listitem").first()).toBeVisible();
    await expect(recs.getByText(msg(locale, "simulations.result.recommendations.critical"), { exact: true }).first()).toBeVisible();
    await expect(recs.getByRole("link", { name: msg(locale, "simulations.result.recommendations.practiseAgain") }).first()).toBeVisible();

    // The owner may ask for a debrief; the server says the AI is not configured (no model call in e2e).
    const id = new URL(page.url()).pathname.split("/").pop();
    const res = await page.request.post(`/api/simulations/attempts/${id}/debrief`, { data: { locale } });
    expect(res.status()).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });

    // Back from the result never shows a stuck player (the router keeps the page alive between visits): the intro, with
    // the best score so far once the fresh data arrives.
    await page.goBack();
    await expect(page.getByRole("button", { name: msg(locale, "simulations.player.start") })).toBeVisible({ timeout: SERVER_WAIT });
    await expect(page.getByText(msg(locale, "simulations.player.bestSoFar"))).toBeVisible({ timeout: SERVER_WAIT });
    await page.goForward();
    await expect(page.getByRole("heading", { level: 1, name: title(s, locale) })).toBeVisible({ timeout: SERVER_WAIT });
    // "Try again" opens the intro too.
    await page.getByRole("link", { name: msg(locale, "simulations.result.actions.tryAgain"), exact: true }).click();
    await expect(page.getByRole("button", { name: msg(locale, "simulations.player.start") })).toBeVisible({ timeout: SERVER_WAIT });
    await expect(page.getByText(msg(locale, "simulations.player.bestSoFar"))).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("region", { name: msg(locale, "simulations.result.summary.label") })).toBeVisible({ timeout: SERVER_WAIT });

    await noHorizontalScroll(page);
    await checkSchemes(page, testInfo, "result");
  });

  test("a refresh resumes the attempt where it stopped; start over begins again", async ({ page, uniqueEmail, strongPassword }, testInfo) => {
    const locale: Locale = "ar";
    const s = scenario("blood-spill-patient-room");
    const total = s.stages.length;
    await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword(), locale });

    // Intro: setting, how it works, start button.
    await page.goto(`/${locale}/simulations/${s.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: title(s, locale) })).toBeVisible({ timeout: SERVER_WAIT });
    await expect(page.getByRole("heading", { level: 2, name: msg(locale, "simulations.player.situation") })).toBeVisible();
    await checkSchemes(page, testInfo, "intro");
    await noHorizontalScroll(page);

    await openAndStart(page, locale, s.slug);
    await answerStage(page, locale, s, 0, correctChoice(s.stages[0]));
    await answerStage(page, locale, s, 1, wrongChoice(s.stages[1]));

    // The answers are on the server: a reload shows stage 3 directly, without the start button.
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: stageLabel(locale, 3, total) })).toBeVisible({ timeout: SERVER_WAIT });
    await expect(page.getByRole("button", { name: msg(locale, "simulations.player.start") })).toHaveCount(0);
    // Options of the current stage (both kinds are real form controls with labels).
    const role = s.stages[2].kind === "single" ? "radio" : "checkbox";
    await expect(page.getByRole(role, { name: text(s.stages[2].options[0], locale), exact: true })).toBeVisible();
    await noHorizontalScroll(page);
    await checkSchemes(page, testInfo, "stage");

    // The catalogue offers to continue it.
    await page.goto(`/${locale}/simulations`);
    const continueSection = page.getByRole("region", { name: msg(locale, "simulations.catalogue.continueTitle") });
    await expect(continueSection.getByText(title(s, locale), { exact: true })).toBeVisible({ timeout: SERVER_WAIT });
    await continueSection.getByRole("link", { name: msg(locale, "simulations.catalogue.card.continue") }).click();
    await expect(page.getByRole("heading", { level: 2, name: stageLabel(locale, 3, total) })).toBeVisible({ timeout: SERVER_WAIT });

    // Start over: a confirmation, then stage 1 of a fresh attempt.
    await page.getByRole("button", { name: msg(locale, "simulations.player.restart.button") }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText(msg(locale, "simulations.player.restart.title"))).toBeVisible();
    await dialog.getByRole("button", { name: msg(locale, "simulations.player.restart.confirm") }).click();
    await expect(page.getByRole("heading", { level: 2, name: stageLabel(locale, 1, total) })).toBeFocused({ timeout: SERVER_WAIT });
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: stageLabel(locale, 1, total) })).toBeVisible({ timeout: SERVER_WAIT });
  });
});
