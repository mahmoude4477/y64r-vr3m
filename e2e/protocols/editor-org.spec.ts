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
  joinNewInstitution,
  msgWith,
  noToasts,
  notFoundHeading,
  seedProtocol,
  testSlug,
} from "./support";

// The institution protocol editor (/org/protocols/**): an institution admin copies a global protocol, edits the copy,
// reorders its steps and publishes it; it then shows in the institution's library and stays invisible to everyone
// else. Examiners see the published ones read-only; trainees and individual users get not-found.

const ORG_EDITOR_URL = (locale: "ar" | "en") => new RegExp(`/${locale}/org/protocols/[a-z0-9]{20,}$`);

test("an institution admin copies a global protocol, edits and publishes it, and only its members see it", async ({
  page,
  browser,
  clientIp,
  uniqueEmail,
  strongPassword,
}, testInfo) => {
  test.setTimeout(300_000); // sign-up, institution, invitation, a long form, axe scans, a second context
  await joinNewInstitution(browser, page.request, { email: uniqueEmail(), password: strongPassword(), role: "admin", clientIp });
  const o = (key: string) => msg("ar", `protocols.org.${key}`);
  const e = (key: string) => msg("ar", `protocols.editor.${key}`);
  const source = seedProtocol("hand-hygiene-station");
  const copyTitle = `محطة نظافة اليدين – قسم الطوارئ ${testSlug("t")}`;

  await page.goto("/ar/org/protocols");
  await expect(page.getByRole("heading", { level: 1, name: msg("ar", "nav.sub.orgProtocols") })).toBeVisible();
  await expect(page.getByRole("heading", { name: o("empty.title") })).toBeVisible();
  await expectAccessible(page, testInfo, { label: "org list empty" });

  await page.getByRole("link", { name: o("copy") }).first().click();
  await expect(page).toHaveURL(urlPath("/ar/org/protocols/copy"));
  await expect(page.getByRole("heading", { level: 1, name: o("copyPage.title") })).toBeVisible();
  await expectAccessible(page, testInfo, { label: "copy page light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expectAccessible(page, testInfo, { label: "copy page dark" });
  await page.emulateMedia({ colorScheme: "light" });
  const copyButton = page.getByRole("button", { name: msgWith("ar", "protocols.org.copyPage.actionLabel", { title: source.titleAr }) });
  await waitForHydration(copyButton);
  await copyButton.click();

  // The copy opens in the editor: a draft that names its source, with every step of it.
  await expect(page).toHaveURL(ORG_EDITOR_URL("ar"), { timeout: 20_000 });
  const copyId = editorIdFromUrl(page.url());
  await expect(page.getByRole("heading", { level: 1, name: source.titleAr })).toBeVisible();
  await expect(page.getByRole("note").getByRole("link", { name: source.titleAr })).toHaveAttribute("href", `/ar/protocols/${source.slug}`);
  const form = editorForm(page);
  await expect(form.locator("ol > li")).toHaveCount(source.steps.length);
  const status = page.getByRole("region", { name: e("status.label") });
  await expect(status.getByText(e("audience.institutionDraft"))).toBeVisible();

  // Edit: a new title, and the second step moved to the top.
  const title = form.getByLabel(e("fields.titleAr"), { exact: true });
  await waitForHydration(title);
  await title.fill(copyTitle);
  const secondText = source.steps[1]!.textAr;
  const moveUp = form.getByRole("button", { name: msg("ar", "protocols.editor.steps.moveUp").replace("{number}", "2") });
  await moveUp.click();
  await expect(editorStep(page, 0)).toContainText(secondText);
  // Focus stays with the moved step (its "move down" button: it is first now).
  await expect(form.getByRole("button", { name: msg("ar", "protocols.editor.steps.moveDown").replace("{number}", "1") })).toBeFocused();
  // Publishing waits for the save.
  await expect(status.getByRole("button", { name: e("actions.publish"), exact: true })).toBeDisabled();
  await form.getByRole("button", { name: e("actions.save") }).click();
  await expect(page.getByRole("heading", { level: 1, name: copyTitle })).toBeVisible({ timeout: 20_000 });
  await expect(form.getByText(e("saveBar.saved"))).toBeVisible();
  await noToasts(page);
  await expectAccessible(page, testInfo, { label: "org editor light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expectAccessible(page, testInfo, { label: "org editor dark" });
  await page.emulateMedia({ colorScheme: "light" });

  await confirmDialog(page, e("actions.publish"));
  const library = status.getByRole("link", { name: e("actions.viewInLibrary") });
  await expect(library).toBeVisible();
  const href = (await library.getAttribute("href")) ?? "";
  expect(href).toMatch(/^\/ar\/protocols\/[a-z0-9-]+$/);

  // The institution's library: the copy with its badge and source, steps in the new order.
  await page.goto("/ar/protocols");
  const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: copyTitle, exact: true }) });
  await expect(card.getByText(msg("ar", "protocols.own"), { exact: true })).toBeVisible();
  // Its published copy replaces the global protocol in the institution's library (the copy names its source).
  await expect(page.getByRole("link", { name: source.titleAr, exact: true })).toHaveCount(0);
  await expect(card).toContainText(source.titleAr);
  await card.getByRole("link", { name: copyTitle, exact: true }).click();
  await expect(page).toHaveURL(urlPath(href));
  const steps = page.getByRole("region", { name: msg("ar", "protocols.detail.steps"), exact: true }).getByRole("listitem");
  await expect(steps.first()).toContainText(secondText);

  // The institution's list now shows it as published.
  await page.goto("/ar/org/protocols");
  await expect(page.getByRole("link", { name: copyTitle, exact: true })).toBeVisible();

  // The copy page now opens the institution's copy of that protocol; another copy is a confirmed second action.
  await page.goto("/ar/org/protocols/copy");
  await expect(page.getByRole("link", { name: msgWith("ar", "protocols.org.copyPage.openCopyLabel", { title: source.titleAr }) })).toHaveAttribute(
    "href",
    `/ar/org/protocols/${copyId}`,
  );
  const again = page.getByRole("button", { name: msgWith("ar", "protocols.org.copyPage.againLabel", { title: source.titleAr }) });
  await waitForHydration(again);
  await again.click();
  const againDialog = page.getByRole("alertdialog");
  await expect(againDialog.getByText(o("copyPage.againTitle"))).toBeVisible();
  await againDialog.getByRole("button", { name: msg("ar", "common.actions.cancel") }).click();
  await expect(againDialog).toHaveCount(0);
  await expect(page).toHaveURL(urlPath("/ar/org/protocols/copy"));

  // Nobody outside the institution sees it.
  const outsider = await browser.newContext({ storageState: TRAINEE_STATE });
  try {
    const p = await outsider.newPage();
    await p.goto("/ar/protocols");
    await expect(p.getByRole("heading", { level: 1, name: msg("ar", "protocols.title") })).toBeVisible();
    await expect(p.getByRole("link", { name: copyTitle, exact: true })).toHaveCount(0);
    await p.goto(href);
    await expect(p.getByRole("heading", notFoundHeading("ar"))).toBeVisible();
  } finally {
    await outsider.close();
  }
});

test("a newer global version: the institution's copy still replaces it for members, trains with it, and managers are told", async ({
  page,
  browser,
  clientIp,
  uniqueEmail,
  strongPassword,
}, testInfo) => {
  test.setTimeout(300_000); // sign-up, an institution, a second context, the database helper, four axe scans
  const { organizationId } = await joinNewInstitution(browser, page.request, { email: uniqueEmail(), password: strongPassword(), role: "owner", clientIp });
  const slug = testSlug("ver");
  const marker = slug.slice(-8);
  const titleAr = `بروتوكول بإصدارين ${marker}`;
  const titleEn = `Two versions ${marker}`;
  const copySlug = testSlug("ver-copy");
  const scenario = testSlug("ver-scn");
  const e = (key: string) => msg("en", `protocols.editor.${key}`);
  const ids = db([
    { type: "globalProtocol", slug, isPublished: true, titleAr, titleEn },
    // The institution's published copy, with the same title (as a copy has until someone renames it).
    { type: "copyProtocol", sourceSlug: slug, slug: copySlug, organizationId, isPublished: true, titleAr, titleEn },
  ]);
  const v1 = ids.protocols[slug]!;
  const copyId = ids.protocols[copySlug]!;
  const admin = await browser.newContext({ storageState: ADMIN_STATE, extraHTTPHeaders: { "x-real-ip": clientIp } });
  try {
    // The platform admin makes a new version and publishes it; the old one stays published for now.
    const a = await admin.newPage();
    await a.goto(`/en/admin/protocols/${v1}`);
    await waitForHydration(a.getByRole("button", { name: e("actions.newVersion"), exact: true }));
    await confirmDialog(a, e("actions.newVersion"));
    await a.waitForURL((url) => /\/en\/admin\/protocols\/[a-z0-9]{20,}$/.test(url.pathname) && !url.pathname.endsWith(`/${v1}`), { timeout: 20_000 });
    // The new version says what happens to the institution copies of the old one (a plural sentence).
    const versionNote = a.getByRole("note").filter({ hasText: titleEn });
    await expect(versionNote).toContainText("One institution copy was made from the old version.");
    await waitForHydration(a.getByRole("button", { name: e("actions.publish"), exact: true }));
    await confirmDialog(a, e("actions.publish"));
    await expect(versionNote).toContainText(e("links.versionOfBothPublished"));
    // Unpublishing the old version from here: the dialog names the copies too.
    await a.getByRole("button", { name: e("actions.unpublishOld"), exact: true }).click();
    await expect(a.getByRole("alertdialog")).toContainText("One institution copy was made from it.");
    await a.getByRole("alertdialog").getByRole("button", { name: msg("en", "common.actions.cancel") }).click();
    await expect(a.getByRole("alertdialog")).toHaveCount(0);
    // A training scenario on the new version only.
    db([{ type: "scenario", slug: scenario, protocolSlug: `${slug}-v2`, organizationId: null, isPublished: true, titleAr: `سيناريو ${scenario}`, titleEn: `Scenario ${scenario}` }]);

    // Members follow the institution's copy: neither global version shows next to it.
    await page.goto(`/en/protocols?q=${marker}`);
    const cards = page.getByRole("link", { name: titleEn, exact: true });
    await expect(cards).toHaveCount(1);
    await expect(cards).toHaveAttribute("href", `/en/protocols/${copySlug}`);
    // The copy trains with the newer version's scenarios (the old version has none).
    await cards.click();
    const training = page.getByRole("region", { name: msg("en", "protocols.training.title") });
    await expect(training.getByText(msg("en", "protocols.training.fromSource"))).toBeVisible();
    await expect(training.getByRole("link", { name: `Scenario ${scenario}` })).toHaveAttribute("href", `/en/simulations/${scenario}`);

    // The copy page explains the two cards with the same title.
    await page.goto("/en/org/protocols/copy");
    await expect(page.getByRole("link", { name: msgWith("en", "protocols.org.copyPage.openCopyLabel", { title: titleEn }) })).toHaveAttribute(
      "href",
      `/en/org/protocols/${copyId}`,
    );
    await expect(page.getByRole("link", { name: msgWith("en", "protocols.org.copyPage.newerVersionLabel", { title: titleEn }) })).toHaveAttribute(
      "href",
      `/en/protocols/${slug}-v2`,
    );
    await expect(page.getByRole("link", { name: msgWith("en", "protocols.org.copyPage.olderVersionCopyLabel", { title: titleEn }) })).toHaveAttribute(
      "href",
      `/en/org/protocols/${copyId}`,
    );
    // With copies on it (the "Open your copy" link's name starts with what it shows: WCAG 2.5.3).
    await expectAccessible(page, testInfo, { label: "copy page with a copy, light" });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expectAccessible(page, testInfo, { label: "copy page with a copy, dark" });
    await page.emulateMedia({ colorScheme: "light" });

    // The list marks the copy; its editor says how to adopt the new version.
    await page.goto("/en/org/protocols");
    const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: titleEn, exact: true }) });
    await expect(row).toContainText(msg("en", "protocols.manage.newerSource"));
    await expectAccessible(page, testInfo, { label: "org list with a newer version" });
    await page.goto(`/en/org/protocols/${copyId}`);
    const note = page.getByRole("note").filter({ has: page.getByRole("link", { name: "copy the new version" }) });
    await expect(note.getByRole("link", { name: titleEn, exact: true })).toHaveAttribute("href", `/en/protocols/${slug}-v2`);
    await expect(note.getByRole("link", { name: "copy the new version" })).toHaveAttribute("href", "/en/org/protocols/copy");
    await expectAccessible(page, testInfo, { label: "copy editor with a newer version" });
  } finally {
    await admin.close();
    cleanup({ protocolSlugs: [copySlug, `${slug}-v2`, slug], scenarioSlugs: [scenario] });
  }
});

test("an institution admin writes a protocol from scratch", async ({ page, browser, clientIp, uniqueEmail, strongPassword }) => {
  test.setTimeout(180_000);
  await joinNewInstitution(browser, page.request, { email: uniqueEmail(), password: strongPassword(), role: "owner", clientIp });
  const e = (key: string) => msg("en", `protocols.editor.${key}`);
  await page.goto("/en/org/protocols/new");
  await expect(page.getByRole("heading", { level: 1, name: msg("en", "protocols.org.newPage.title") })).toBeVisible();
  const form = editorForm(page);
  // Institutions never choose the address: it is generated.
  await expect(form.getByLabel(e("fields.slug"), { exact: true })).toHaveCount(0);
  await waitForHydration(form.getByLabel(e("fields.titleAr"), { exact: true }));
  await form.getByLabel(e("fields.titleAr"), { exact: true }).fill("تنظيف عربة الطوارئ");
  await form.getByLabel(e("fields.titleEn"), { exact: true }).fill("Crash cart cleaning");
  await form.getByLabel(e("fields.summaryAr"), { exact: true }).fill("خطوات تنظيف عربة الطوارئ بعد كل استخدام.");
  await form.getByLabel(e("fields.summaryEn"), { exact: true }).fill("Cleaning the crash cart after each use.");
  await form.getByLabel(e("fields.descriptionAr"), { exact: true }).fill("يُطبَّق في قسم الطوارئ.");
  await form.getByLabel(e("fields.descriptionEn"), { exact: true }).fill("Applies in the emergency department.");
  await form.getByRole("radio", { name: msg("en", "common.category.hygiene"), exact: true }).check();
  const step = editorStep(page, 0);
  await step.getByLabel(e("steps.fields.textAr"), { exact: true }).fill("امسح الأسطح بمطهّر معتمد.");
  await step.getByLabel(e("steps.fields.textEn"), { exact: true }).fill("Wipe the surfaces with an approved disinfectant.");
  await step.getByLabel(e("steps.fields.rationaleAr"), { exact: true }).fill("تقل الجراثيم على الأسطح.");
  await step.getByLabel(e("steps.fields.rationaleEn"), { exact: true }).fill("It lowers germs on surfaces.");
  await form.getByRole("button", { name: e("actions.create") }).click();
  await expect(page).toHaveURL(ORG_EDITOR_URL("en"), { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Crash cart cleaning" })).toBeVisible();
  await expect(page.getByText(/\/protocols\/crash-cart-cleaning-[a-z0-9]{6}/)).toBeVisible();
  await expect(page.getByRole("region", { name: e("status.label") }).getByText(e("status.draft"), { exact: true })).toBeVisible();
});

test.describe("who may edit", () => {
  test("an examiner sees the published institution protocols read-only and cannot open the editor", async ({
    page,
    browser,
    clientIp,
    uniqueEmail,
    strongPassword,
  }, testInfo) => {
    test.setTimeout(180_000);
    const { organizationId } = await joinNewInstitution(browser, page.request, { email: uniqueEmail(), password: strongPassword(), role: "examiner", clientIp });
    const live = testSlug("org-live");
    const draft = testSlug("org-draft");
    const ids = db([
      { type: "orgProtocol", slug: live, organizationId, isPublished: true, titleAr: `منشور ${live}`, titleEn: `Live ${live}` },
      { type: "orgProtocol", slug: draft, organizationId, isPublished: false, titleAr: `مسودة ${draft}`, titleEn: `Draft ${draft}` },
    ]);
    try {
      await page.goto("/en/org/protocols");
      await expect(page.getByRole("heading", { level: 1, name: msg("en", "nav.sub.orgProtocols") })).toBeVisible();
      await expect(page.getByText(msg("en", "protocols.org.readOnly"))).toBeVisible();
      await expect(page.getByRole("link", { name: `Live ${live}`, exact: true })).toHaveAttribute("href", `/en/protocols/${live}`);
      await expect(page.getByText(`Draft ${draft}`)).toHaveCount(0);
      await expect(page.getByRole("link", { name: msg("en", "protocols.org.copy") })).toHaveCount(0);
      await expectAccessible(page, testInfo, { label: "examiner list" });

      for (const path of ["/en/org/protocols/copy", "/en/org/protocols/new", `/en/org/protocols/${ids.protocols[live]}`]) {
        await page.goto(path);
        await expect(page.getByRole("heading", notFoundHeading("en"))).toBeVisible();
      }
    } finally {
      cleanup({ protocolSlugs: [live, draft] });
    }
  });

  test("an institution trainee gets not-found on the institution's protocol pages", async ({ page, browser, clientIp, uniqueEmail, strongPassword }) => {
    test.slow();
    await joinNewInstitution(browser, page.request, { email: uniqueEmail(), password: strongPassword(), role: "trainee", clientIp });
    for (const path of ["/ar/org/protocols", "/ar/org/protocols/copy", "/ar/org/protocols/new"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", notFoundHeading("ar"))).toBeVisible();
    }
  });

  test.describe("individual trainee", () => {
    test.use({ storageState: TRAINEE_STATE });

    test("gets not-found on every editor page", async ({ page }) => {
      for (const path of [
        "/ar/admin/protocols",
        "/ar/admin/protocols/new",
        "/en/admin/protocols?view=institutions",
        "/ar/org/protocols",
        "/ar/org/protocols/copy",
        "/ar/org/protocols/new",
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", notFoundHeading(path.startsWith("/en") ? "en" : "ar"))).toBeVisible();
      }
      // Nothing of the editor is in the page either (the static shell holds generic titles only).
      await expect(page.locator("form[data-protocol-editor]")).toHaveCount(0);
    });
  });
});
