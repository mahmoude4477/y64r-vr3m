import { expectAccessible } from "../support/a11y";
import { createVerifiedUser } from "../support/auth";
import { expect, type Locale, msg, test } from "../support/fixtures";
import { answerStage, correctChoice, openAndStart, playScenario, scenario, scoreText, SERVER_WAIT, stageLabel, title } from "./helpers";

// The trainee screens once there is history (review round 1, SPEC-1 / UX-1 / SPEC-4): score, risk and "in progress"
// badges in every tone, checked with axe in both languages and both themes. The specs before only scanned a fresh
// account, so the green / amber / blue badges were never measured, and they failed AA contrast in light mode.
//
// One trainee per project: a Low result with steps still to improve (92%), a Medium result (70%), and an attempt left
// open on a scenario already completed (the card then shows the progress and the best score together).

const LOW = scenario("hand-hygiene-station-icu"); // all right except stage 6 (option 2): 92 %, low risk, one gap
const MEDIUM = scenario("food-on-night-shift"); // all right except stage 1 (option 1): 70 %, medium risk

async function scan(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo, label: string, schemes: ReadonlyArray<"light" | "dark">) {
  for (const scheme of schemes) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: SERVER_WAIT });
    if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await expectAccessible(page, testInfo, { label: `${label}-${scheme}` });
  }
}

test.describe("screens with history", () => {
  // A sign-up, two full play-throughs, one more answer and about a dozen axe scans.
  test.describe.configure({ timeout: 300_000 });

  test("catalogue, intro and results with scores and risks in every tone are accessible in both languages and themes", async ({
    page,
    uniqueEmail,
    strongPassword,
  }, testInfo) => {
    const en: Locale = "en";
    await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword(), locale: en });

    // A Low result with a gap: the hint never claims every step was followed (UX-3).
    await playScenario(page, en, LOW, (stage, i) => (i === 5 ? [1] : correctChoice(stage)));
    const lowSummary = page.getByRole("region", { name: msg(en, "simulations.result.summary.label") });
    await expect(lowSummary).toContainText(scoreText(en, 92));
    await expect(lowSummary).toContainText(msg(en, "common.risk.low"));
    await expect(lowSummary).toContainText(msg(en, "simulations.result.summary.riskHint.gaps"));
    await scan(page, testInfo, "result-low-en", ["light", "dark"]);

    // A Medium result (amber score and risk).
    const mediumId = await playScenario(page, en, MEDIUM, (stage, i) => (i === 0 ? [0] : correctChoice(stage)));
    const mediumSummary = page.getByRole("region", { name: msg(en, "simulations.result.summary.label") });
    await expect(mediumSummary).toContainText(scoreText(en, 70));
    await expect(mediumSummary).toContainText(msg(en, "common.risk.medium"));
    await scan(page, testInfo, "result-medium-en", ["light"]);
    await page.goto(`/ar/simulations/attempts/${mediumId}`);
    await scan(page, testInfo, "result-medium-ar", ["light", "dark"]);

    // An attempt left open on the scenario completed at 70 %.
    await openAndStart(page, en, MEDIUM.slug);
    await answerStage(page, en, MEDIUM, 0, correctChoice(MEDIUM.stages[0]));
    await expect(page.getByRole("heading", { level: 2, name: stageLabel(en, 2, MEDIUM.stages.length) })).toBeFocused();

    // The catalogue card keeps the history next to the progress (SPEC-4).
    for (const locale of ["en", "ar"] as const) {
      await page.goto(`/${locale}/simulations`);
      const card = page.getByRole("article").filter({ has: page.getByRole("heading", { level: 3, name: title(MEDIUM, locale), exact: true }) });
      await expect(card).toBeVisible({ timeout: SERVER_WAIT });
      await expect(card.getByText(msg(locale, "common.attemptStatus.in_progress"))).toBeVisible();
      await expect(card.getByText(stageLabel(locale, 2, MEDIUM.stages.length))).toBeVisible();
      await expect(card).toContainText(msg(locale, "simulations.catalogue.card.best"));
      await expect(card).toContainText(scoreText(locale, 70));
      // Nothing is said on a card never completed: the Start button already says it (UX-19).
      const fresh = page.getByRole("article").filter({ has: page.getByRole("heading", { level: 3, name: title(scenario("faulty-infusion-pump"), locale), exact: true }) });
      await expect(fresh).toBeVisible();
      await expect(fresh).not.toContainText(msg(locale, "simulations.catalogue.card.best"));
      await scan(page, testInfo, `catalogue-${locale}`, locale === "en" ? ["light", "dark"] : ["light"]);
    }

    // The intro of a completed scenario shows the best score so far.
    await page.goto(`/ar/simulations/${LOW.slug}`);
    await expect(page.getByText(msg("ar", "simulations.player.bestSoFar"))).toBeVisible({ timeout: SERVER_WAIT });
    await scan(page, testInfo, "intro-best-ar", ["light", "dark"]);
  });
});
