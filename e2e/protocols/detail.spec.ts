import { expectAccessible } from "../support/a11y";
import { TRAINEE_STATE } from "../support/env";
import { expect, msg, test, urlPath } from "../support/fixtures";
import { cleanup, db, joinNewInstitution, otherInstitution, seedProtocol, testSlug } from "./support";

// The protocol detail page (/protocols/[slug]): ordered steps with why / reference / badges, the scan action for
// institution staff only, institution copies with their source and training scenarios, and not-found for
// unpublished protocols and other institutions' ones.

const notFound = (locale: "ar" | "en") => ({ level: 1 as const, name: msg(locale, "common.notFound.title") });

test.describe("individual trainee", () => {
  test.use({ storageState: TRAINEE_STATE });

  for (const locale of ["ar", "en"] as const) {
    test(`shows every step in order with why, badges and an external reference (${locale})`, async ({ page }) => {
      const sharps = seedProtocol("sharps-safety");
      const title = locale === "ar" ? sharps.titleAr : sharps.titleEn;
      await page.goto(`/${locale}/protocols/sharps-safety`);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page).toHaveTitle(new RegExp(title));
      // The breadcrumb ends with the protocol title.
      await expect(page.getByRole("navigation", { name: msg(locale, "nav.breadcrumb.label") })).toContainText(title);

      const steps = page.getByRole("region", { name: msg(locale, "protocols.detail.steps"), exact: true }).getByRole("listitem");
      await expect(steps).toHaveCount(sharps.steps.length);
      for (const [i, step] of sharps.steps.entries()) {
        const item = steps.nth(i);
        await expect(item.getByRole("heading", { level: 3 })).toContainText(locale === "ar" ? step.textAr : step.textEn);
        await expect(item.getByText(msg(locale, "protocols.detail.why"), { exact: true })).toBeVisible();
        await expect(item.getByText(locale === "ar" ? step.rationaleAr : step.rationaleEn)).toBeVisible();
        const critical = item.getByText(msg(locale, "protocols.badges.critical"), { exact: true });
        await expect(critical).toHaveCount(step.isCritical ? 1 : 0);
        const visual = item.getByText(msg(locale, "protocols.badges.visual"), { exact: true });
        await expect(visual).toHaveCount(step.visualCheck ? 1 : 0);
        const mandatory = item.getByText(msg(locale, `protocols.badges.${step.isMandatory ? "mandatory" : "recommended"}`), { exact: true });
        await expect(mandatory).toBeVisible();

        const reference = item.getByRole("link", { name: step.reference.label });
        await expect(reference).toHaveAttribute("href", step.reference.url);
        await expect(reference).toHaveAttribute("target", "_blank");
        await expect(reference).toHaveAttribute("rel", /\bnoopener\b/);
      }

      // Individual users are trainees: no scan action.
      await expect(page.getByRole("link", { name: msg(locale, "protocols.detail.scan") })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: msg(locale, "protocols.training.title") })).toBeVisible();
      await expect(page.getByRole("button", { name: msg(locale, "common.actions.print") })).toBeVisible();
    });
  }

  test("unpublished protocols and made-up slugs are not found", async ({ page }) => {
    test.setTimeout(150_000); // the database helper runs twice
    const draft = testSlug("draft");
    db([{ type: "globalProtocol", slug: draft, isPublished: false, titleAr: "مسودة", titleEn: "Draft" }]);
    try {
      await page.goto(`/ar/protocols/${draft}`);
      await expect(page.getByRole("heading", notFound("ar"))).toBeVisible();
      await page.goto("/en/protocols/no-such-protocol");
      await expect(page.getByRole("heading", notFound("en"))).toBeVisible();
      await page.goto("/en/protocols/Not_A_Slug");
      await expect(page.getByRole("heading", notFound("en"))).toBeVisible();
      // The tab says so too (WCAG 2.4.2), not the generic "protocol details".
      await expect(page).toHaveTitle(new RegExp(msg("en", "common.notFound.title")));
    } finally {
      cleanup({ protocolSlugs: [draft] });
    }
  });

  test("prints with the light theme's ink, whatever theme is on screen", async ({ page }) => {
    await page.goto("/ar/protocols/sharps-safety");
    const h1 = page.getByRole("heading", { level: 1 });
    const stepTitle = page.getByRole("region", { name: msg("ar", "protocols.detail.steps"), exact: true }).getByRole("heading", { level: 3 }).first();
    const ink = async () => Promise.all([h1, stepTitle].map((l) => l.evaluate((el) => getComputedStyle(el).color)));
    await page.emulateMedia({ media: "print", colorScheme: "light" });
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    const light = await ink();
    await page.emulateMedia({ media: "print", colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    expect(await ink()).toEqual(light);
    await page.emulateMedia({ media: "screen", colorScheme: "dark" });
    expect(await ink()).not.toEqual(light); // on screen, the dark theme applies
  });
});

test.describe("institution members", () => {
  test("an examiner gets the scan action with the protocol id", async ({ page, browser, clientIp, uniqueEmail, strongPassword }) => {
    test.slow(); // a sign-up with an e-mailed code, an institution and an invitation
    await joinNewInstitution(browser, page.request, { email: uniqueEmail(), password: strongPassword(), role: "examiner", clientIp });
    await page.goto("/ar/protocols/sharps-safety");
    const scan = page.getByRole("link", { name: msg("ar", "protocols.detail.scan") });
    await expect(scan).toBeVisible();
    await expect(scan).toHaveAttribute("href", /^\/ar\/scans\/new\?protocol=[a-z0-9]+$/);
  });

  test("a trainee of an institution does not get the scan action", async ({ page, browser, clientIp, uniqueEmail, strongPassword }) => {
    test.slow();
    await joinNewInstitution(browser, page.request, { email: uniqueEmail(), password: strongPassword(), role: "trainee", clientIp });
    await page.goto("/en/protocols/sharps-safety");
    await expect(page.getByRole("heading", { level: 1, name: seedProtocol("sharps-safety").titleEn })).toBeVisible();
    await expect(page.getByRole("link", { name: msg("en", "protocols.detail.scan") })).toHaveCount(0);
  });

  test("an institution's copy shows its source and the source's scenarios; drafts and other institutions stay hidden", async ({
    page,
    browser,
    clientIp,
    uniqueEmail,
    strongPassword,
  }, testInfo) => {
    test.setTimeout(180_000); // sign-up, two institutions, invitation, database helper x2, two axe scans
    const { organizationId } = await joinNewInstitution(browser, page.request, {
      email: uniqueEmail(),
      password: strongPassword(),
      role: "trainee",
      clientIp,
    });
    const other = await otherInstitution(browser, clientIp);
    const source = seedProtocol("hand-hygiene-station");
    const copy = testSlug("copy");
    const draft = testSlug("org-draft");
    const empty = testSlug("org-empty");
    const foreign = testSlug("foreign");
    const scenario = testSlug("scenario");
    const rows = { protocolSlugs: [copy, draft, empty, foreign], scenarioSlugs: [scenario] };
    const copyTitle = `نسخة الطوارئ ${copy}`;
    db([
      { type: "copyProtocol", sourceSlug: source.slug, slug: copy, organizationId, isPublished: true, titleAr: copyTitle, titleEn: `ER copy ${copy}` },
      { type: "orgProtocol", slug: draft, organizationId, isPublished: false, titleAr: `مسودة ${draft}`, titleEn: `Draft ${draft}` },
      { type: "orgProtocol", slug: empty, organizationId, isPublished: true, titleAr: `بلا تدريب ${empty}`, titleEn: `No training ${empty}` },
      { type: "orgProtocol", slug: foreign, organizationId: other.organizationId, isPublished: true, titleAr: `أجنبي ${foreign}`, titleEn: `Foreign ${foreign}` },
      // A scenario of the institution on the SOURCE protocol: the copy has none of its own, so it falls back to it.
      { type: "scenario", slug: scenario, protocolSlug: source.slug, organizationId, isPublished: true, titleAr: `سيناريو ${scenario}`, titleEn: `Scenario ${scenario}` },
    ]);
    try {
      // The library: the institution's published protocols with their badge and source; no draft, no foreign one.
      await page.goto("/ar/protocols");
      const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: copyTitle, exact: true }) });
      await expect(card).toBeVisible();
      await expect(card.getByText(msg("ar", "protocols.own"), { exact: true })).toBeVisible();
      await expect(card).toContainText(source.titleAr);
      // The institution's published copy replaces its global source in the institution's library.
      await expect(page.getByRole("link", { name: source.titleAr, exact: true })).toHaveCount(0);
      await expect(page.getByText(`مسودة ${draft}`)).toHaveCount(0);
      await expect(page.getByText(`أجنبي ${foreign}`)).toHaveCount(0);

      // The copy: the source link and the source's scenario.
      await card.getByRole("link", { name: copyTitle, exact: true }).click();
      await expect(page).toHaveURL(urlPath(`/ar/protocols/${copy}`));
      await expect(page.getByRole("heading", { level: 1, name: copyTitle })).toBeVisible();
      const note = page.getByRole("note");
      await expect(note.getByRole("link", { name: source.titleAr })).toHaveAttribute("href", `/ar/protocols/${source.slug}`);
      const training = page.getByRole("region", { name: msg("ar", "protocols.training.title") });
      await expect(training.getByText(msg("ar", "protocols.training.fromSource"))).toBeVisible();
      await expect(training.getByRole("link", { name: `سيناريو ${scenario}` })).toHaveAttribute("href", `/ar/simulations/${scenario}`);
      await page.getByRole("link", { name: msg("ar", "protocols.detail.train") }).click();
      await expect(page).toHaveURL(new RegExp(`/ar/protocols/${copy}#training$`));
      await expectAccessible(page, testInfo, { label: "institution copy light" });
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await expectAccessible(page, testInfo, { label: "institution copy dark" });
      await page.emulateMedia({ colorScheme: "light" });

      // A protocol with no scenario at all: the empty state, and no "train on this" shortcut.
      await page.goto(`/en/protocols/${empty}`);
      await expect(page.getByRole("heading", { level: 1, name: `No training ${empty}` })).toBeVisible();
      await expect(page.getByText(msg("en", "protocols.training.empty"))).toBeVisible();
      await expect(page.getByRole("link", { name: msg("en", "protocols.detail.train") })).toHaveCount(0);
      await expect(page.getByText(msg("en", "protocols.custom.own"))).toBeVisible();

      // Drafts and other institutions' protocols are not found, even by URL.
      await page.goto(`/ar/protocols/${draft}`);
      await expect(page.getByRole("heading", notFound("ar"))).toBeVisible();
      await page.goto(`/ar/protocols/${foreign}`);
      await expect(page.getByRole("heading", notFound("ar"))).toBeVisible();
    } finally {
      cleanup(rows);
    }
  });
});

test.describe("institution content for outsiders", () => {
  test.use({ storageState: TRAINEE_STATE });

  test("an individual trainee cannot open an institution's protocol", async ({ page, browser, clientIp }) => {
    test.setTimeout(150_000); // an institution, then the database helper twice
    const org = await otherInstitution(browser, clientIp);
    const slug = testSlug("private");
    db([{ type: "orgProtocol", slug, organizationId: org.organizationId, isPublished: true, titleAr: "خاص", titleEn: "Private" }]);
    try {
      await page.goto(`/en/protocols/${slug}`);
      await expect(page.getByRole("heading", notFound("en"))).toBeVisible();
      await page.goto("/en/protocols");
      await expect(page.getByRole("link", { name: "Private", exact: true })).toHaveCount(0);
    } finally {
      cleanup({ protocolSlugs: [slug] });
    }
  });
});
