import { expectAccessible } from "../support/a11y";
import { ADMIN_STATE } from "../support/env";
import { expect, msg, test, urlPath } from "../support/fixtures";
import { choose, expectNotFound, expectTitle, listStatus, ready, seedAssessments, summaryText } from "./helpers";

// /admin/assessments (PRODUCT 6a): every scan and simulation attempt on the platform, a read-only detail of each, and
// deleting abusive content with a reason (audited). The data of each test is its own institution
// (e2e/admin/seed-assessments.mts): the scan and simulation flows are built by other teams in parallel.

test.use({ storageState: ADMIN_STATE });

test("scans: filter by institution and status, open the read-only detail (light and dark)", async ({ page }, testInfo) => {
  test.slow();
  const data = seedAssessments();
  const { finalized, inReview } = data.scans;

  await page.goto(`/ar/admin/assessments?org=${data.organization.id}`);
  await ready(page, msg("ar", "nav.sub.adminAssessments"));
  const tabs = page.getByRole("navigation", { name: msg("ar", "admin.assessments.kindsLabel") });
  await expect(tabs.getByRole("link", { name: msg("ar", "admin.assessments.kinds.scans") })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: finalized.areaLabel })).toBeVisible();
  await expect(page.getByRole("link", { name: inReview.areaLabel })).toBeVisible();
  await expect(listStatus(page, summaryText("ar", 1, 2, 2))).toHaveCount(1);
  await expectAccessible(page, testInfo, { label: "list ar light" });

  // The status filter keeps the institution; "in review" leaves only the scan in review.
  await choose(page, msg("ar", "admin.assessments.status"), msg("ar", "common.scanStatus.review"));
  await expect(page).toHaveURL(/status=review/);
  await expect(page).toHaveURL(new RegExp(`org=${data.organization.id}`));
  await expect(page.getByRole("link", { name: inReview.areaLabel })).toBeVisible();
  await expect(page.getByRole("link", { name: finalized.areaLabel })).toHaveCount(0);

  // A risk level nothing has: the "no matches" state, and clearing keeps nothing.
  await choose(page, msg("ar", "common.risk.label"), msg("ar", "common.risk.low"));
  await expect(page.getByRole("heading", { name: msg("ar", "admin.assessments.noResults.title") })).toBeVisible();

  await page.goto(`/ar/admin/assessments?org=${data.organization.id}`);
  await page.getByRole("link", { name: finalized.areaLabel }).first().click();
  await ready(page, finalized.areaLabel);
  await expect(page).toHaveURL(urlPath(`/ar/admin/assessments/scans/${finalized.id}`));
  // Titled by its area, like the heading, so several open scans can be told apart.
  await expectTitle(page, `${finalized.areaLabel} | ${msg("ar", "admin.assessment.scanTitle")}`);
  for (const key of ["about", "photos.title", "steps.title", "notes.title", "aiCalls"]) {
    await expect(page.getByRole("heading", { level: 2, name: msg("ar", `admin.assessment.${key}`) })).toBeVisible();
  }
  if (process.env.E2E_SCAN_SEAMS === "1") {
    // With the e2e disk photo store on (scan seams), the photos are shown through the platform-admin photo route.
    await expect(page.locator('a[href^="/api/admin/photos/"]')).toHaveCount(2);
  } else {
    // No bucket: the photos say so (in the words of a read-only page) instead of showing broken images.
    await expect(page.getByText(msg("ar", "admin.assessment.photos.storageOff").replace("{n}", "2"))).toBeVisible();
  }
  // A finalised scan: the AI verdicts the examiner left alone were accepted by finalising (lib/scoring.ts), so no
  // step reads "not decided yet".
  await expect(page.getByText(msg("ar", "admin.assessment.steps.aiAccepted")).first()).toBeVisible();
  await expect(page.getByText(msg("ar", "admin.assessment.steps.noFinal"))).toHaveCount(0);
  await expect(page.getByText("الغطاء مفتوح", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: data.organization.name })).toHaveAttribute("href", `/ar/admin/organizations/${data.organization.id}`);
  await expect(page.getByRole("button", { name: msg("ar", "admin.assessment.delete.scan") })).toBeVisible();
  // The AI call's model id stays on one line, also at 390 px (the mobile project): it once broke mid-token.
  const model = page.locator("code", { hasText: "claude-opus-5-5" }).first();
  await expect(model).toBeVisible();
  expect(await model.evaluate((el) => el.getClientRects().length)).toBe(1);
  await expectAccessible(page, testInfo, { label: "scan ar light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expectAccessible(page, testInfo, { label: "scan ar dark" });
});

test("attempts: the tab, the detail with every stage and the debrief, then delete it with a reason", async ({ page }, testInfo) => {
  test.slow();
  const data = seedAssessments();

  await page.goto(`/en/admin/assessments?org=${data.organization.id}`);
  await ready(page, msg("en", "nav.sub.adminAssessments"), undefined, "en");
  await page
    .getByRole("navigation", { name: msg("en", "admin.assessments.kindsLabel") })
    .getByRole("link", { name: msg("en", "admin.assessments.kinds.attempts") })
    .click();
  await expect(page).toHaveURL(/kind=attempts/);
  await expect(page).toHaveURL(new RegExp(`org=${data.organization.id}`));
  const row = page.getByRole("link", { name: data.scenario.titleEn }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expectAccessible(page, testInfo, { label: "attempts en light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expectAccessible(page, testInfo, { label: "attempts en dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  await row.click();

  await ready(page, data.scenario.titleEn, msg("en", "admin.assessment.delete.attempt"), "en");
  await expectTitle(page, `${data.scenario.titleEn} | ${msg("en", "admin.assessment.attemptTitle")}`);
  await expect(page.getByRole("heading", { level: 2, name: msg("en", "admin.assessment.stages.title") })).toBeVisible();
  await expect(page.getByText(msg("en", "admin.assessment.stages.correct")).first()).toBeVisible();
  await expect(page.getByText(msg("en", "admin.assessment.stages.wrong")).first()).toBeVisible();
  await expect(page.getByText("Too late.")).toBeVisible(); // the feedback of the wrong option the trainee chose
  await expect(page.getByRole("heading", { level: 2, name: msg("en", "admin.assessment.debrief.title") })).toBeVisible();
  await expectAccessible(page, testInfo, { label: "attempt en light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expectAccessible(page, testInfo, { label: "attempt en dark" });
  await page.emulateMedia({ colorScheme: "light" });

  await page.getByRole("button", { name: msg("en", "admin.assessment.delete.attempt") }).click();
  const dialog = page.getByRole("alertdialog");
  // No reason yet: the dialog says so and nothing is deleted.
  await dialog.getByRole("button", { name: msg("en", "admin.assessment.delete.attemptSubmit") }).click();
  await expect(dialog.getByText(msg("en", "admin.assessment.delete.reasonRequired"))).toBeVisible();
  await choose(page, msg("en", "admin.assessment.delete.reason"), msg("en", "admin.assessment.delete.reasons.test"));
  await dialog.getByRole("button", { name: msg("en", "admin.assessment.delete.attemptSubmit") }).click();
  await expect(page).toHaveURL(/\/en\/admin\/assessments\?kind=attempts$/, { timeout: 30_000 });

  await page.goto(`/en/admin/assessments?kind=attempts&org=${data.organization.id}`);
  await expect(page.getByRole("heading", { name: msg("en", "admin.assessments.emptyAttempts.title") }).or(page.getByRole("heading", { name: msg("en", "admin.assessments.noResults.title") }))).toBeVisible();
  await page.goto(`/en/admin/assessments/attempts/${data.attempt.id}`);
  await expectNotFound(page, "en");

  // The audit log names the deletion and its reason.
  await page.goto(`/en/admin/audit?action=attempt.delete&org=${data.organization.id}`);
  await ready(page, msg("en", "nav.sub.adminAudit"), undefined, "en");
  const entry = page.getByRole("list", { name: msg("en", "admin.audit.listLabel") }).getByRole("listitem").first();
  await expect(entry.getByText(msg("en", "admin.activity.actions.attemptDelete"))).toBeVisible();
  await entry.getByText(msg("en", "admin.audit.details")).click();
  await expect(entry.getByText(data.attempt.id)).toBeVisible();
  await expect(entry.getByText("test", { exact: true })).toBeVisible();
});

test("delete a scan with its photos (audited with the reason)", async ({ page }) => {
  test.slow();
  const data = seedAssessments();
  const { finalized } = data.scans;

  await page.goto(`/ar/admin/assessments/scans/${finalized.id}`);
  await ready(page, finalized.areaLabel, msg("ar", "admin.assessment.delete.scan"));
  await page.getByRole("button", { name: msg("ar", "admin.assessment.delete.scan") }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText(msg("ar", "admin.assessment.delete.scanPhotos").replace("{n}", "2"))).toBeVisible();
  await choose(page, msg("ar", "admin.assessment.delete.reason"), msg("ar", "admin.assessment.delete.reasons.abusive"));
  await dialog.getByRole("button", { name: msg("ar", "admin.assessment.delete.scanSubmit") }).click();
  await expect(page).toHaveURL(urlPath("/ar/admin/assessments"), { timeout: 30_000 });

  await page.goto(`/ar/admin/assessments?org=${data.organization.id}`);
  await expect(page.getByRole("link", { name: data.scans.inReview.areaLabel })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: finalized.areaLabel })).toHaveCount(0);

  await page.goto(`/ar/admin/audit?action=scan.delete&org=${data.organization.id}`);
  await ready(page, msg("ar", "nav.sub.adminAudit"));
  const entry = page.getByRole("list", { name: msg("ar", "admin.audit.listLabel") }).getByRole("listitem").first();
  await expect(entry.getByText(msg("ar", "admin.activity.actions.scanDelete"))).toBeVisible();
  await entry.getByText(msg("ar", "admin.audit.details")).click();
  await expect(entry.getByText("abusive", { exact: true })).toBeVisible();
});
