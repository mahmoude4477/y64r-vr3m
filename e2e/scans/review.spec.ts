import type { BrowserContext, Locator, Page } from "@playwright/test";
import { BASE_URL, TRAINEE_STATE } from "../support/env";
import { expect, msg, test } from "../support/fixtures";
import {
  expectAccessibleWithoutToasts,
  expectNoSidewaysScroll,
  HAND_HYGIENE,
  INSTITUTION_EN,
  joinInstitution,
  joinNewInstitution,
  SCAN_SEAMS,
  SHARPS,
  startAnalyzedScan,
  textRgb,
} from "./support";

// Smart scan, part 2: the examiner's review of /scans/[id] (AI verdicts, an override with a note, the steps the AI does
// not check, not-visible handling, the live score), finalising, the read-only report, deleting an unfinished scan, and
// who may open a scan at all. Needs the scan seams (E2E_SCAN_SEAMS=1: disk photo store + deterministic AI stub).

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A message with its {values} filled in and its rich-text tags (<person>…</person>) dropped, as the page shows it. */
const fill = (text: string, values: Record<string, string>) =>
  Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, v), text).replace(/<\/?[a-z]+>/g, "");
/** One branch of an ICU plural message from msg(), with # filled in: plural(msg(...), "one", 1). */
const plural = (text: string, branch: string, n: number) =>
  (text.match(new RegExp(`${branch} \\{([^}]*)\\}`))?.[1] ?? text).replace("#", String(n));

const step = (page: Page, key: string) => page.locator(`article[data-step-key="${key}"]`);
const choice = (card: Locator, verdict: "compliant" | "non_compliant" | "not_applicable") =>
  card.getByRole("radio", { name: new RegExp(`^${escape(msg("en", `common.verdict.${verdict}`))}`) });

/** Picks a verdict and waits until that step says it is saved. */
async function decide(page: Page, key: string, verdict: "compliant" | "non_compliant" | "not_applicable") {
  const card = step(page, key);
  await choice(card, verdict).click();
  await expect(choice(card, verdict)).toBeChecked();
  await expect(card.getByText(msg("en", "scans.detail.step.saved"), { exact: true })).toBeVisible();
}

/** A full-page picture in the HTML report (playwright-report), to look at the layout on desktop and on the phone. */
async function snapshot(page: Page, testInfo: { attach: (name: string, o: { body: Buffer; contentType: string }) => Promise<void> }, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

const finalizeButton = (page: Page) => page.getByRole("button", { name: msg("en", "scans.detail.finalize.button") });

test.describe("scan review and report (disk store + AI stub)", () => {
  test.skip(!SCAN_SEAMS, "needs E2E_SCAN_SEAMS=1 (e2e/README.md)");

  test("AI verdicts, an override, the other steps, finalise, then the read-only report", async (
    { page, browser, clientIp, uniqueEmail, strongPassword },
    testInfo,
  ) => {
    test.setTimeout(300_000); // institution + sign-up + upload + analysis + a dozen saves + eight axe scans
    await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });
    const area = `E2E sharps ${Date.now()}`;
    const scanId = await startAnalyzedScan(page, { area });

    await expect(page.getByRole("heading", { level: 1, name: area })).toBeVisible();
    // The stub's verdicts on the three visual steps, in step order; the other steps are the examiner's to answer.
    await expect(step(page, SHARPS.steps.disposal).locator('[data-ai-verdict="compliant"]')).toContainText("92%");
    await expect(step(page, SHARPS.steps.container).locator('[data-ai-verdict="non_compliant"]')).toContainText("81%");
    await expect(step(page, SHARPS.steps.fillLine).locator('[data-ai-verdict="not_visible"]')).toContainText(
      msg("en", "scans.detail.step.notVisible"),
    );
    await expect(step(page, SHARPS.steps.noRecap)).toContainText(msg("en", "scans.detail.step.manualOnly"));
    // A decisive AI verdict is preselected; a not-visible one is not.
    await expect(choice(step(page, SHARPS.steps.disposal), "compliant")).toBeChecked();
    await expect(choice(step(page, SHARPS.steps.container), "non_compliant")).toBeChecked();
    for (const v of ["compliant", "non_compliant", "not_applicable"] as const) {
      await expect(choice(step(page, SHARPS.steps.fillLine), v)).not.toBeChecked();
    }
    await snapshot(page, testInfo, "review");
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expectAccessibleWithoutToasts(page, testInfo, { label: `review-${scheme}` });
    }
    await page.emulateMedia({ colorScheme: "light" });

    // Three required steps have no answer yet: finalising says so and moves focus to the first of them.
    await finalizeButton(page).click();
    await expect(page.getByText(msg("en", "scans.detail.errors.incomplete")).first()).toBeVisible();
    await expect(step(page, SHARPS.steps.noRecap).locator("h3")).toBeFocused();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // Override the AI on one step, with a note that the report shows.
    await decide(page, SHARPS.steps.container, "compliant");
    const container = step(page, SHARPS.steps.container);
    await expect(container).toContainText(msg("en", "scans.detail.step.state.changed"));
    await container.getByRole("button", { name: msg("en", "scans.detail.step.addNote") }).click();
    const note = container.getByLabel(msg("en", "scans.detail.step.note"));
    await expect(note).toBeFocused();
    await note.fill("Container moved next to the bed during the visit");
    await note.blur();
    await expect(container.getByText(msg("en", "scans.detail.step.saving"))).toHaveCount(0);
    await expect(container.getByText(msg("en", "scans.detail.step.saved"), { exact: true })).toBeVisible();

    // The steps a photo cannot show; the not-visible step stays undecided (not counted, listed in the report).
    await decide(page, SHARPS.steps.noRecap, "compliant");
    await decide(page, SHARPS.steps.noHandCarry, "compliant");
    await decide(page, SHARPS.steps.injury, "non_compliant");

    // Live score: compliant weight 3 + 3 + 2 + 2 = 10 of 12 applicable -> 83 %, a mandatory step violated -> medium.
    const summary = page.getByRole("region", { name: msg("en", "scans.detail.summary.title") });
    await expect(summary).toContainText("83%");
    await expect(summary).toContainText(msg("en", "common.risk.medium"));
    await expect(summary).toContainText(msg("en", "scans.detail.summary.ready"));

    // Everything was saved on the server: a reload shows the same answers and the note.
    await page.reload();
    await expect(choice(step(page, SHARPS.steps.container), "compliant")).toBeChecked();
    await expect(choice(step(page, SHARPS.steps.injury), "non_compliant")).toBeChecked();
    await expect(step(page, SHARPS.steps.container).getByLabel(msg("en", "scans.detail.step.note"))).toHaveValue(
      "Container moved next to the bed during the visit",
    );

    // The examiner's notes on the whole scan: saved with the button; a line typed afterwards and not saved is saved
    // by finalising (the report shows both).
    const notes = page.getByLabel(msg("en", "scans.detail.notes.label"));
    await notes.fill("Ward manager informed.");
    await page.getByRole("button", { name: msg("en", "common.actions.save"), exact: true }).click();
    await expect(page.getByText(msg("en", "scans.detail.notes.saved"))).toBeVisible();
    await notes.fill("Ward manager informed. Follow-up visit next week.");
    await expect(page.getByText(msg("en", "scans.detail.notes.unsaved"))).toBeVisible();

    // Finalise: the confirmation shows the result, then the page becomes the report.
    await finalizeButton(page).click();
    const dialog = page.getByRole("alertdialog", { name: msg("en", "scans.detail.finalize.title") });
    await expect(dialog).toContainText("83%");
    await expect(dialog).toContainText(plural(msg("en", "scans.detail.finalize.unresolved"), "one", 1));
    await expectAccessibleWithoutToasts(page, testInfo, { label: "finalize-dialog" });
    await dialog.getByRole("button", { name: msg("en", "scans.detail.finalize.confirm") }).click();

    const result = page.getByRole("region", { name: msg("en", "scans.detail.report.result") });
    await expect(result).toContainText("83%", { timeout: 30_000 });
    await expect(result).toContainText(msg("en", "common.risk.medium"));
    await expect(result).toContainText(msg("en", "scans.detail.report.riskReason.mandatory"));
    await expect(page.locator("#scan-title")).toBeFocused();
    // Read-only: no decision controls, no delete.
    await expect(page.getByRole("radiogroup")).toHaveCount(0);
    await expect(page.getByRole("button", { name: msg("en", "scans.detail.delete.button") })).toHaveCount(0);

    const row = (key: string) => page.locator(`[data-step-key="${key}"]`).filter({ visible: true });
    await expect(row(SHARPS.steps.container)).toContainText(fill(msg("en", "scans.detail.report.steps.changedBy"), { name: "مقيّم اختبار" }));
    await expect(row(SHARPS.steps.container)).toContainText("Container moved next to the bed during the visit");
    await expect(row(SHARPS.steps.disposal)).toContainText(msg("en", "scans.detail.report.steps.accepted"));
    await expect(row(SHARPS.steps.fillLine)).toContainText(msg("en", "scans.detail.report.steps.notVisible"));
    // What to improve: the violated step, with a training scenario when the protocol has one.
    const recs = page.getByRole("region", { name: msg("en", "scans.detail.report.recommendations.title") });
    const train = msg("en", "scans.detail.report.recommendations.train").split("{title}")[0];
    await expect(recs.locator(`[data-step-key="${SHARPS.steps.injury}"]`)).toContainText(
      new RegExp(`${escape(train)}|${escape(msg("en", "scans.detail.report.recommendations.noScenario"))}`),
    );
    await expect(page.getByText("Ward manager informed. Follow-up visit next week.")).toBeVisible();

    const status = (await (await page.request.get(`/api/scans/${scanId}`)).json()) as { status: string };
    expect(status.status).toBe("finalized");
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expectAccessibleWithoutToasts(page, testInfo, { label: `report-${scheme}` });
      await snapshot(page, testInfo, `report-${scheme}`);
    }
    // The printed report stands on its own: it names the institution, and "(you)" is for the screen only.
    await page.emulateMedia({ media: "print", colorScheme: "light" });
    await expect(result.getByText(INSTITUTION_EN, { exact: true })).toBeVisible();
    await expect(page.getByText(msg("en", "scans.detail.meta.youSuffix"), { exact: true }).filter({ visible: true })).toHaveCount(0);
    // Every step row is printed (the table is no scroll box in print), and the dark theme prints like the light one.
    const table = page.locator("[data-slot=table-container]").filter({ visible: true });
    await expect(table).toHaveCSS("overflow-y", "visible");
    await expect(table.locator("tbody tr")).toHaveCount(6);
    const ink = () => page.locator("#scan-title").evaluate((el) => getComputedStyle(el).color);
    const lightInk = await ink();
    await page.emulateMedia({ media: "print", colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect.poll(ink).toBe(lightInk);
    await page.emulateMedia({ media: "screen", colorScheme: "light" });
    await expect(page.getByText(msg("en", "scans.detail.meta.youSuffix"), { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expectNoSidewaysScroll(page);

    // "New scan with this protocol" opens the form with the protocol already chosen (?protocol=<id>).
    await page.getByRole("link", { name: msg("en", "scans.detail.report.newScan") }).click();
    await expect(page).toHaveURL(/\/en\/scans\/new\?protocol=[A-Za-z0-9_-]+$/);
    await expect(page.getByRole("combobox", { name: msg("en", "scans.new.protocol") })).toContainText(SHARPS.titleEn);

    // Arabic (RTL): the same report, read-only after a fresh load.
    await page.goto(`/ar/scans/${scanId}`);
    await expect(page.getByRole("region", { name: msg("ar", "scans.detail.report.result") })).toContainText(msg("ar", "common.risk.medium"));
    await expect(page.getByRole("radiogroup")).toHaveCount(0);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expectAccessibleWithoutToasts(page, testInfo, { label: `report-ar-${scheme}` });
    }
  });

  test("delete an unfinished scan; a colleague may review it but not delete it", async (
    { page, browser, clientIp, uniqueEmail, strongPassword },
    testInfo,
  ) => {
    test.setTimeout(240_000);
    const inst = await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });
    const area = `E2E delete ${Date.now()}`;
    const scanId = await startAnalyzedScan(page, { area });

    // A second examiner of the same institution: sees and reviews the scan, has no delete button.
    const colleague = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { "x-real-ip": clientIp } });
    try {
      const other = await colleague.newPage();
      await joinInstitution(browser, other, { clientIp, organizationId: inst.organizationId, email: uniqueEmail(), password: strongPassword(), role: "examiner" });
      await other.goto(`/en/scans/${scanId}`);
      await expect(other.getByRole("heading", { level: 1, name: area })).toBeVisible();
      await expect(choice(step(other, SHARPS.steps.disposal), "compliant")).toBeChecked();
      await expect(other.getByRole("button", { name: msg("en", "scans.detail.delete.button") })).toHaveCount(0);
    } finally {
      await colleague.close();
    }

    // The examiner who started it deletes it, after a confirmation.
    await page.getByRole("button", { name: msg("en", "scans.detail.delete.button") }).click();
    const dialog = page.getByRole("alertdialog", { name: msg("en", "scans.detail.delete.title") });
    await expect(dialog).toBeVisible();
    await expectAccessibleWithoutToasts(page, testInfo, { label: "delete-dialog" });
    await dialog.getByRole("button", { name: msg("en", "common.actions.cancel") }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: msg("en", "scans.detail.delete.button") }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: msg("en", "scans.detail.delete.confirm") }).click();
    await expect(page).toHaveURL(/\/en\/scans$/, { timeout: 30_000 });
    await expect(page.getByText(msg("en", "scans.detail.delete.done"))).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(escape(area)) })).toHaveCount(0);

    // Gone with its photos: the scan and its review page are not found any more.
    expect((await page.request.get(`/api/scans/${scanId}`)).status()).toBe(404);
    await page.goto(`/en/scans/${scanId}`);
    await expect(page.getByRole("heading", { level: 1, name: msg("en", "common.notFound.title") })).toBeVisible();
  });

  test("unsure AI verdicts: pointed out before finalising, confirmed with the keyboard, and the report says who checked them", async (
    { page, browser, clientIp, uniqueEmail, strongPassword },
  ) => {
    test.setTimeout(300_000); // institution + sign-up + two analysed scans + saves + two reports
    await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });
    await page.emulateMedia({ colorScheme: "light" });
    // Six visual steps: the stub's fourth verdict is compliant at 55 %, a verdict the AI flags as unsure; the third
    // is not visible.
    await startAnalyzedScan(page, { area: `E2E unsure checked ${Date.now()}`, protocolTitle: HAND_HYGIENE.titleEn });

    const flagged = step(page, HAND_HYGIENE.unsureStep);
    await expect(flagged).toHaveAttribute("data-flagged", "true");
    const flaggedLine = flagged.getByText(msg("en", "scans.detail.step.state.ai_flagged"));
    await expect(flaggedLine).toBeVisible();
    // The warning reads amber (red over green over blue), not the green of "compliant" (round 2: an OKLCH mix with the
    // teal foreground turned it rgb(61,112,61)).
    const [r, g, b] = await textRgb(flaggedLine);
    expect(r, `warning text rgb(${r},${g},${b})`).toBeGreaterThan(g);
    expect(g, `warning text rgb(${r},${g},${b})`).toBeGreaterThan(b);
    await expect(page.locator("article[data-flagged]")).toHaveCount(1);
    // The confidence is an isolated percentage like every score (in Arabic its sign then sits on the same side).
    await expect(flagged.locator("[data-ai-verdict] bdi")).toHaveText("55%");
    const summary = page.getByRole("region", { name: msg("en", "scans.detail.summary.title") });
    await expect(summary).toContainText(plural(msg("en", "scans.detail.summary.unsure"), "one", 1));
    // The not-visible result is no answer: 5 of 6 answered, and the not-visible step is named on its own line.
    await expect(summary).toContainText(fill(msg("en", "scans.detail.summary.answered"), { answered: "5", total: "6" }));
    await expect(summary).toContainText(plural(msg("en", "scans.detail.summary.unresolved"), "one", 1));
    // Every step has an AI answer, so finalising is allowed at once: the confirmation still names the unsure verdict.
    await finalizeButton(page).click();
    const confirm = page.getByRole("alertdialog", { name: msg("en", "scans.detail.finalize.title") });
    await expect(confirm).toContainText(plural(msg("en", "scans.detail.finalize.unsure"), "one", 1));
    await confirm.getByRole("button", { name: msg("en", "common.actions.cancel") }).click();
    await expect(confirm).toBeHidden();

    // Confirming the verdict with the keyboard takes it off the list. The button removes itself, so focus moves to the
    // step's checked option, never to <body> (WCAG 2.4.3); "Use the AI verdict" does the same.
    await flagged.getByRole("button", { name: msg("en", "scans.detail.step.confirmAi") }).focus();
    await page.keyboard.press("Enter");
    await expect(flagged.getByText(msg("en", "scans.detail.step.saved"), { exact: true })).toBeVisible();
    await expect(flagged).toContainText(msg("en", "scans.detail.step.state.ai_confirmed"));
    await expect(choice(flagged, "compliant")).toBeFocused();
    await expect(page.locator("article[data-flagged]")).toHaveCount(0);
    await expect(summary).not.toContainText(plural(msg("en", "scans.detail.summary.unsure"), "one", 1));
    await flagged.getByRole("button", { name: msg("en", "scans.detail.step.backToAi") }).focus();
    await page.keyboard.press("Enter");
    await expect(flagged).toHaveAttribute("data-flagged", "true");
    await expect(choice(flagged, "compliant")).toBeFocused();
    // "Clear the answer" on the not-visible step: focus goes to its first option.
    const unseen = page.locator('article[data-state="unresolved"]');
    await expect(unseen).toHaveCount(1);
    const unseenKey = (await unseen.getAttribute("data-step-key"))!;
    await decide(page, unseenKey, "not_applicable");
    await step(page, unseenKey).getByRole("button", { name: msg("en", "scans.detail.step.clear") }).focus();
    await page.keyboard.press("Enter");
    await expect(step(page, unseenKey)).toHaveAttribute("data-state", "unresolved");
    await expect(step(page, unseenKey).getByRole("radio").first()).toBeFocused();
    // Confirmed again (by pointer this time), then finalised.
    await flagged.getByRole("button", { name: msg("en", "scans.detail.step.confirmAi") }).click();
    await expect(flagged).toContainText(msg("en", "scans.detail.step.state.ai_confirmed"));
    await expect(flagged.getByText(msg("en", "scans.detail.step.saved"), { exact: true })).toBeVisible();
    await expect(step(page, unseenKey).getByText(msg("en", "scans.detail.step.saved"), { exact: true })).toBeVisible();
    await finalizeButton(page).click();
    await expect(confirm).toBeVisible();
    await expect(confirm).not.toContainText(plural(msg("en", "scans.detail.finalize.unsure"), "one", 1));
    await confirm.getByRole("button", { name: msg("en", "scans.detail.finalize.confirm") }).click();

    // The report keeps the check: "confirmed by" the examiner, and the AI's own low confidence is named.
    const row = (key: string) => page.locator(`[data-step-key="${key}"]`).filter({ visible: true });
    await expect(page.getByRole("region", { name: msg("en", "scans.detail.report.result") })).toBeVisible({ timeout: 30_000 });
    await expect(row(HAND_HYGIENE.unsureStep)).toContainText(fill(msg("en", "scans.detail.report.steps.confirmedBy"), { name: "مقيّم اختبار" }));
    await expect(row(HAND_HYGIENE.unsureStep)).toContainText(fill(msg("en", "scans.detail.report.steps.lowConfidence"), { value: "55%" }));

    // A second scan finalised without looking at the unsure verdict: the report says nobody checked it.
    await startAnalyzedScan(page, { area: `E2E unsure unchecked ${Date.now()}`, protocolTitle: HAND_HYGIENE.titleEn });
    await finalizeButton(page).click();
    await expect(confirm).toContainText(plural(msg("en", "scans.detail.finalize.unsure"), "one", 1));
    await confirm.getByRole("button", { name: msg("en", "scans.detail.finalize.confirm") }).click();
    await expect(page.getByRole("region", { name: msg("en", "scans.detail.report.result") })).toBeVisible({ timeout: 30_000 });
    await expect(row(HAND_HYGIENE.unsureStep)).toContainText(msg("en", "scans.detail.report.steps.acceptedUnsure"));
    await expect(row(HAND_HYGIENE.unsureStep).locator("[data-decision]")).toHaveAttribute("data-decision", "acceptedUnsure");
    // A confident verdict nobody touched is simply "accepted".
    await expect(page.locator('[data-decision="accepted"]').filter({ visible: true }).first()).toContainText(
      msg("en", "scans.detail.report.steps.accepted"),
    );
  });

  test("an institution admin deletes another examiner's draft", async ({ page, browser, clientIp, uniqueEmail, strongPassword }, testInfo) => {
    test.setTimeout(240_000);
    const inst = await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });
    const area = `E2E manager delete ${Date.now()}`;
    const scanId = await startAnalyzedScan(page, { area });

    // An admin of the same institution (a manager) may delete a draft somebody else started.
    const managerCtx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { "x-real-ip": clientIp } });
    try {
      const manager = await managerCtx.newPage();
      await joinInstitution(browser, manager, { clientIp, organizationId: inst.organizationId, email: uniqueEmail(), password: strongPassword(), role: "admin" });
      await manager.goto(`/en/scans/${scanId}`);
      await expect(manager.getByRole("heading", { level: 1, name: area })).toBeVisible();
      await manager.getByRole("button", { name: msg("en", "scans.detail.delete.button") }).click();
      await manager.getByRole("alertdialog").getByRole("button", { name: msg("en", "scans.detail.delete.confirm") }).click();
      await expect(manager).toHaveURL(/\/en\/scans$/, { timeout: 30_000 });
      await expect(manager.getByText(msg("en", "scans.detail.delete.done"))).toBeVisible();
      expect((await manager.request.get(`/api/scans/${scanId}`)).status()).toBe(404);
      await expectAccessibleWithoutToasts(manager, testInfo, { label: "list-after-manager-delete" });
    } finally {
      await managerCtx.close();
    }
    // The examiner who started it finds it gone too.
    expect((await page.request.get(`/api/scans/${scanId}`)).status()).toBe(404);
  });

  test("only staff of the scan's institution open it: a trainee of it, another institution and a trainee without one get not-found", async (
    { page, browser, clientIp, uniqueEmail, strongPassword },
  ) => {
    test.setTimeout(240_000);
    const inst = await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });
    const area = `E2E access ${Date.now()}`;
    const scanId = await startAnalyzedScan(page, { area });
    const notFound = (p: Page) => expect(p.getByRole("heading", { level: 1, name: msg("en", "common.notFound.title") })).toBeVisible();

    const contexts: BrowserContext[] = [];
    try {
      // A trainee of the same institution.
      const traineeCtx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { "x-real-ip": clientIp } });
      contexts.push(traineeCtx);
      const trainee = await traineeCtx.newPage();
      await joinInstitution(browser, trainee, { clientIp, organizationId: inst.organizationId, email: uniqueEmail(), password: strongPassword(), role: "trainee" });
      await trainee.goto(`/en/scans/${scanId}`);
      await notFound(trainee);
      await expect(trainee.getByText(area)).toHaveCount(0);
      expect((await trainee.request.get(`/api/scans/${scanId}`)).status()).toBe(403);

      // An examiner of another institution.
      const outsiderCtx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { "x-real-ip": clientIp } });
      contexts.push(outsiderCtx);
      const outsider = await outsiderCtx.newPage();
      await joinNewInstitution(browser, outsider, { clientIp, email: uniqueEmail(), password: strongPassword() });
      await outsider.goto(`/en/scans/${scanId}`);
      await notFound(outsider);
      await expect(outsider.getByText(area)).toHaveCount(0);

      // A trainee without an institution (the shared setup account, read-only use).
      const loneCtx = await browser.newContext({ baseURL: BASE_URL, storageState: TRAINEE_STATE, extraHTTPHeaders: { "x-real-ip": clientIp } });
      contexts.push(loneCtx);
      const lone = await loneCtx.newPage();
      await lone.goto(`/ar/scans/${scanId}`);
      await expect(lone.getByRole("heading", { level: 1, name: msg("ar", "common.notFound.title") })).toBeVisible();
    } finally {
      for (const c of contexts) await c.close();
    }

    // A malformed id is simply not found.
    await page.goto("/en/scans/not%20an%20id");
    await notFound(page);
  });
});
