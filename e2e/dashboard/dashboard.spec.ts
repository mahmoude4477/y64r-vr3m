import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expectAccessible } from "../support/a11y";
import { createVerifiedUser, sessionUserId } from "../support/auth";
import { ADMIN_STATE, BASE_URL } from "../support/env";
import { expect, type Locale, msg, test } from "../support/fixtures";
import {
  average,
  fill,
  format,
  newInstitution,
  type Person,
  randomIp,
  type SeedResult,
  seedProtocol,
  seedResults,
  signInAs,
} from "../reports/support/data";

// The dashboard (/dashboard): the onboarding of a brand-new trainee, a trainee's training overview, the institution
// dashboard of staff (examiner and manager) and the admin card. Results are written straight into the e2e database
// (e2e/reports/support/seed-results.mts), the way /reports is tested: the scan and simulation flows are built by other
// teams at the same time.

const PROTOCOL = seedProtocol("hand-hygiene-station");
const [K0, K1] = PROTOCOL.steps.map((s) => s.key);
const STEP0 = PROTOCOL.steps[0];
const SCENARIO = { titleAr: "سيناريو لوحة المعلومات", titleEn: "Dashboard test scenario" };
const DAY = 86_400_000;

function region(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

/** The value of a tile (label, value, …) inside a labelled group of tiles. */
function tileValue(page: Page, groupLabel: string, tileLabel: string) {
  return region(page, groupLabel)
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(tileLabel, { exact: true }) })
    .locator("p")
    .nth(1);
}

function percent(locale: Locale, value: number | null) {
  return value === null ? "—" : fill(msg(locale, "common.score.value"), { score: value });
}

/** Days back from now that still fall in this Riyadh calendar month: `share` (0..1) of the time since it began. */
function thisMonthDaysAgo(share: number): number {
  const riyadh = new Date(Date.now() + 3 * 3_600_000); // Saudi time is UTC+3 all year
  const monthStart = Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), 1) - 3 * 3_600_000;
  return ((Date.now() - monthStart) * share) / DAY;
}

/** Days back from now that fall in the previous Riyadh calendar month (three days before this month began). */
function lastMonthDaysAgo(): number {
  return thisMonthDaysAgo(1) + 3;
}

/** The greeting line as text (the name sits in a <bdi> inside it). */
function greeting(locale: Locale, name: string) {
  return fill(msg(locale, "dashboard.welcome.greeting").replace(/<\/?who>/g, ""), { name });
}

async function checkBothThemes(
  page: Page,
  testInfo: Parameters<typeof expectAccessible>[1],
  path: string,
  check?: () => Promise<void>,
) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await check?.();
    if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expectAccessible(page, testInfo, { label: `${path} ${scheme}` });
    // For review in the HTML report (pnpm exec playwright show-report): how the page looks at this size and theme.
    await testInfo.attach(`${path} ${scheme}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/**
 * The filled (primary) buttons and links shown in the page content, by their text: one per view, so the main next
 * step is clear (UX review: a trainee with an unfinished attempt saw three, a manager two).
 */
async function filledActions(page: Page): Promise<string[]> {
  return page
    .getByRole("main")
    .locator("a, button")
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => n.classList.contains("bg-primary") && (n as HTMLElement).offsetParent !== null)
        .map((n) => (n.textContent ?? "").trim()),
    );
}

/** Scans are for institution staff only: no link into /scans anywhere in the page content. */
async function expectNoScanLinks(page: Page, locale: Locale) {
  await expect(page.getByRole("main").locator(`a[href^="/${locale}/scans"]`)).toHaveCount(0);
}

test.describe("a brand-new trainee", () => {
  // One new person for the group (a sign-up with an e-mailed code); the tests only read.
  test.describe.configure({ mode: "default" });
  const NAME = "سلمى الجديدة";
  let person: Person;

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(120_000);
    const request = await playwright.request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { "x-real-ip": randomIp() } });
    try {
      const email = `e2e-${randomUUID().slice(0, 12)}@example.com`;
      // The request context is signed in once the code is verified (autoSignInAfterVerification).
      await createVerifiedUser(request, { email, password: `E2e-${randomUUID()}`, name: NAME });
      const id = await sessionUserId(request);
      if (!id) throw new Error("no session after sign-up");
      person = { id, email, name: NAME, cookies: (await request.storageState()).cookies };
    } finally {
      await request.dispose();
    }
  });

  test("sees the onboarding with where to start, and nothing that needs results", async ({ page }) => {
    await signInAs(page, person);
    await page.goto("/ar/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: msg("ar", "dashboard.title") })).toBeVisible();
    await expect(page.getByText(greeting("ar", NAME))).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: msg("ar", "dashboard.onboarding.title") })).toBeVisible();
    const steps = page.getByRole("list", { name: msg("ar", "dashboard.onboarding.stepsLabel") });
    await expect(steps.getByRole("listitem")).toHaveCount(3);
    // The first scenario to play when one is published, else the catalogue.
    await expect(page.getByRole("link", { name: msg("ar", "dashboard.onboarding.start") })).toHaveAttribute("href", /^\/ar\/simulations(\/[\w-]+)?$/);
    // The onboarding holds the one primary action: no quick actions repeating it above.
    await expect(page.getByRole("navigation", { name: msg("ar", "dashboard.quick.label") })).toHaveCount(0);
    await expect(page.getByRole("link", { name: msg("ar", "dashboard.onboarding.protocols") })).toHaveAttribute("href", "/ar/protocols");
    // No numbers to show yet, no institution cards, no scans, no admin card.
    await expect(page.getByRole("region", { name: msg("ar", "dashboard.personal.statsLabel") })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: msg("ar", "dashboard.admin.title") })).toHaveCount(0);
    await expectNoScanLinks(page, "ar");
    expect(await filledActions(page)).toEqual([msg("ar", "dashboard.onboarding.start")]);
  });

  for (const locale of ["ar", "en"] as const) {
    test(`the onboarding is accessible in both themes (${locale})`, async ({ page }, testInfo) => {
      test.slow(); // two page loads with axe scans
      await signInAs(page, person);
      await checkBothThemes(page, testInfo, `/${locale}/dashboard`, async () => {
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
        await expect(page.getByRole("heading", { level: 2, name: msg(locale, "dashboard.onboarding.title") })).toBeVisible();
      });
    });
  }
});

test.describe("an institution with results", () => {
  // One institution for the whole group (four sign-ups with e-mailed codes, then the seeded results): the tests run in
  // order in one worker and only read.
  test.describe.configure({ mode: "default" });

  let people: Record<"manager" | "examiner" | "amal", Person>;
  let seed: SeedResult;
  let institutionName = "";
  // Plan order of the seeded rows, to read the stored scores back.
  const SCAN = { lastMonth: 0, icu: 1, er: 2, review: 3, draft: 4, failed: 5 } as const;
  const ATTEMPT = { amalOld: 0, amalNew: 1, examiner: 2, amalOpen: 3 } as const;

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(300_000);
    const inst = await newInstitution(playwright, {
      manager: { role: "admin", name: "مديرة المؤسسة" },
      examiner: { role: "examiner", name: "مقيّمة لوحة المعلومات" },
      amal: { role: "trainee", name: "أمل لوحة المعلومات" },
    });
    people = inst.people;
    institutionName = inst.name;
    seed = seedResults({
      organizationId: inst.organizationId,
      protocolSlug: PROTOCOL.slug,
      scenario: SCENARIO,
      teams: [{ key: "icu", name: "العناية المركزة", userIds: [people.amal.id] }],
      attempts: [
        { userId: people.amal.id, daysAgo: lastMonthDaysAgo() + 2, violate: [K0, K1] },
        // The top gap (an ordinary step) missed once through a critical wrong option.
        { userId: people.amal.id, daysAgo: thisMonthDaysAgo(0.2), violate: [K0], critical: [K0] },
        // Staff train too: an examiner's attempt in the institution counts like anyone's.
        { userId: people.examiner.id, daysAgo: thisMonthDaysAgo(0.3) },
        { userId: people.amal.id, daysAgo: thisMonthDaysAgo(0.05), status: "in_progress" },
      ],
      scans: [
        { examinerId: people.examiner.id, daysAgo: lastMonthDaysAgo(), area: "مغسلة الشهر الماضي" },
        { examinerId: people.examiner.id, daysAgo: thisMonthDaysAgo(0.1), area: "مغسلة العناية المركزة", team: "icu", violate: [K0] },
        { examinerId: people.manager.id, daysAgo: thisMonthDaysAgo(0.4), area: "مغسلة الطوارئ" },
        { examinerId: people.examiner.id, daysAgo: thisMonthDaysAgo(0.15), area: "مغسلة الجناح 3", status: "review", violate: [K0] },
        { examinerId: people.manager.id, daysAgo: thisMonthDaysAgo(0.25), area: "غرفة التعقيم", status: "draft" },
        { examinerId: people.examiner.id, daysAgo: thisMonthDaysAgo(0.35), area: "مغسلة المختبر", status: "failed" },
      ],
    });
  });

  test("an examiner sees this month's numbers and the scans waiting to be finalised", async ({ page }) => {
    await signInAs(page, people.examiner);
    await page.goto("/ar/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: msg("ar", "dashboard.title") })).toBeVisible();
    await expect(page.getByText(greeting("ar", people.examiner.name))).toBeVisible();

    const quick = page.getByRole("navigation", { name: msg("ar", "dashboard.quick.label") });
    await expect(quick.getByRole("link", { name: msg("ar", "dashboard.quick.newScan") })).toHaveAttribute("href", "/ar/scans/new");
    await expect(quick.getByRole("link", { name: msg("ar", "dashboard.quick.reports") })).toHaveAttribute("href", "/ar/reports");
    await expect(quick.getByRole("link", { name: msg("ar", "dashboard.quick.members") })).toHaveCount(0);
    // The outline shortcuts have their border in the light theme too (buttonVariants merged with cn()).
    const reports = quick.getByRole("link", { name: msg("ar", "dashboard.quick.reports") });
    expect(await reports.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe("rgba(0, 0, 0, 0)");

    // This month: two finalised scans and two completed attempts (last month's and the open ones are out).
    const month = msg("ar", "dashboard.institution.month.title");
    const thisMonthScores = [seed.scanScores[SCAN.icu], seed.scanScores[SCAN.er], seed.attemptScores[ATTEMPT.amalNew], seed.attemptScores[ATTEMPT.examiner]];
    await expect(tileValue(page, month, msg("ar", "dashboard.institution.month.compliance"))).toHaveText(percent("ar", average(thisMonthScores)));
    await expect(tileValue(page, month, msg("ar", "dashboard.institution.month.scans"))).toHaveText("2");
    await expect(tileValue(page, month, msg("ar", "dashboard.institution.month.simulations"))).toHaveText("2");
    const high = [seed.scanRisks[SCAN.icu], seed.scanRisks[SCAN.er], seed.attemptRisks[ATTEMPT.amalNew], seed.attemptRisks[ATTEMPT.examiner]].filter((r) => r === "high").length;
    await expect(tileValue(page, month, msg("ar", "dashboard.institution.month.highRisk"))).toHaveText(String(high));
    await expect(region(page, month).getByRole("link", { name: msg("ar", "dashboard.institution.month.report") })).toHaveAttribute(
      "href",
      /^\/ar\/reports\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/,
    );

    // Scans waiting to be finalised: one per open status, each linking to the filtered list, the scans themselves.
    const open = region(page, msg("ar", "dashboard.institution.open.title"));
    const statuses = open.getByRole("list", { name: msg("ar", "dashboard.institution.open.statusLabel") });
    for (const status of ["review", "draft", "failed"] as const) {
      await expect(statuses.getByRole("link", { name: new RegExp(msg("ar", `common.scanStatus.${status}`)) })).toHaveAttribute(
        "href",
        `/ar/scans?status=${status}`,
      );
    }
    await expect(statuses.getByRole("listitem")).toHaveCount(3);
    // The ones an examiner can act on (review, failed) come first.
    const openRows = open.getByRole("listitem").filter({ has: page.locator('a[href^="/ar/scans/"]') });
    await expect(openRows).toHaveCount(3);
    await expect(openRows.nth(0).getByRole("link", { name: "مغسلة الجناح 3" })).toHaveAttribute("href", `/ar/scans/${seed.scanIds[SCAN.review]}`);
    await expect(openRows.nth(0)).toContainText(msg("ar", "dashboard.institution.open.byYou"));
    await expect(openRows.nth(1).getByRole("link", { name: "مغسلة المختبر" })).toBeVisible();
    await expect(openRows.nth(2).getByRole("link", { name: "غرفة التعقيم" })).toBeVisible();
    await expect(openRows.nth(2)).toContainText(people.manager.name);

    // Examiners do not manage members: no invitation hint.
    await expect(page.getByRole("heading", { name: msg("ar", "dashboard.institution.invite.title") })).toHaveCount(0);
    // "New scan" is the one primary action.
    expect(await filledActions(page)).toEqual([msg("ar", "dashboard.quick.newScan")]);
  });

  test("an examiner sees the top gap with its training and the latest results", async ({ page }) => {
    await signInAs(page, people.examiner);
    await page.goto("/ar/dashboard");

    // Top gap of the last 90 days: the step missed in two attempts and one scan, with its scenario.
    const gap = region(page, msg("ar", "dashboard.institution.gap.title"));
    await expect(gap).toContainText(STEP0.textAr);
    await expect(gap.getByRole("link", { name: SCENARIO.titleAr })).toHaveAttribute("href", `/ar/simulations/${seed.scenarioSlug}`);
    // An ordinary step missed through a critical option: a critical violation, never a "critical step".
    await expect(gap).toContainText(format("ar", msg("ar", "reports.critical.violations"), { count: 1 }));
    await expect(gap.getByText(msg("ar", "reports.critical.step"), { exact: true })).toHaveCount(0);

    // Latest finalised scans (newest first) and latest simulation results.
    const scans = region(page, msg("ar", "dashboard.institution.scans.title"));
    const scanLinks = scans.locator('a[href^="/ar/scans/"]');
    await expect(scanLinks).toHaveCount(3);
    await expect(scanLinks.nth(0)).toHaveAttribute("href", `/ar/scans/${seed.scanIds[SCAN.icu]}`);
    await expect(scans).toContainText("العناية المركزة");
    const attempts = region(page, msg("ar", "dashboard.institution.attempts.title"));
    await expect(attempts.locator(`a[href="/ar/simulations/attempts/${seed.attemptIds[ATTEMPT.amalNew]}"]`)).toHaveText(SCENARIO.titleAr);
    await expect(attempts.getByRole("link", { name: people.examiner.name })).toHaveAttribute("href", `/ar/reports/trainees/${people.examiner.id}`);
    // The attempt still in progress is not a result.
    await expect(attempts.locator(`a[href="/ar/simulations/attempts/${seed.attemptIds[ATTEMPT.amalOpen]}"]`)).toHaveCount(0);

    // "Trainee progress" opens that section of /reports, not the top of a long page.
    const progress = attempts.getByRole("link", { name: msg("ar", "dashboard.institution.attempts.all") });
    await expect(progress).toHaveAttribute("href", "/ar/reports#report-trainees");
    await progress.click();
    await expect(page).toHaveURL(/\/ar\/reports#report-trainees$/);
    await expect(region(page, msg("ar", "reports.trainees.title"))).toBeInViewport();
  });

  for (const locale of ["ar", "en"] as const) {
    test(`the examiner's dashboard is accessible in both themes (${locale})`, async ({ page }, testInfo) => {
      test.slow(); // two page loads with every card and axe scans
      await signInAs(page, people.examiner);
      await checkBothThemes(page, testInfo, `/${locale}/dashboard`, async () => {
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
        await expect(tileValue(page, msg(locale, "dashboard.institution.month.title"), msg(locale, "dashboard.institution.month.scans"))).toHaveText("2");
        await expect(region(page, msg(locale, "dashboard.institution.gap.title"))).toContainText(locale === "ar" ? STEP0.textAr : STEP0.textEn);
      });
    });
  }

  test("a manager also gets the members shortcut and, with few members, the invitation hint", async ({ page }) => {
    await signInAs(page, people.manager);
    await page.goto("/ar/dashboard");
    const quick = page.getByRole("navigation", { name: msg("ar", "dashboard.quick.label") });
    await expect(quick.getByRole("link", { name: msg("ar", "dashboard.quick.members") })).toHaveAttribute("href", "/ar/org/members");
    await expect(region(page, msg("ar", "dashboard.institution.month.title"))).toBeVisible();
    // The platform admin who created the institution and the three people above: four members, under FEW_MEMBERS.
    const hint = region(page, msg("ar", "dashboard.institution.invite.title"));
    await expect(hint.getByRole("link", { name: msg("ar", "dashboard.institution.invite.action") })).toHaveAttribute("href", "/ar/org/members");
    // The invitation is an outline button under the greeting: "new scan" stays the one primary action.
    await expect(region(page, msg("ar", "dashboard.institution.gap.title"))).toBeVisible();
    expect(await filledActions(page)).toEqual([msg("ar", "dashboard.quick.newScan")]);
  });

  test("a trainee of the institution sees their own training, the next scenario and no scans", async ({ page }) => {
    await signInAs(page, people.amal);
    await page.goto("/ar/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: msg("ar", "dashboard.title") })).toBeVisible();

    // The attempt still in progress can be continued.
    const resume = page.getByRole("region", { name: msg("ar", "dashboard.continue.title") });
    await expect(resume.getByRole("link", { name: msg("ar", "dashboard.continue.action") })).toHaveAttribute("href", `/ar/simulations/${seed.scenarioSlug}`);

    const stats = msg("ar", "dashboard.personal.statsLabel");
    const latest = seed.attemptScores[ATTEMPT.amalNew];
    const older = seed.attemptScores[ATTEMPT.amalOld];
    await expect(tileValue(page, stats, msg("ar", "dashboard.personal.latest"))).toHaveText(percent("ar", latest));
    await expect(tileValue(page, stats, msg("ar", "dashboard.personal.completed"))).toHaveText("2");
    await expect(tileValue(page, stats, msg("ar", "dashboard.personal.average"))).toHaveText(percent("ar", average([latest, older])));
    await expect(tileValue(page, stats, msg("ar", "dashboard.personal.best"))).toHaveText(percent("ar", Math.max(latest ?? 0, older ?? 0)));
    await expect(region(page, stats).getByRole("link", { name: msg("ar", "dashboard.personal.latestOpen") })).toHaveAttribute(
      "href",
      `/ar/simulations/attempts/${seed.attemptIds[ATTEMPT.amalNew]}`,
    );

    // Recommended next: the scenario that trains the step missed in both attempts.
    const next = region(page, msg("ar", "dashboard.personal.next.title"));
    await expect(next).toContainText(STEP0.textAr);
    await expect(next.getByRole("link", { name: msg("ar", "dashboard.personal.next.start") })).toHaveAttribute("href", `/ar/simulations/${seed.scenarioSlug}`);
    const weak = region(page, msg("ar", "dashboard.personal.weak.title"));
    await expect(weak.getByRole("listitem").first()).toContainText(STEP0.textAr);
    await expect(weak.getByRole("listitem").first()).toContainText(msg("ar", "reports.critical.violation"));
    await expect(weak.getByRole("link", { name: msg("ar", "dashboard.personal.weak.all") })).toHaveAttribute("href", "/ar/reports");

    // Institution numbers and scans are for staff only.
    await expect(page.getByRole("region", { name: msg("ar", "dashboard.institution.month.title") })).toHaveCount(0);
    await expectNoScanLinks(page, "ar");

    // An attempt to continue: "continue" is the one primary action; the shortcut and the next scenario are outline.
    expect(await filledActions(page)).toEqual([msg("ar", "dashboard.continue.action")]);
    await expect(page.getByRole("navigation", { name: msg("ar", "dashboard.quick.label") }).getByRole("link", { name: msg("ar", "dashboard.quick.startSimulation") })).toBeVisible();
    // The greeting says where the training belongs, without repeating the page description.
    await expect(page.getByText(fill(msg("ar", "dashboard.welcome.personalMember"), { institution: institutionName }), { exact: true })).toBeVisible();
  });

  test("the trainee's dashboard is accessible in both themes", async ({ page }, testInfo) => {
    test.slow(); // two page loads with axe scans
    await signInAs(page, people.amal);
    await checkBothThemes(page, testInfo, "/ar/dashboard", async () => {
      await expect(region(page, msg("ar", "dashboard.personal.next.title"))).toBeVisible();
    });
  });
});

test("a new institution without results shows its manager the first steps", async ({ page, playwright }, testInfo) => {
  test.slow(); // a sign-up with an e-mailed code and an institution
  const inst = await newInstitution(playwright, { owner: { role: "owner", name: "مالكة لوحة المعلومات" } });
  await signInAs(page, inst.people.owner);
  await page.goto("/ar/dashboard");
  await expect(page.getByRole("heading", { level: 2, name: msg("ar", "dashboard.institution.onboarding.title") })).toBeVisible();
  const steps = page.getByRole("list", { name: msg("ar", "dashboard.institution.onboarding.stepsLabel") });
  await expect(steps.getByRole("link", { name: msg("ar", "dashboard.institution.onboarding.members") })).toHaveAttribute("href", "/ar/org/members");
  await expect(steps.getByRole("link", { name: msg("ar", "dashboard.institution.onboarding.startScan") })).toHaveAttribute("href", "/ar/scans/new");
  // The first step already invites people: no separate hint; the onboarding holds the actions (no quick actions
  // repeating them) and no empty "waiting to be finalised" card follows it.
  await expect(page.getByRole("region", { name: msg("ar", "dashboard.institution.invite.title") })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: msg("ar", "dashboard.quick.label") })).toHaveCount(0);
  await expect(page.getByRole("region", { name: msg("ar", "dashboard.institution.open.title") })).toHaveCount(0);
  // No numbers before the first result.
  await expect(page.getByRole("region", { name: msg("ar", "dashboard.institution.month.title") })).toHaveCount(0);
  await expectAccessible(page, testInfo, { label: "first run" });
});

test.describe("the platform admin", () => {
  test.use({ storageState: ADMIN_STATE });

  test("gets a link card to the admin panel", async ({ page }) => {
    await page.goto("/ar/dashboard");
    const card = page.getByRole("region", { name: msg("ar", "dashboard.admin.title") });
    await expect(card.getByRole("link", { name: msg("ar", "dashboard.admin.open") })).toHaveAttribute("href", "/ar/admin");
  });
});
