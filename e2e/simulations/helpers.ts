import { expect, type Page } from "@playwright/test";
import { protocols } from "../../prisma/seed/protocols";
import { type ScenarioSeed, type ScenarioStageSeed, scenarios } from "../../prisma/seed/scenarios";
import { type Locale, msg, urlPath, waitForHydration } from "../support/fixtures";

/** Waits on a server action or a streamed page: generous, because the full suite runs next to other heavy jobs. */
export const SERVER_WAIT = 45_000;

// Helpers of the simulations specs. The scenarios come from the seed (prisma/seed/scenarios.ts), the same content
// the e2e database was seeded with, so the specs follow content edits instead of hard-coding option texts.

export function scenario(slug: string): ScenarioSeed {
  const found = scenarios.find((s) => s.slug === slug);
  if (!found) throw new Error(`unknown seed scenario ${slug}`);
  return found;
}

export function protocolTitle(slug: string, locale: Locale): string {
  const found = protocols.find((p) => p.slug === slug);
  if (!found) throw new Error(`unknown seed protocol ${slug}`);
  return locale === "ar" ? found.titleAr : found.titleEn;
}

export function scenariosOf(protocolSlug: string): ScenarioSeed[] {
  return scenarios.filter((s) => s.protocolSlug === protocolSlug);
}

export function text(o: { textAr: string; textEn: string }, locale: Locale): string {
  return locale === "ar" ? o.textAr : o.textEn;
}

export function title(s: ScenarioSeed, locale: Locale): string {
  return locale === "ar" ? s.titleAr : s.titleEn;
}

export function feedback(o: { feedbackAr: string; feedbackEn: string }, locale: Locale): string {
  return locale === "ar" ? o.feedbackAr : o.feedbackEn;
}

/** A message with ICU arguments filled in ("Stage {current} of {total}"); plain arguments only, no plurals. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

export function stageLabel(locale: Locale, current: number, total: number): string {
  return fill(msg(locale, "simulations.player.stage.label"), { current, total });
}

/** Indexes of the options a perfect answer chooses. */
export function correctChoice(stage: ScenarioStageSeed): number[] {
  return stage.options.flatMap((o, i) => (o.isCorrect ? [i] : []));
}

/** One wrong option: a critical one when the stage has one, else the first wrong option. */
export function wrongChoice(stage: ScenarioStageSeed): number[] {
  const critical = stage.options.findIndex((o) => !o.isCorrect && o.isCritical);
  if (critical >= 0) return [critical];
  return [stage.options.findIndex((o) => !o.isCorrect)];
}

/** Opens the player and starts (or resumes) the attempt; waits for the first unanswered stage heading. */
export async function openAndStart(page: Page, locale: Locale, slug: string) {
  await page.goto(`/${locale}/simulations/${slug}`);
  const start = page.getByRole("button", { name: msg(locale, "simulations.player.start") });
  await expect(start).toBeVisible({ timeout: SERVER_WAIT });
  await waitForHydration(start);
  await start.click();
}

/**
 * Answers one stage (the stage heading must be on screen): ticks the options, confirms, and waits until the next
 * stage heading has focus (or the result page for the last one).
 */
export async function answerStage(page: Page, locale: Locale, s: ScenarioSeed, index: number, choice: number[]) {
  const stage = s.stages[index];
  const total = s.stages.length;
  await expect(page.getByRole("heading", { level: 2, name: stageLabel(locale, index + 1, total) })).toBeVisible({ timeout: SERVER_WAIT });
  const role = stage.kind === "single" ? "radio" : "checkbox";
  for (const i of choice) {
    const option = page.getByRole(role, { name: text(stage.options[i], locale), exact: true });
    await option.click();
    await expect(option).toBeChecked();
  }
  const last = index + 1 === total;
  await page
    .getByRole("button", { name: msg(locale, last ? "simulations.player.stage.confirmLast" : "simulations.player.stage.confirm") })
    .click();
  if (last) {
    await expect(page).toHaveURL(/\/simulations\/attempts\/[^/?#]+$/, { timeout: SERVER_WAIT });
  } else {
    // Focus moves to the new stage heading (WCAG 2.4.3): keyboard and screen-reader users continue from there.
    await expect(page.getByRole("heading", { level: 2, name: stageLabel(locale, index + 2, total) })).toBeFocused({ timeout: SERVER_WAIT });
  }
}

/** Plays a whole scenario with `choose(stage)` per stage; returns the attempt id from the result URL. */
export async function playScenario(
  page: Page,
  locale: Locale,
  s: ScenarioSeed,
  choose: (stage: ScenarioStageSeed, index: number) => number[],
): Promise<string> {
  await openAndStart(page, locale, s.slug);
  for (let i = 0; i < s.stages.length; i++) await answerStage(page, locale, s, i, choose(s.stages[i], i));
  await expect(page.getByRole("heading", { level: 1, name: title(s, locale) })).toBeVisible({ timeout: SERVER_WAIT });
  const id = new URL(page.url()).pathname.split("/").pop() ?? "";
  expect(page.url()).toMatch(urlPath(`/${locale}/simulations/attempts/${id}`));
  return id;
}

/** The score as the result page prints it ("100%", Arabic "100٪"). */
export function scoreText(locale: Locale, score: number): string {
  return fill(msg(locale, "common.score.value"), { score });
}
