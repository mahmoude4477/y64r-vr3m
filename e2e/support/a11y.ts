import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

// Automated accessibility checks (PRODUCT 7/9: WCAG 2.2 AA; note 09 §3.8).
// - Runs the WCAG 2.0/2.1/2.2 A + AA rules and axe's best practices.
// - FAILS on any violation with impact "serious" or "critical", and on the structure rules every page must meet
//   (CONVENTIONS 9: one h1, one main landmark).
// - Everything else (moderate/minor) is attached to the report as axe-violations.json, so it is visible but does
//   not block. Raise the bar later by adding impacts to FAIL_IMPACTS.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const FAIL_IMPACTS = new Set(["serious", "critical"]);
const ALWAYS_FAIL = new Set(["page-has-heading-one", "landmark-one-main"]);

export async function expectAccessible(
  page: Page,
  testInfo: TestInfo,
  opts: { exclude?: string[]; label?: string } = {},
) {
  // Streamed Suspense content first: skeletons are placeholders, not the page.
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  // Finished transitions too: axe measures colours as they are drawn, so a button fading back from its busy state
  // (opacity 50 % -> 100 %) or a toast fading in reads as low contrast for a moment. Endless animations (spinners) are
  // skipped; at most 2 s.
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => a.playState === "running" && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity));
    await Promise.race([
      Promise.all(finite.map((a) => a.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  });

  const builder = new AxeBuilder({ page }).withTags(TAGS);
  for (const selector of opts.exclude ?? []) builder.exclude(selector); // each exclusion needs a comment and an issue
  const { violations } = await builder.analyze();

  await testInfo.attach(`axe-violations${opts.label ? `-${opts.label}` : ""}.json`, {
    body: JSON.stringify(
      violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(" ")) })),
      null,
      2,
    ),
    contentType: "application/json",
  });

  const failing = violations
    .filter((v) => FAIL_IMPACTS.has(v.impact ?? "") || ALWAYS_FAIL.has(v.id))
    .map((v) => `${v.id} [${v.impact}] ${v.nodes.length}×: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(failing, `axe violations on ${page.url()}${opts.label ? ` (${opts.label})` : ""}`).toEqual([]);
}
