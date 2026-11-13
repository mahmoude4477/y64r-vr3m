import { randomUUID } from "node:crypto";
import { type Browser, type BrowserContext, expect, type Locator, type Page } from "@playwright/test";
import { protocols } from "../../prisma/seed/protocols";
import { addMember, createOrganization, createVerifiedUser } from "../support/auth";
import { ADMIN_STATE } from "../support/env";
import { type Locale, msg, urlPath, waitForHydration } from "../support/fixtures";
import { fill, protocolTitle, SERVER_WAIT } from "./helpers";

// Helpers of the scenario-editor specs (e2e/simulations/admin*.spec.ts). Every spec builds its scenarios for a fresh
// institution, never global ones: other specs count the published global catalogue, and they must not see these.

/** The shared platform admin's session (read-only use: never sign out or change it). */
export async function adminContext(browser: Browser, clientIp: string): Promise<BrowserContext> {
  return browser.newContext({ storageState: ADMIN_STATE, extraHTTPHeaders: { "x-real-ip": clientIp } });
}

export const SHARPS = "sharps-safety";

/** The text of a seed step in the page language (the editor lists steps as "<order>. <text>"). */
export function stepText(protocolSlug: string, key: string, locale: Locale): string {
  const step = protocols.find((x) => x.slug === protocolSlug)?.steps.find((s) => s.key === key);
  if (!step) throw new Error(`unknown seed step ${protocolSlug}/${key}`);
  return locale === "ar" ? step.textAr : step.textEn;
}

/** The "one" branch of an ICU plural message ("{count, plural, … one {1 attempt} …}" -> "1 attempt"). */
export function pluralOne(locale: Locale, key: string): string {
  const match = /\sone \{([^}]*)\}/.exec(msg(locale, key));
  if (!match) throw new Error(`no "one" branch in ${locale}:${key}`);
  return match[1];
}

/**
 * One branch of an ICU plural message with its arguments filled in, nested braces included:
 * pluralBranch("en", "…publishReplaces", "one", { versions: "1" }) -> "Version 1 is unpublished at the same time."
 */
export function pluralBranch(locale: Locale, key: string, branch: string, values: Record<string, string | number>): string {
  const message = msg(locale, key);
  const start = message.indexOf(` ${branch} {`);
  if (start < 0) throw new Error(`no "${branch}" branch in ${locale}:${key}`);
  let depth = 0;
  let body = "";
  for (let i = message.indexOf("{", start); i < message.length; i++) {
    const c = message[i];
    if (c === "{") depth++;
    if (c === "}") depth--;
    if (depth === 0) break;
    if (!(depth === 1 && c === "{")) body += c;
  }
  return fill(body, values);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A fresh institution (the admin becomes its owner) with a trainee member signed in on `trainee`. */
export async function institutionWithTrainee(
  admin: BrowserContext,
  trainee: Page,
  account: { email: string; password: string },
): Promise<{ id: string; name: string }> {
  const name = `مستشفى المحرر ${randomUUID().slice(0, 8)}`;
  const org = await createOrganization(admin.request, { name, slug: `e2e-${randomUUID().slice(0, 12)}`, type: "hospital" });
  await createVerifiedUser(trainee.request, { ...account, locale: "en" });
  await addMember(admin.request, trainee.request, { organizationId: org.id, email: account.email, role: "trainee" });
  return { id: org.id, name };
}

export type NewScenario = { titleEn: string; titleAr: string; slug: string };

/** Fills the "new scenario" form for an institution and creates the draft; returns its editor id. */
export async function createDraftThroughUi(page: Page, locale: Locale, institution: string, tag = randomUUID().slice(0, 8)): Promise<NewScenario & { id: string }> {
  const s: NewScenario = { titleEn: `E2E sharps drill ${tag}`, titleAr: `تدريب الأدوات الحادة ${tag}`, slug: `e2e-sharps-drill-${tag}` };
  await page.goto(`/${locale}/admin/scenarios/new`);
  const institutionRadio = page.getByRole("radio", { name: new RegExp(escape(msg(locale, "simulations.admin.create.ownerInstitution"))) });
  await expect(institutionRadio).toBeVisible({ timeout: SERVER_WAIT });
  await waitForHydration(institutionRadio);
  await institutionRadio.click();

  await page.getByRole("combobox", { name: msg(locale, "simulations.admin.create.institution"), exact: true }).click();
  await page.getByRole("combobox", { name: msg(locale, "simulations.admin.create.institutionSearch") }).fill(institution);
  await page.getByRole("option", { name: institution, exact: true }).click();

  await page.getByRole("combobox", { name: msg(locale, "simulations.admin.fields.protocol"), exact: true }).click();
  await page.getByRole("option", { name: protocolTitle(SHARPS, locale), exact: true }).click();

  await page.getByLabel(msg(locale, "simulations.admin.fields.titleAr")).fill(s.titleAr);
  await page.getByLabel(msg(locale, "simulations.admin.fields.titleEn")).fill(s.titleEn);
  await page.getByLabel(msg(locale, "simulations.admin.fields.introAr")).fill("تمرين قصير على التخلص الآمن من الإبر.");
  await page.getByLabel(msg(locale, "simulations.admin.fields.introEn")).fill("A short drill on disposing of needles safely.");
  await page.getByLabel(msg(locale, "simulations.admin.fields.settingAr")).fill("جناح الباطنية، المناوبة الصباحية.");
  await page.getByLabel(msg(locale, "simulations.admin.fields.settingEn")).fill("A medical ward on the morning shift.");
  // The address follows the English title.
  await expect(page.getByLabel(msg(locale, "simulations.admin.create.slug"))).toHaveValue(s.slug);

  await page.getByRole("button", { name: msg(locale, "simulations.admin.create.submit") }).click();
  await expect(page).toHaveURL(/\/admin\/scenarios\/(?!new)[^/?#]+$/, { timeout: SERVER_WAIT });
  await expect(page.getByRole("heading", { level: 1, name: locale === "ar" ? s.titleAr : s.titleEn })).toBeVisible({ timeout: SERVER_WAIT });
  const id = new URL(page.url()).pathname.split("/").pop() ?? "";
  return { ...s, id };
}

export function stageGroup(page: Page, locale: Locale, n: number): Locator {
  return page.getByRole("group", { name: fill(msg(locale, "simulations.admin.editor.stage"), { n }), exact: true });
}

export function optionGroup(stage: Locator, locale: Locale, n: number): Locator {
  return stage.getByRole("group", { name: fill(msg(locale, "simulations.admin.editor.option"), { n }), exact: true });
}

export const OPTIONS = {
  right: {
    textAr: "أتخلص من الإبرة فورًا في حاوية الأدوات الحادة بجانب السرير.",
    textEn: "I drop the needle straight into the sharps container at the bedside.",
    feedbackAr: "صحيح. التخلص الفوري عند نقطة الاستخدام يمنع الوخز (منظمة الصحة العالمية).",
    feedbackEn: "Correct. Immediate disposal at the point of use prevents needlesticks (WHO).",
  },
  wrong: {
    textAr: "أعيد الغطاء إلى الإبرة بكلتا يدي ثم أتخلص منها لاحقًا.",
    textEn: "I put the cap back on with both hands and dispose of it later.",
    feedbackAr: "خطأ جسيم. إعادة تغطية الإبرة باليدين من أكثر أسباب إصابات الوخز.",
    feedbackEn: "Serious error. Two-handed recapping is a leading cause of needlestick injuries.",
  },
} as const;

/** Fills option `n` of a stage group (both languages). */
export async function fillOption(stage: Locator, locale: Locale, n: number, o: { textAr: string; textEn: string; feedbackAr: string; feedbackEn: string }) {
  const group = optionGroup(stage, locale, n);
  await group.getByLabel(msg(locale, "simulations.admin.fields.optionTextAr")).fill(o.textAr);
  await group.getByLabel(msg(locale, "simulations.admin.fields.optionTextEn")).fill(o.textEn);
  await group.getByLabel(msg(locale, "simulations.admin.fields.feedbackAr")).fill(o.feedbackAr);
  await group.getByLabel(msg(locale, "simulations.admin.fields.feedbackEn")).fill(o.feedbackEn);
}

/** Picks the protocol step of option `n` by the start of its text. */
export async function linkStep(page: Page, stage: Locator, locale: Locale, n: number, label: string) {
  await optionGroup(stage, locale, n).getByRole("combobox", { name: msg(locale, "simulations.admin.fields.step") }).click();
  await page.getByRole("option", { name: new RegExp(escape(label.slice(0, 40))) }).click();
}

/** Adds stage 1 (one correct answer) with a right option and a critical wrong one, both linked to "no recap". */
export async function addOneStage(page: Page, locale: Locale) {
  await page.getByRole("button", { name: msg(locale, "simulations.admin.editor.addStage") }).click();
  const stage = stageGroup(page, locale, 1);
  await expect(stage).toBeVisible();
  await stage.getByLabel(msg(locale, "simulations.admin.fields.promptAr")).fill("ماذا تفعل بالإبرة بعد الحقنة؟");
  await stage.getByLabel(msg(locale, "simulations.admin.fields.promptEn")).fill("What do you do with the needle after the injection?");
  await fillOption(stage, locale, 1, OPTIONS.right);
  await fillOption(stage, locale, 2, OPTIONS.wrong);
  const step = stepText(SHARPS, "no-recap", locale);
  await linkStep(page, stage, locale, 1, step);
  await linkStep(page, stage, locale, 2, step);
  await optionGroup(stage, locale, 2).getByRole("checkbox", { name: msg(locale, "simulations.admin.fields.critical") }).check();
  return stage;
}

/**
 * Visible text only. getByText (unlike getByRole) also matches hidden copies: the page a client navigation left (Next
 * keeps it hidden in an Activity) and a streamed Suspense segment React has not revealed yet. Either one turned a
 * plain getByText(...).toBeVisible() into a strict-mode failure.
 */
export function visibleText(scope: Page | Locator, text: string, options?: { exact?: boolean }): Locator {
  return scope.getByText(text, options).filter({ visible: true });
}

/**
 * Before an axe run: no toast on screen (axe would measure one mid-animation) and the pointer off the button just
 * clicked (axe would measure the hover colour of a primary button; its contrast is a foundation request).
 */
export async function readyForAxe(page: Page) {
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
  await page.mouse.move(0, 0);
}

/** Saves the editor and waits for "All changes saved". */
export async function saveEditor(page: Page, locale: Locale) {
  await page.getByRole("button", { name: msg(locale, "simulations.admin.editor.save") }).click();
  await expect(visibleText(page, msg(locale, "simulations.admin.editor.upToDate"), { exact: true })).toBeVisible({ timeout: SERVER_WAIT });
}

/** Publishes from the editor (confirm dialog) and waits for the Published badge. */
export async function publish(page: Page, locale: Locale, expectReplaces?: string) {
  await page.getByRole("button", { name: msg(locale, "simulations.admin.actions.publish"), exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: msg(locale, "simulations.admin.actions.publishTitle") });
  await expect(dialog).toBeVisible();
  if (expectReplaces) await expect(dialog).toContainText(expectReplaces);
  await dialog.getByRole("button", { name: msg(locale, "simulations.admin.actions.publish"), exact: true }).click();
  // Unnamed on purpose: the closing dialog re-renders with the other title and label until it is gone.
  await expect(page.getByRole("alertdialog")).toHaveCount(0, { timeout: SERVER_WAIT });
  await expect(page.getByRole("button", { name: msg(locale, "simulations.admin.actions.unpublish"), exact: true })).toBeVisible({ timeout: SERVER_WAIT });
}

/** A published one-stage scenario of `institution`, built through the UI; returns it with its editor URL. */
export async function publishedScenario(page: Page, locale: Locale, institution: string) {
  const s = await createDraftThroughUi(page, locale, institution);
  await addOneStage(page, locale);
  await saveEditor(page, locale);
  await publish(page, locale);
  expect(page.url()).toMatch(urlPath(`/${locale}/admin/scenarios/${s.id}`));
  return s;
}
