import { expectAccessible } from "../support/a11y";
import { ADMIN_STATE, TRAINEE_STATE } from "../support/env";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import {
  cleanup,
  confirmDialog,
  db,
  editorForm,
  editorIdFromUrl,
  editorStep,
  fillStepTexts,
  msgWith,
  noToasts,
  notFoundHeading,
  otherInstitution,
  seedProtocol,
  testSlug,
} from "./support";

// The global protocol editor (/admin/protocols/**) as the platform admin: create -> publish -> everyone sees it in
// the library -> unpublish -> delete the unused draft; the validation errors; the history rules (a step with results
// cannot be removed, the protocol cannot be deleted, a new version is a draft copy); the read-only view of an
// institution's protocol. Every row the specs create has an "e2e-" address and is removed afterwards.

test.use({ storageState: ADMIN_STATE });

const EDITOR_URL = (locale: "ar" | "en") => new RegExp(`/${locale}/admin/protocols/[a-z0-9]{20,}$`);

test("creates a global protocol, publishes it for every user, then unpublishes and deletes it", async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000); // a long form, two contexts, four axe scans, the database helper
  const slug = testSlug("global");
  const titleAr = `بروتوكول اختبار ${slug}`;
  const titleEn = `Test protocol ${slug}`;
  const e = (key: string) => msg("en", `protocols.editor.${key}`);
  try {
    await page.goto("/en/admin/protocols");
    await expect(page.getByRole("heading", { level: 1, name: msg("en", "protocols.admin.title") })).toBeVisible();
    // The seed protocols are listed as published global protocols, each opening its editor.
    const sharps = seedProtocol("sharps-safety");
    await expect(page.getByRole("link", { name: sharps.titleEn, exact: true })).toHaveAttribute("href", /^\/en\/admin\/protocols\/[a-z0-9]+$/);
    await expectAccessible(page, testInfo, { label: "admin list light" });

    await page.getByRole("link", { name: msg("en", "protocols.admin.new") }).click();
    await expect(page).toHaveURL(urlPath("/en/admin/protocols/new"));
    const form = editorForm(page);
    await expect(page.getByRole("heading", { level: 1, name: e("newTitle") })).toBeVisible();
    await waitForHydration(form.getByLabel(e("fields.titleAr"), { exact: true }));

    await form.getByLabel(e("fields.titleAr"), { exact: true }).fill(titleAr);
    await form.getByLabel(e("fields.titleEn"), { exact: true }).fill(titleEn);
    // The address follows the English title until it is typed.
    await expect(form.getByLabel(e("fields.slug"), { exact: true })).toHaveValue(`test-protocol-${slug}`);
    await form.getByLabel(e("fields.slug"), { exact: true }).fill(slug);
    await form.getByLabel(e("fields.summaryAr"), { exact: true }).fill("ملخص قصير للاختبار.");
    await form.getByLabel(e("fields.summaryEn"), { exact: true }).fill("A short summary for the test.");
    await form.getByLabel(e("fields.descriptionAr"), { exact: true }).fill("وصف بروتوكول الاختبار.");
    await form.getByLabel(e("fields.descriptionEn"), { exact: true }).fill("Description of the test protocol.");
    await form.getByRole("radio", { name: msg("en", "common.category.safety"), exact: true }).check();
    await form.getByRole("radio", { name: e("icons.hand"), exact: true }).check();

    // Step 1 (open on a new protocol): critical, which also makes it mandatory.
    const first = editorStep(page, 0);
    await fillStepTexts(first, "en", {
      textAr: "ارتدِ القفازات قبل ملامسة الدم.",
      textEn: "Wear gloves before touching blood.",
      rationaleAr: "تحمي القفازات من التعرض للدم.",
      rationaleEn: "Gloves protect against blood exposure.",
    });
    await first.getByRole("switch", { name: e("steps.fields.critical") }).click();
    await expect(first.getByRole("switch", { name: e("steps.fields.mandatory") })).toBeChecked();
    await expect(first.getByText(e("steps.fields.mandatoryLocked"))).toBeVisible();

    // Step 2: added, opened and focused; checked in photos with criteria and a reference.
    await form.getByRole("button", { name: e("steps.add") }).click();
    const second = editorStep(page, 1);
    await expect(second.getByLabel(e("steps.fields.textAr"), { exact: true })).toBeFocused();
    await fillStepTexts(second, "en", {
      textAr: "أغلق حاوية الأدوات الحادة.",
      textEn: "Close the sharps container.",
      rationaleAr: "الحاوية المفتوحة قد تسبب وخزًا.",
      rationaleEn: "An open container can cause a needlestick.",
    });
    await second.getByRole("switch", { name: e("steps.fields.visual") }).click();
    await second.getByLabel(e("steps.fields.criteriaAr"), { exact: true }).fill("الحاوية مغلقة.");
    await second.getByLabel(e("steps.fields.criteriaEn"), { exact: true }).fill("The container is closed.");
    await second.getByRole("radio", { name: e("steps.fields.weight3") }).check();
    await second.getByLabel(e("steps.fields.referenceLabel"), { exact: true }).fill("CDC – Sharps Safety for Healthcare Settings");
    await second.getByLabel(e("steps.fields.referenceUrl"), { exact: true }).fill("https://www.cdc.gov/sharps-safety/");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expectAccessible(page, testInfo, { label: "new protocol dark" });
    await page.emulateMedia({ colorScheme: "light" });

    await form.getByRole("button", { name: e("actions.create") }).click();
    await expect(page).toHaveURL(EDITOR_URL("en"), { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: titleEn })).toBeVisible();
    await expect(page.getByText(`/protocols/${slug}`)).toBeVisible();
    const status = page.getByRole("region", { name: e("status.label") });
    await expect(status.getByText(e("status.draft"), { exact: true })).toBeVisible();
    await expect(status.getByText(e("audience.globalDraft"))).toBeVisible();
    await noToasts(page);
    await expectAccessible(page, testInfo, { label: "editor light" });

    // A draft is nobody's but the admins'.
    const trainee = await browser.newContext({ storageState: TRAINEE_STATE });
    try {
      const tPage = await trainee.newPage();
      await tPage.goto(`/en/protocols/${slug}`);
      await expect(tPage.getByRole("heading", notFoundHeading("en"))).toBeVisible();

      await confirmDialog(page, e("actions.publish"));
      await expect(status.getByText(e("status.published"), { exact: true })).toBeVisible();
      await expect(status.getByRole("link", { name: e("actions.viewInLibrary") })).toHaveAttribute("href", `/en/protocols/${slug}`);

      // Published: in every user's library, with both steps in order.
      await tPage.goto("/en/protocols");
      await tPage.getByRole("link", { name: titleEn, exact: true }).click();
      await expect(tPage).toHaveURL(urlPath(`/en/protocols/${slug}`));
      const steps = tPage.getByRole("region", { name: msg("en", "protocols.detail.steps"), exact: true }).getByRole("listitem");
      await expect(steps).toHaveCount(2);
      await expect(steps.nth(0)).toContainText("Wear gloves before touching blood.");
      await expect(steps.nth(0).getByText(msg("en", "protocols.badges.critical"), { exact: true })).toBeVisible();
      await expect(steps.nth(1).getByText(msg("en", "protocols.badges.visual"), { exact: true })).toBeVisible();
      await expect(steps.nth(1).getByRole("link", { name: "CDC – Sharps Safety for Healthcare Settings" })).toHaveAttribute(
        "href",
        "https://www.cdc.gov/sharps-safety/",
      );

      await confirmDialog(page, e("actions.unpublish"));
      await expect(status.getByText(e("status.draft"), { exact: true })).toBeVisible();
      await tPage.goto(`/en/protocols/${slug}`);
      await expect(tPage.getByRole("heading", notFoundHeading("en"))).toBeVisible();
    } finally {
      await trainee.close();
    }

    // Nothing uses it: the draft can be deleted.
    await expect(page.getByText(msg("en", "protocols.editor.history.unused"))).toBeVisible();
    await confirmDialog(page, e("actions.delete"));
    await expect(page).toHaveURL(urlPath("/en/admin/protocols"));
    await expect(page.getByRole("link", { name: titleEn, exact: true })).toHaveCount(0);
  } finally {
    cleanup({ protocolSlugs: [slug] });
  }
});

test("shows every validation error at its field and moves focus to the first one", async ({ page }) => {
  test.slow(); // a long form re-validated on every change, next to the rest of the suite
  const e = (key: string) => msg("ar", `protocols.editor.${key}`);
  await page.goto("/ar/admin/protocols/new");
  const form = editorForm(page);
  const create = form.getByRole("button", { name: e("actions.create") });
  await waitForHydration(create);
  await create.click();

  // Nothing was sent: the browser runs the same schema as the server.
  await expect(page).toHaveURL(urlPath("/ar/admin/protocols/new"));
  await expect(form.getByRole("alert").first()).toBeVisible();
  // One announcement (the summary): the field errors are linked to their fields, not live regions of their own.
  await expect(form.getByRole("alert")).toHaveCount(1);
  await expect(form.getByLabel(e("fields.titleAr"), { exact: true })).toBeFocused();
  await expect(form.getByLabel(e("fields.titleAr"), { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByText(msg("ar", "validation.invalidOption")).first()).toBeVisible(); // category
  await expect(form.getByText(msg("ar", "validation.required")).first()).toBeVisible();
  await expect(editorStep(page, 0).getByText(e("steps.needsAttention"))).toBeVisible();

  // The address pattern, photo criteria for photo-checkable steps, https links with a name.
  await form.getByLabel(e("fields.slug"), { exact: true }).fill("bad slug!");
  await expect(form.getByText(msg("ar", "validation.slug"))).toBeVisible();
  const step = editorStep(page, 0);
  await step.getByRole("switch", { name: e("steps.fields.visual") }).click();
  await create.click();
  await expect(step.getByText(msg("ar", "validation.visualCriteriaRequired")).first()).toBeVisible();
  await expect(form.getByLabel(e("fields.titleAr"), { exact: true })).toBeFocused(); // still the first error
  await step.getByLabel(e("steps.fields.referenceUrl"), { exact: true }).fill("http://example.com/guideline");
  // A plain http link gets its own reason (validation.httpsOnly), not the generic "enter a valid URL".
  await expect(step.getByText(msg("ar", "validation.httpsOnly"))).toBeVisible();
  // A link with a user name in it would hide where it really goes.
  await step.getByLabel(e("steps.fields.referenceUrl"), { exact: true }).fill("https://www.who.int@evil.example/");
  await expect(step.getByText(msg("ar", "validation.url"))).toBeVisible();
  await step.getByLabel(e("steps.fields.referenceUrl"), { exact: true }).fill("https://www.who.int/publications/i/item/9789241597906");
  await expect(step.getByText(msg("ar", "validation.url"))).toHaveCount(0);

  // The last step cannot be removed.
  await step.getByRole("button", { name: msg("ar", "protocols.editor.steps.remove").replace("{number}", "1") }).click({ force: true });
  await expect(page.getByText(e("steps.lastStep"))).toBeVisible();
  await expect(form.locator("ol > li")).toHaveCount(1);
});

test("steps with history: kept, meaning fixed once there are results; a new version says what stays with the old one", async ({
  page,
  browser,
  clientIp,
}) => {
  test.setTimeout(240_000); // an institution, the database helper twice, two versions
  const org = await otherInstitution(browser, clientIp);
  const slug = testSlug("history");
  const scenario = testSlug("history-scn");
  const titleEn = `History ${slug}`;
  const ids = db([
    { type: "globalProtocol", slug, isPublished: true, titleAr: `تاريخ ${slug}`, titleEn },
    // Its two options point at step 1: a link, not a result.
    { type: "scenario", slug: scenario, protocolSlug: slug, organizationId: null, isPublished: false, titleAr: "سيناريو", titleEn: "Scenario" },
    // A finalised scan with a result on step 2: assessment history.
    { type: "scanResult", protocolSlug: slug, organizationId: org.organizationId, stepNumber: 2 },
  ]);
  const e = (key: string) => msg("en", `protocols.editor.${key}`);
  const removeLabel = (n: number) => msgWith("en", "protocols.editor.steps.remove", { number: String(n) });
  const v1 = ids.protocols[slug]!;
  try {
    await page.goto(`/en/admin/protocols/${v1}`);
    await expect(page.getByRole("heading", { level: 1, name: titleEn })).toBeVisible();
    const form = editorForm(page);
    const first = editorStep(page, 0);
    const second = editorStep(page, 1);
    const remove1 = first.getByRole("button", { name: removeLabel(1) });
    await waitForHydration(remove1);

    // Step 1: scenario answers link to it. It cannot be removed, but it may still change.
    // aria-disabled (not disabled): it stays focusable and says why when pressed. Playwright treats it as disabled.
    await remove1.click({ force: true });
    await expect(page.getByText(e("steps.linkedTitle")).first()).toBeVisible();
    await expect(form.locator("ol > li")).toHaveCount(2);
    await first.getByRole("button", { expanded: false }).first().click();
    await expect(first.getByRole("note")).toContainText(e("steps.linkedNote"));
    await expect(first.getByRole("switch", { name: e("steps.fields.critical") })).toBeEnabled();

    // Step 2: it has a result. It stays, and what it asks for is fixed; only its wording can be fixed.
    await second.getByRole("button", { name: removeLabel(2) }).click({ force: true });
    await expect(page.getByText(e("steps.lockedTitle")).first()).toBeVisible();
    await second.getByRole("button", { expanded: false }).first().click();
    await expect(second.getByRole("note")).toContainText(e("steps.locked"));
    for (const field of ["mandatory", "critical", "visual"]) {
      await expect(second.getByRole("switch", { name: e(`steps.fields.${field}`) })).toBeDisabled();
    }
    await expect(second.getByRole("radio", { name: e("steps.fields.weight3") })).toBeDisabled();
    const textEn = second.getByLabel(e("steps.fields.textEn"), { exact: true });
    await expect(textEn).toBeEditable();
    await textEn.fill("Test step 2, worded more clearly");
    // Past reports show the step's current wording: the editor asks first and names the step. Keep editing saves
    // nothing; confirming saves the new wording.
    const save = form.getByRole("button", { name: e("actions.save") });
    const wording = page.getByRole("alertdialog", { name: e("wording.title") });
    await save.click();
    await expect(wording).toBeVisible();
    await expect(wording).toContainText(msgWith("en", "protocols.editor.steps.number", { number: "2" }));
    await expect(wording).toContainText("Test step 2, worded more clearly");
    await expect(wording.getByRole("button", { name: e("wording.cancel") })).toBeFocused();
    await wording.getByRole("button", { name: e("wording.cancel") }).click();
    await expect(wording).toHaveCount(0);
    await expect(form.getByText(e("saveBar.unsaved"))).toBeVisible();
    await save.click();
    await wording.getByRole("button", { name: e("wording.confirm") }).click();
    await expect(form.getByText(e("saveBar.live"))).toBeVisible({ timeout: 20_000 }); // published: saved and live
    await expect(textEn).toHaveValue("Test step 2, worded more clearly");

    // "Used so far" reports real results and scenario answers apart (plural texts: protocols.editor.history.*).
    const usage = page.getByRole("region", { name: e("history.usageTitle") });
    await expect(usage).toContainText("1 scan");
    await expect(usage).toContainText("1 step result");
    await expect(usage).toContainText("2 scenario answers linked");
    // Wide screens: the side panels follow each other with the normal gap (no hole under Status).
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      const statusBox = await page.getByRole("region", { name: e("status.label") }).boundingBox();
      const usageBox = await usage.boundingBox();
      expect(usageBox!.y - (statusBox!.y + statusBox!.height)).toBeLessThan(40);
    }
    await expect(page.getByRole("button", { name: e("actions.delete"), exact: true })).toHaveCount(0);
    await expect(page.getByText(msg("en", "protocols.editor.history.deleteBlockedHistory"))).toBeVisible();

    // A new version: the dialog says the scenario stays with this version, and where to move it.
    await page.getByRole("button", { name: e("actions.newVersion"), exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("link", { name: /scenario editor/i })).toHaveAttribute("href", "/en/admin/scenarios");
    await dialog.getByRole("button", { name: e("actions.newVersion"), exact: true }).click();
    await page.waitForURL((url) => EDITOR_URL("en").test(url.href) && !url.pathname.endsWith(`/${v1}`), { timeout: 20_000 });
    const v2 = editorIdFromUrl(page.url());
    expect(v2).not.toBe(v1);
    await expect(page.getByText(`/protocols/${slug}-v2`)).toBeVisible();
    const status = page.getByRole("region", { name: e("status.label") });
    await expect(status.getByText(e("status.draft"), { exact: true })).toBeVisible();
    const note = page.getByRole("note").filter({ hasText: titleEn });
    await expect(note.getByRole("link", { name: titleEn })).toHaveAttribute("href", `/en/admin/protocols/${v1}`);
    await expect(note).toContainText(e("links.versionOfPublished"));
    await expect(note.getByRole("link", { name: /scenario editor/i })).toHaveAttribute("href", "/en/admin/scenarios");
    await expect(editorForm(page).locator("ol > li")).toHaveCount(2);
    // The version has no history yet: it can be deleted.
    await expect(page.getByText(msg("en", "protocols.editor.history.unused"))).toBeVisible();

    // Both published: the note warns, and the old version is unpublished from right here.
    await confirmDialog(page, e("actions.publish"));
    await expect(note).toContainText(e("links.versionOfBothPublished"));
    await confirmDialog(page, e("actions.unpublishOld"), e("actions.unpublish"));
    await expect(note).not.toContainText(e("links.versionOfBothPublished"), { timeout: 20_000 });
    await expect(page.getByRole("button", { name: e("actions.unpublishOld") })).toHaveCount(0);

    // The old version's editor points at the new one.
    await page.goto(`/en/admin/protocols/${v1}`);
    await expect(page.getByRole("region", { name: e("status.label") }).getByText(e("status.draft"), { exact: true })).toBeVisible();
    await expect(page.getByRole("note").filter({ hasText: titleEn }).getByRole("link", { name: titleEn })).toHaveAttribute("href", `/en/admin/protocols/${v2}`);
  } finally {
    cleanup({ protocolSlugs: [slug, `${slug}-v2`], scenarioSlugs: [scenario] });
  }
});

test("unsaved changes: a link or Back asks before leaving the editor; after a save they go straight", async ({ page }) => {
  test.setTimeout(150_000); // the database helper twice
  const slug = testSlug("leave");
  const titleEn = `Leave ${slug}`;
  const ids = db([{ type: "globalProtocol", slug, isPublished: false, titleAr: `مغادرة ${slug}`, titleEn }]);
  const e = (key: string) => msg("en", `protocols.editor.${key}`);
  const editorUrl = urlPath(`/en/admin/protocols/${ids.protocols[slug]}`);
  try {
    await page.goto("/en/admin/protocols");
    await page.getByRole("link", { name: titleEn, exact: true }).click();
    await expect(page).toHaveURL(editorUrl);
    const form = editorForm(page);
    const title = form.getByLabel(e("fields.titleEn"), { exact: true });
    await waitForHydration(title);
    await title.fill(`${titleEn} edited`);
    await expect(form.getByText(e("saveBar.unsaved"))).toBeVisible();
    // Arabic text in the English interface uses the Arabic typeface (not the Latin font's fallback).
    const fonts = await form.getByLabel(e("fields.titleAr"), { exact: true }).evaluate((el) => ({
      field: getComputedStyle(el).fontFamily,
      arabic: getComputedStyle(el).getPropertyValue("--font-arabic").trim(),
    }));
    expect(fonts.field.replaceAll(" ", "")).toBe(fonts.arabic.replaceAll(" ", ""));

    // An in-app link is held and the dialog asks; Stay keeps the edit.
    const back = page.getByRole("link", { name: e("back.global"), exact: true });
    const dialog = page.getByRole("alertdialog", { name: e("leave.title") });
    await back.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: e("leave.stay") }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(editorUrl);
    await expect(title).toHaveValue(`${titleEn} edited`);

    // The browser's Back asks too.
    await page.evaluate(() => window.history.back());
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: e("leave.stay") }).click();
    await expect(page).toHaveURL(editorUrl);
    await expect(title).toHaveValue(`${titleEn} edited`);

    // The account menu's Settings is a link (components/shell/user-menu.tsx): it asks first, like the sidebar.
    await page.getByRole("button", { name: msg("en", "nav.userMenu.label") }).click();
    await page.getByRole("menuitem", { name: msg("en", "nav.userMenu.settings") }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: e("leave.stay") }).click();
    await expect(page).toHaveURL(editorUrl);
    await expect(title).toHaveValue(`${titleEn} edited`);
    await expect(form.getByText(e("saveBar.unsaved"))).toBeVisible();

    // Leave: Back goes to the list it came from (one Back, the same extra entry), and nothing was saved.
    await page.evaluate(() => window.history.back());
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: e("leave.leave") }).click();
    await expect(page).toHaveURL(urlPath("/en/admin/protocols"));
    await expect(page.getByRole("link", { name: titleEn, exact: true })).toBeVisible();

    // Leaving discards the edits: Back shows the editor as saved (nothing to save, nothing asked), and one more Back
    // leaves it.
    await page.getByRole("link", { name: titleEn, exact: true }).click();
    await expect(page).toHaveURL(editorUrl);
    await waitForHydration(title);
    await title.fill(`${titleEn} DISCARD-ME`);
    await back.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: e("leave.leave") }).click();
    await expect(page).toHaveURL(urlPath("/en/admin/protocols"));
    await page.goBack();
    await expect(page).toHaveURL(editorUrl);
    await expect(title).toHaveValue(titleEn);
    await expect(form.getByText(e("saveBar.unsaved"))).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(urlPath("/en/admin/protocols"));
    await expect(dialog).toHaveCount(0);

    // Saved: no question any more, and Back from the list returns to the editor in one step.
    await page.getByRole("link", { name: titleEn, exact: true }).click();
    await expect(page).toHaveURL(editorUrl);
    await waitForHydration(title);
    await title.fill(`${titleEn} saved`);
    await form.getByRole("button", { name: e("actions.save") }).click();
    await expect(form.getByText(e("saveBar.saved"))).toBeVisible({ timeout: 20_000 });
    await back.click();
    await expect(page).toHaveURL(urlPath("/en/admin/protocols"));
    await expect(dialog).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(editorUrl);
  } finally {
    cleanup({ protocolSlugs: [slug] });
  }
});

test("on a phone, a control that gets keyboard focus is never hidden behind the save bar or the header", async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar/admin/protocols/new");
  const form = editorForm(page);
  const titleAr = form.getByLabel(msg("ar", "protocols.editor.fields.titleAr"), { exact: true });
  await waitForHydration(titleAr);
  await titleAr.focus();
  const hidden: string[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      const formEl = document.querySelector("form[data-protocol-editor]");
      const bar = formEl?.querySelector(":scope > .sticky");
      const header = document.querySelector("header.sticky");
      if (!el || !formEl || !bar || !formEl.contains(el)) return { done: true };
      if (bar.contains(el)) return { done: false };
      const a = el.getBoundingClientRect();
      const limit = bar.getBoundingClientRect().top;
      const top = header ? header.getBoundingClientRect().bottom : 0;
      const name = el.getAttribute("aria-label") || el.id || el.tagName;
      return { done: false, hidden: a.bottom > limit + 1 || a.top < top - 1 ? `${name} ${Math.round(a.top)}-${Math.round(a.bottom)} (bar ${Math.round(limit)})` : null };
    });
    if (r.done) break;
    if (r.hidden) hidden.push(r.hidden);
  }
  expect(hidden).toEqual([]);
});

test("an institution's protocol opens read-only for the platform admin", async ({ page, browser, clientIp }, testInfo) => {
  test.setTimeout(150_000);
  const org = await otherInstitution(browser, clientIp);
  const slug = testSlug("inst-view");
  const ids = db([{ type: "orgProtocol", slug, organizationId: org.organizationId, isPublished: false, titleAr: `مؤسسة ${slug}`, titleEn: `Institution ${slug}` }]);
  try {
    await page.goto(`/en/admin/protocols?view=institutions&q=${encodeURIComponent(slug)}`);
    const link = page.getByRole("link", { name: `Institution ${slug}`, exact: true });
    await expect(link).toHaveAttribute("href", `/en/admin/protocols/${ids.protocols[slug]}`);
    await expect(page.getByRole("link", { name: msg("en", "protocols.admin.views.institutions") })).toHaveAttribute("aria-current", "page");
    await expectAccessible(page, testInfo, { label: "institutions list light" });
    await link.click();
    await expect(page.getByRole("heading", { level: 1, name: `Institution ${slug}` })).toBeVisible();
    await expect(page.getByText(msg("en", "protocols.admin.readOnly.own"))).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expectAccessible(page, testInfo, { label: "read-only view dark" });
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("form[data-protocol-editor]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: msg("en", "protocols.editor.actions.publish"), exact: true })).toHaveCount(0);
  } finally {
    cleanup({ protocolSlugs: [slug] });
  }
});
