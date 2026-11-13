import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { decodeSpreadsheet } from "../../lib/reports/csv";
import { expectAccessible } from "../support/a11y";
import { TRAINEE_STATE } from "../support/env";
import { expect, type Locale, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import { average, fill, format, newInstitution, type Person, type SeedResult, seedProtocol, seedResults, signInAs } from "./support/data";

// Reports (/reports, /reports/print, /reports/trainees/[userId], /api/reports/export): personal results for everyone,
// the institution report for its staff, filters in the URL, the export file and the printable view. Results are
// written straight into the e2e database (support/seed-results.mts): the scan and simulation flows are built by other
// teams at the same time.

const PROTOCOL = seedProtocol("hand-hygiene-station");
const [K0, K1, K2] = PROTOCOL.steps.map((s) => s.key);
const STEP2 = PROTOCOL.steps[2];
const SCENARIO = { titleAr: "سيناريو المغسلة للاختبار", titleEn: "Sink test scenario" };
const FORMULA_AREA = '=HYPERLINK("https://example.com")';
// A display name with a formula behind a ";" (Excel in an Arabic regional format splits .csv files on ";").
const FORMULA_NAME = "بدر المتدرب;=1+1";

function region(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

/** The value of a stat tile (label, value, hint) in a summary grid. */
function tileValue(page: Page, gridLabel: string, tileLabel: string) {
  return page
    .getByRole("region", { name: gridLabel, exact: true })
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(tileLabel, { exact: true }) })
    .locator("p")
    .nth(1);
}

function percent(locale: Locale, value: number | null) {
  return value === null ? "—" : fill(msg(locale, "common.score.value"), { score: value });
}

async function expectNotFound(page: Page, locale: Locale = "ar") {
  await expect(page.getByRole("heading", { level: 1, name: msg(locale, "common.notFound.title") })).toBeVisible();
}

async function checkBothThemes(page: Page, testInfo: Parameters<typeof expectAccessible>[1], path: string) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expectAccessible(page, testInfo, { label: `${path} ${scheme}` });
    // For review in the HTML report (pnpm exec playwright show-report): how the page looks at this size and theme.
    await testInfo.attach(`${path} ${scheme}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/** The Riyadh calendar day (YYYY-MM-DD) `days` days ago: Saudi time is UTC+3 all year. */
function riyadhDaysAgo(days: number): string {
  return new Date(Date.now() + 3 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 10);
}

/** Rows of an export file as Excel reads it (UTF-16LE, TAB-separated). */
function exportRows(bytes: Uint8Array): string[][] {
  expect([...bytes.subarray(0, 2)], "UTF-16LE byte-order mark").toEqual([0xff, 0xfe]);
  return decodeSpreadsheet(bytes);
}

test.describe("a trainee without an institution and without attempts", () => {
  test.use({ storageState: TRAINEE_STATE });
  test.slow(); // axe scans in two themes

  for (const locale of ["ar", "en"] as const) {
    test(`sees the personal empty state (${locale})`, async ({ page }, testInfo) => {
      await page.goto(`/${locale}/reports`);
      await expect(page.getByRole("heading", { level: 1, name: msg(locale, "reports.title") })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: msg(locale, "reports.personal.emptyTitle") })).toBeVisible();
      await expect(page.getByRole("link", { name: msg(locale, "reports.personal.browse") })).toHaveAttribute("href", `/${locale}/simulations`);
      // No institution: no report switch, no export.
      await expect(page.getByRole("navigation", { name: msg(locale, "reports.views.label") })).toHaveCount(0);
      await expect(page.getByRole("button", { name: msg(locale, "common.actions.exportCsv") })).toHaveCount(0);
      await checkBothThemes(page, testInfo, `/${locale}/reports`);
    });
  }

  test("cannot open the institution pages or the export", async ({ page }) => {
    await page.goto("/ar/reports/print");
    await expectNotFound(page);
    const res = await page.request.get("/api/reports/export?kind=scans&locale=ar");
    expect(res.status()).toBe(403);
  });
});

test.describe("an institution with results", () => {
  // One institution for the whole group (sign-ups with e-mailed codes, then the seeded results), plus a second
  // institution whose ids must never leak in: the tests run in order in one worker and only read.
  test.describe.configure({ mode: "default" });

  let institutionName = "";
  let people: Record<"examiner" | "amal" | "badr", Person>;
  let seed: SeedResult;
  let stranger: Person;
  let strangerTeamId = "";

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(300_000);
    const inst = await newInstitution(playwright, {
      examiner: { role: "examiner", name: "مقيّمة الاختبار" },
      amal: { role: "trainee", name: "أمل المتدربة" },
      badr: { role: "trainee", name: FORMULA_NAME },
    });
    institutionName = inst.name;
    people = inst.people;
    seed = seedResults({
      organizationId: inst.organizationId,
      protocolSlug: PROTOCOL.slug,
      scenario: SCENARIO,
      teams: [
        { key: "icu", name: "العناية المركزة", userIds: [people.amal.id] },
        { key: "er", name: "الطوارئ", userIds: [people.badr.id] },
        { key: "empty", name: "قسم بلا متدربين", userIds: [] },
      ],
      attempts: [
        { userId: people.amal.id, daysAgo: 3, violate: [K0] },
        // An ordinary step (not a critical one) missed through a critical wrong option.
        { userId: people.amal.id, daysAgo: 10, violate: [K0, K1], critical: [K2] },
        { userId: people.badr.id, daysAgo: 5, violate: [K0] },
        { userId: people.badr.id, daysAgo: 200 }, // outside the default 90 days
        { userId: people.badr.id, daysAgo: 1, status: "in_progress" },
        { userId: people.amal.id, daysAgo: 0.5, status: "in_progress" },
        // The examiner's own training outside the institution (her "my results"): seven scores for the trend chart.
        ...[30, 26, 22, 18, 14, 9, 2].map((daysAgo, i) => ({
          userId: people.examiner.id,
          daysAgo,
          violate: i % 2 === 0 ? [K0] : [],
          inOrganization: false,
        })),
      ],
      scans: [
        { examinerId: people.examiner.id, daysAgo: 4, area: FORMULA_AREA, team: "icu", violate: [K0] },
        { examinerId: people.examiner.id, daysAgo: 20, area: "مغسلة الطوارئ", team: "er" },
      ],
    });

    // Another institution: a trainee and a department that no filter, export or page of the first one may use.
    const other = await newInstitution(playwright, { stranger: { role: "trainee", name: "متدرب مؤسسة أخرى" } });
    stranger = other.people.stranger;
    const otherSeed = seedResults({
      organizationId: other.organizationId,
      protocolSlug: PROTOCOL.slug,
      teams: [{ key: "x", name: "قسم المؤسسة الأخرى", userIds: [stranger.id] }],
    });
    strangerTeamId = otherSeed.teamIds.x;
  });

  test("staff see the institution report with every section, accessible in both themes", async ({ page }, testInfo) => {
    test.slow();
    await signInAs(page, people.examiner);
    await page.goto("/ar/reports");
    await expect(page.getByRole("heading", { level: 1, name: msg("ar", "reports.title") })).toBeVisible();
    const views = page.getByRole("navigation", { name: msg("ar", "reports.views.label") });
    await expect(views.getByRole("link", { name: msg("ar", "reports.views.institution") })).toHaveAttribute("aria-current", "page");
    await expect(views.getByText(institutionName)).toBeVisible();

    // Default range = last 90 days: 3 completed attempts (the 200-day one, the open ones and the examiner's own
    // training outside the institution are out), 2 scans.
    const inRange = [...seed.attemptScores.slice(0, 3), ...seed.scanScores];
    const kpi = msg("ar", "reports.kpi.label");
    await expect(tileValue(page, kpi, msg("ar", "reports.kpi.overall"))).toHaveText(percent("ar", average(inRange)));
    await expect(tileValue(page, kpi, msg("ar", "reports.kpi.scans"))).toHaveText("2");
    await expect(tileValue(page, kpi, msg("ar", "reports.kpi.simulations"))).toHaveText("3");

    const trend = region(page, msg("ar", "reports.trend.title"));
    await expect(trend.getByText(msg("ar", "reports.trend.showTable"))).toBeVisible();
    // The chart's keyboard stop has a name (it was an unnamed "application").
    await expect(trend.getByRole("application", { name: msg("ar", "reports.trend.chartLabel") })).toBeVisible();
    await expect(region(page, msg("ar", "reports.risk.title")).getByRole("table")).toBeVisible();

    // Top gap: the step violated in every attempt and in one scan, with the scenario that trains it.
    const gaps = region(page, msg("ar", "reports.gaps.title"));
    const first = gaps.getByRole("listitem").first();
    await expect(first).toContainText(PROTOCOL.steps[0].textAr);
    await expect(first.getByRole("link", { name: SCENARIO.titleAr })).toHaveAttribute("href", `/ar/simulations/${seed.scenarioSlug}`);
    // An ordinary step missed through a critical option is a critical VIOLATION, never a "critical step".
    const critical = gaps.getByRole("listitem").filter({ hasText: STEP2.textAr });
    await expect(critical).toContainText(format("ar", msg("ar", "reports.critical.violations"), { count: 1 }));
    await expect(gaps.getByText(msg("ar", "reports.critical.step"), { exact: true })).toHaveCount(0);

    await expect(region(page, msg("ar", "reports.byProtocol.title"))).toContainText(PROTOCOL.titleAr);
    const departments = region(page, msg("ar", "reports.byDepartment.title"));
    await expect(departments.getByText("العناية المركزة").filter({ visible: true }).first()).toBeVisible();
    await expect(departments.getByText("الطوارئ").filter({ visible: true }).first()).toBeVisible();

    const trainees = region(page, msg("ar", "reports.trainees.title"));
    await expect(trainees.getByRole("link", { name: people.amal.name })).toHaveAttribute("href", `/ar/reports/trainees/${people.amal.id}`);
    await expect(trainees.getByRole("link", { name: people.badr.name })).toBeVisible();
    // The examiner trains outside the institution only: no row for her.
    await expect(trainees.getByRole("link", { name: people.examiner.name })).toHaveCount(0);

    await checkBothThemes(page, testInfo, "/ar/reports");
  });

  test("filters live in the URL: department, a longer range, reset; the pressed button keeps the focus", async ({ page }) => {
    test.slow();
    await signInAs(page, people.examiner);
    await page.goto("/ar/reports");
    const apply = page.getByRole("button", { name: msg("ar", "reports.filters.apply"), exact: true });
    await waitForHydration(apply);
    const form = page.getByRole("form", { name: msg("ar", "reports.filters.label") });

    await page.getByRole("combobox", { name: msg("ar", "reports.filters.department") }).click();
    await page.getByRole("option", { name: "الطوارئ", exact: true }).click();
    await apply.click();
    await expect(page).toHaveURL(new RegExp(`[?&]department=${seed.teamIds.er}`));
    const kpi = msg("ar", "reports.kpi.label");
    await expect(tileValue(page, kpi, msg("ar", "reports.kpi.scans"))).toHaveText("1");
    await expect(tileValue(page, kpi, msg("ar", "reports.kpi.simulations"))).toHaveText("1");
    const trainees = region(page, msg("ar", "reports.trainees.title"));
    await expect(trainees.getByRole("link", { name: people.badr.name })).toBeVisible();
    await expect(trainees.getByRole("link", { name: people.amal.name })).toHaveCount(0);
    // The form is not remounted by the new URL: Apply keeps the focus, and the live region says the report changed.
    await expect(apply).toBeFocused();
    await expect(form.getByRole("status")).toHaveText(msg("ar", "reports.filters.updated"));

    // The last 12 months bring the 200-day attempt in; the department stays.
    const year = page.getByRole("button", { name: msg("ar", "reports.filters.preset365") });
    await year.click();
    await expect(page).toHaveURL(/[?&]from=\d{4}-\d{2}-\d{2}/);
    await expect(page).toHaveURL(new RegExp(`[?&]department=${seed.teamIds.er}`));
    await expect(tileValue(page, kpi, msg("ar", "reports.kpi.simulations"))).toHaveText("2");
    await expect(year).toBeFocused();
    await expect(year).toHaveAttribute("aria-pressed", "true");

    // A reload keeps the same report (state is in the URL only).
    await page.reload();
    await expect(tileValue(page, kpi, msg("ar", "reports.kpi.simulations"))).toHaveText("2");

    const reset = page.getByRole("button", { name: msg("ar", "reports.filters.reset") });
    await waitForHydration(reset);
    await reset.click();
    await expect(page).toHaveURL(urlPath("/ar/reports"));
    await expect(tileValue(page, kpi, msg("ar", "reports.kpi.simulations"))).toHaveText("3");
    await expect(reset).toBeFocused();
  });

  test("a range that starts in the future is cut to today, and the form still applies", async ({ page }) => {
    await signInAs(page, people.examiner);
    await page.goto("/en/reports?from=2099-01-01");
    const to = page.locator("#report-to");
    await expect(to).toBeVisible();
    const max = await to.getAttribute("max");
    await expect(to).toHaveValue(max ?? "");
    await expect(page.locator("#report-from")).toHaveValue(max ?? "");
    expect(await to.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
  });

  test("the export menu downloads Excel-ready files: UTF-16, TAB-separated, formula-safe, institution staff only", async ({ page }) => {
    test.slow();
    await signInAs(page, people.examiner);
    await page.goto("/ar/reports");
    const menu = page.getByRole("button", { name: msg("ar", "common.actions.exportCsv") });
    await waitForHydration(menu);

    // Through the UI: the file is saved and a toast says how many rows it holds.
    await menu.click();
    const downloading = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: msg("ar", "reports.export.scans") }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^waqaya-scans-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
    const rows = exportRows(new Uint8Array(await readFile(await download.path())));
    const columns = ["finalizedAt", "area", "protocol", "department", "examiner", "score", "risk", "id"];
    expect(rows[0]).toEqual(columns.map((c) => msg("ar", `reports.export.columns.${c}`)));
    expect(rows).toHaveLength(3); // header + 2 scans
    expect(rows.every((r) => r.length === columns.length)).toBe(true);
    // A typed "=HYPERLINK(...)" area becomes text: prefixed with ' (and quoted for its quotes).
    expect(rows.map((r) => r[1])).toContain(`"'=HYPERLINK(""https://example.com"")"`);
    expect(rows.flat()).toContain(people.examiner.name);
    await expect(page.getByText(format("ar", msg("ar", "reports.export.ready"), { count: 2 }))).toBeVisible();

    const attempts = await page.request.get("/api/reports/export?kind=attempts&locale=en");
    expect(attempts.status()).toBe(200);
    expect(attempts.headers()["content-type"]).toBe("text/csv; charset=utf-16le");
    const attemptRows = exportRows(new Uint8Array(await attempts.body()));
    expect(attemptRows[0][0]).toBe(msg("en", "reports.export.columns.completedAt"));
    expect(attemptRows).toHaveLength(4); // header + 3 completed attempts in the last 90 days
    expect(attemptRows.flat()).toContain(people.amal.name);
    // The name with a formula behind ";" stays in its cell, neutralised.
    expect(attemptRows.map((r) => r[1])).toContain("بدر المتدرب;'=1+1");

    const bad = await page.request.get("/api/reports/export?kind=everything");
    expect(bad.status()).toBe(400);
    // HEAD builds nothing (no file, no audit row, no rate-limit slot).
    expect((await page.request.head("/api/reports/export?kind=scans")).status()).toBe(405);

    // A trainee of the same institution gets nothing.
    await signInAs(page, people.amal);
    const denied = await page.request.get("/api/reports/export?kind=scans&locale=ar");
    expect(denied.status()).toBe(403);
  });

  test("the export menu says why there is no file, and when a file was cut", async ({ page }) => {
    await signInAs(page, people.examiner);
    await page.goto("/ar/reports");
    const menu = page.getByRole("button", { name: msg("ar", "common.actions.exportCsv") });
    await waitForHydration(menu);

    // Over the hourly limit (the server's 429 is unit-tested; here the browser gets one).
    await page.route("**/api/reports/export?**", (route) =>
      route.fulfill({ status: 429, headers: { "Retry-After": "1800", "Content-Type": "application/json" }, body: '{"error":"too_many_requests"}' }),
    );
    await menu.click();
    await page.getByRole("menuitem", { name: msg("ar", "reports.export.attempts") }).click();
    await expect(page.getByText(format("ar", msg("ar", "reports.export.errors.tooMany"), { minutes: 30 }))).toBeVisible();
    await expect(page).toHaveURL(urlPath("/ar/reports"));

    // Cut at the row cap: downloaded, with a warning.
    await page.unroute("**/api/reports/export?**");
    await page.route("**/api/reports/export?**", (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-16le",
          "Content-Disposition": 'attachment; filename="waqaya-scans-cut.csv"',
          "X-Export-Rows": "10000",
          "X-Export-Truncated": "1",
        },
        body: Buffer.from("﻿a\r\n", "utf16le"),
      }),
    );
    await menu.click();
    const downloading = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: msg("ar", "reports.export.scans") }).click();
    expect((await downloading).suggestedFilename()).toBe("waqaya-scans-cut.csv");
    const tenThousand = new Intl.NumberFormat("ar", { numberingSystem: "latn", maximumFractionDigits: 0 }).format(10_000);
    await expect(page.getByText(fill(msg("ar", "reports.export.truncated"), { count: tenThousand }))).toBeVisible();
  });

  test("another institution's department, trainee or ids never filter or open anything here", async ({ page }) => {
    await signInAs(page, people.examiner);
    // A foreign department in the URL is dropped: the unfiltered totals, "all departments" in the filter bar.
    await page.goto(`/ar/reports?department=${strangerTeamId}`);
    const kpi = msg("ar", "reports.kpi.label");
    await expect(tileValue(page, kpi, msg("ar", "reports.kpi.scans"))).toHaveText("2");
    await expect(tileValue(page, kpi, msg("ar", "reports.kpi.simulations"))).toHaveText("3");
    await expect(page.getByRole("combobox", { name: msg("ar", "reports.filters.department") })).toContainText(msg("ar", "reports.filters.allDepartments"));
    await expect(page.getByText("قسم المؤسسة الأخرى")).toHaveCount(0);

    const exported = await page.request.get(`/api/reports/export?kind=scans&locale=ar&department=${strangerTeamId}`);
    expect(exported.status()).toBe(200);
    expect(exportRows(new Uint8Array(await exported.body()))).toHaveLength(3); // header + both scans

    await page.goto(`/ar/reports/print?department=${strangerTeamId}`);
    await expect(page.getByRole("region", { name: msg("ar", "reports.print.details") })).toContainText(msg("ar", "reports.filters.allDepartments"));

    // Another institution's trainee (a real user, a member elsewhere): not found here.
    await page.goto(`/ar/reports/trainees/${stranger.id}`);
    await expectNotFound(page);
    await page.goto(`/ar/reports/trainees/${people.examiner.id}x`);
    await expectNotFound(page);
  });

  test("a department without trainees says so, without offering an invitation", async ({ page }) => {
    await signInAs(page, people.examiner);
    await page.goto(`/ar/reports?department=${seed.teamIds.empty}`);
    await expect(page.getByRole("heading", { level: 2, name: msg("ar", "reports.institution.noMatchTitle") })).toBeVisible();
    const trainees = region(page, msg("ar", "reports.trainees.title"));
    await expect(trainees.getByText(msg("ar", "reports.trainees.noneInDepartment"))).toBeVisible();
    await expect(trainees.getByText(msg("ar", "reports.trainees.none"))).toHaveCount(0);
    await expect(trainees.getByRole("link", { name: msg("ar", "reports.trainees.invite") })).toHaveCount(0);
  });

  test("the printable report holds the same sections, in both languages", async ({ page }, testInfo) => {
    test.slow();
    await signInAs(page, people.examiner);
    await page.goto("/ar/reports");
    // The action opens the print view (its own button prints): labelled as a view, not as "Print".
    await expect(page.getByRole("link", { name: msg("ar", "reports.print.open") })).toHaveAttribute("href", "/ar/reports/print");
    await page.goto("/ar/reports/print");
    await expect(page.getByRole("heading", { level: 1, name: msg("ar", "reports.print.title") })).toBeVisible();
    const details = page.getByRole("region", { name: msg("ar", "reports.print.details") });
    await expect(details.getByText(institutionName)).toBeVisible();
    await expect(page.getByRole("button", { name: msg("ar", "common.actions.print") })).toBeVisible();
    await expect(region(page, msg("ar", "reports.print.gaps"))).toContainText(PROTOCOL.steps[0].textAr);
    await expect(region(page, msg("ar", "reports.print.trainees")).getByRole("link", { name: people.amal.name })).toBeVisible();
    await expectAccessible(page, testInfo, { label: "print ar" });

    // On paper: the product's name heads the sheet, and a long section may flow onto the next page.
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("main").getByText(msg("ar", "common.appName"), { exact: true })).toBeVisible();
    expect(await region(page, msg("ar", "reports.print.trainees")).evaluate((el) => getComputedStyle(el).breakInside)).toBe("auto");
    await page.emulateMedia({ media: "screen" });

    await page.goto("/en/reports/print");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1, name: msg("en", "reports.print.title") })).toBeVisible();
    await expect(region(page, msg("en", "reports.print.byProtocol"))).toContainText(PROTOCOL.titleEn);
    await expectAccessible(page, testInfo, { label: "print en" });
  });

  test("staff open a trainee's results from the progress table, and come back to the same report", async ({ page }, testInfo) => {
    test.slow();
    await signInAs(page, people.examiner);
    await page.goto("/ar/reports");
    const link = region(page, msg("ar", "reports.trainees.title")).getByRole("link", { name: people.amal.name });
    await waitForHydration(link);
    await link.click();
    await expect(page).toHaveURL(urlPath(`/ar/reports/trainees/${people.amal.id}`));
    await expect(page.getByRole("heading", { level: 1, name: people.amal.name })).toBeVisible();
    const history = region(page, msg("ar", "reports.personal.history.title"));
    for (const id of seed.attemptIds.slice(0, 2)) {
      await expect(history.locator(`a[href="/ar/simulations/attempts/${id}"]:visible`)).toHaveCount(1);
    }
    // The attempt still in progress is listed with its status (contrast-checked by axe below, light theme).
    await expect(history.getByText(msg("ar", "common.attemptStatus.in_progress")).filter({ visible: true }).first()).toBeVisible();
    await expectAccessible(page, testInfo, { label: "trainee" });

    // From a filtered report, the back link keeps the filters and returns to the trainee section.
    await page.goto(`/ar/reports?department=${seed.teamIds.er}`);
    const badr = region(page, msg("ar", "reports.trainees.title")).getByRole("link", { name: people.badr.name });
    await waitForHydration(badr);
    await badr.click();
    await expect(page).toHaveURL(new RegExp(`/ar/reports/trainees/${people.badr.id}\\?department=${seed.teamIds.er}$`));
    const back = page.getByRole("link", { name: msg("ar", "reports.trainee.back") });
    await expect(back).toHaveAttribute("href", `/ar/reports?department=${seed.teamIds.er}#report-trainees`);
    await waitForHydration(back);
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/ar/reports\\?department=${seed.teamIds.er}#report-trainees$`));
    await expect(region(page, msg("ar", "reports.trainees.title"))).toBeInViewport();
  });

  test("switching to my results and back keeps the report filters", async ({ page }) => {
    await signInAs(page, people.examiner);
    // The last 60 days (Riyadh calendar days), in the ER: Badr's scan (20 days ago) and attempt (5 days ago).
    const filtered = `/ar/reports?department=${seed.teamIds.er}&from=${riyadhDaysAgo(60)}&to=${riyadhDaysAgo(0)}`;
    await page.goto(filtered);
    const views = page.getByRole("navigation", { name: msg("ar", "reports.views.label") });
    const mine = views.getByRole("link", { name: msg("ar", "reports.views.personal") });
    await expect(mine).toHaveAttribute("href", `${filtered}&view=personal`);
    await waitForHydration(mine);
    await mine.click();
    await expect(page).toHaveURL(urlPath(`${filtered}&view=personal`));
    await expect(region(page, msg("ar", "reports.personal.history.title"))).toBeVisible();
    // My results ignore the filters but carry them back.
    const institution = views.getByRole("link", { name: msg("ar", "reports.views.institution") });
    await expect(institution).toHaveAttribute("href", filtered);
    await institution.click();
    await expect(page).toHaveURL(urlPath(filtered));
    await expect(tileValue(page, msg("ar", "reports.kpi.label"), msg("ar", "reports.kpi.scans"))).toHaveText("1");
  });

  test("a trainee of the institution sees only their own results, with recommendations", async ({ page }, testInfo) => {
    test.slow();
    await signInAs(page, people.amal);
    await page.goto("/ar/reports");
    await expect(page.getByRole("navigation", { name: msg("ar", "reports.views.label") })).toHaveCount(0);
    const kpi = msg("ar", "reports.personal.kpi.label");
    await expect(tileValue(page, kpi, msg("ar", "reports.personal.kpi.completed"))).toHaveText("2");
    await expect(tileValue(page, kpi, msg("ar", "reports.personal.kpi.average"))).toHaveText(percent("ar", average(seed.attemptScores.slice(0, 2))));

    // Two completed attempts: the trend chart and its table.
    await expect(region(page, msg("ar", "reports.personal.trend.title")).getByText(msg("ar", "reports.personal.trend.showTable"))).toBeVisible();
    // The step missed in both attempts comes first, with a scenario to practise it.
    const weak = region(page, msg("ar", "reports.personal.weak.title"));
    await expect(weak.getByRole("listitem").first()).toContainText(PROTOCOL.steps[0].textAr);
    await expect(
      weak.getByRole("link", { name: fill(msg("ar", "reports.personal.weak.practice"), { title: SCENARIO.titleAr }) }).first(),
    ).toHaveAttribute("href", `/ar/simulations/${seed.scenarioSlug}`);
    await expect(weak.getByRole("listitem").filter({ hasText: STEP2.textAr })).toContainText(msg("ar", "reports.critical.violation"));
    const history = region(page, msg("ar", "reports.personal.history.title"));
    await expect(history.locator(`a[href="/ar/simulations/attempts/${seed.attemptIds[0]}"]:visible`)).toHaveCount(1);
    // Badr's attempts never show here.
    await expect(history.locator(`a[href="/ar/simulations/attempts/${seed.attemptIds[2]}"]`)).toHaveCount(0);

    await checkBothThemes(page, testInfo, "/ar/reports");

    await page.goto("/ar/reports/print");
    await expectNotFound(page);
    await page.goto(`/ar/reports/trainees/${people.badr.id}`);
    await expectNotFound(page);
  });

  test("phone, tablet and wide layouts: chart dates apart, weak steps readable, names with room", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAs(page, people.examiner);
    for (const locale of ["ar", "en"] as const) {
      await page.goto(`/${locale}/reports?view=personal`);
      const chart = region(page, msg(locale, "reports.personal.trend.title")).getByRole("application");
      await expect(chart).toBeVisible();
      // The date labels: every text of the chart except the percent ticks of the y-axis.
      await expect(chart.locator("text").first()).toBeVisible();
      const boxes = await chart.evaluate((svg) =>
        [...svg.querySelectorAll("text")]
          .filter((n) => /\d/.test(n.textContent ?? "") && !/[%٪]/.test(n.textContent ?? ""))
          .map((n) => n.getBoundingClientRect())
          .filter((r) => r.width > 0)
          .map((r) => ({ left: r.left, right: r.right })),
      );
      if (boxes.length < 2) await testInfo.attach(`chart ${locale}.html`, { body: await chart.evaluate((e) => e.outerHTML), contentType: "text/html" });
      expect(boxes.length).toBeGreaterThanOrEqual(2);
      const sorted = boxes.sort((a, b) => a.left - b.left);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].left, `${locale}: tick ${i} overlaps tick ${i - 1}`).toBeGreaterThanOrEqual(sorted[i - 1].right);
      }
      await testInfo.attach(`personal ${locale} 390.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    }
    // On a phone the trainee cards show every weak step in full (no two-line cut without a way to read the rest).
    await page.goto("/ar/reports");
    const trainees = region(page, msg("ar", "reports.trainees.title"));
    const phoneSteps = trainees.locator("dd li").filter({ visible: true });
    await expect(phoneSteps.first()).toBeVisible();
    const clamped = await phoneSteps.evaluateAll((items) =>
      items.flatMap((li) => [li, ...li.querySelectorAll("*")]).filter((el) => getComputedStyle(el).webkitLineClamp !== "none").length,
    );
    expect(clamped).toBe(0);

    // A tablet with the sidebar open: the institution report keeps its cards until a table fits.
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto("/ar/reports");
    await expect(region(page, msg("ar", "reports.trainees.title"))).toBeVisible();
    await testInfo.attach("institution ar 820.png", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

    // 1024 px with the sidebar: the by-protocol table gives the names the room, not the number columns.
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/ar/reports");
    const byProtocol = region(page, msg("ar", "reports.byProtocol.title")).getByRole("table");
    await expect(byProtocol).toBeVisible();
    const widths = await byProtocol.locator("thead th").evaluateAll((cells) => cells.map((c) => c.getBoundingClientRect().width));
    const [name, , scans, simulations, high] = widths;
    expect(name, `column widths ${widths.join(", ")}`).toBeGreaterThanOrEqual(160);
    for (const numbers of [scans, simulations, high]) expect(name, `column widths ${widths.join(", ")}`).toBeGreaterThan(numbers);
    await testInfo.attach("institution ar 1024.png", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

    // A wide screen: the trainee table cuts a weak step to two lines and gives the whole text as its tooltip.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ar/reports");
    const tableSteps = region(page, msg("ar", "reports.trainees.title")).getByRole("table").locator("td li > span[title]");
    await expect(tableSteps.first()).toBeVisible();
    for (const step of await tableSteps.all()) expect(await step.getAttribute("title")).toBe((await step.textContent())?.trim());
  });
});

test("a new institution without results shows the first-run state to its owner", async ({ page, playwright }, testInfo) => {
  test.slow(); // a sign-up with an e-mailed code and an institution
  const inst = await newInstitution(playwright, { owner: { role: "owner", name: "مالكة المؤسسة" } });
  await signInAs(page, inst.people.owner);
  await page.goto("/ar/reports");
  await expect(page.getByRole("heading", { level: 2, name: msg("ar", "reports.institution.emptyTitle") })).toBeVisible();
  await expect(page.getByRole("link", { name: msg("ar", "reports.institution.startScan") })).toHaveAttribute("href", "/ar/scans/new");
  const trainees = region(page, msg("ar", "reports.trainees.title"));
  await expect(trainees.getByText(msg("ar", "reports.trainees.none"))).toBeVisible();
  await expect(trainees.getByRole("link", { name: msg("ar", "reports.trainees.invite") })).toHaveAttribute("href", "/ar/org/members");
  // The outline action has its border in the light theme (buttonVariants merged with cn()).
  const simulations = page.getByRole("main").getByRole("link", { name: msg("ar", "reports.institution.openSimulations") });
  expect(await simulations.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe("rgba(0, 0, 0, 0)");
  // Nothing to export or filter yet.
  await expect(page.getByRole("button", { name: msg("ar", "common.actions.exportCsv") })).toHaveCount(0);
  await expect(page.getByRole("form", { name: msg("ar", "reports.filters.label") })).toHaveCount(0);
  await expectAccessible(page, testInfo, { label: "first run" });
});
