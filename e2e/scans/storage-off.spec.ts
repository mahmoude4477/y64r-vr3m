import { spawnSync } from "node:child_process";
import { sessionUserId } from "../support/auth";
import { E2E_DATABASE_URL, ROOT } from "../support/env";
import { expect, msg, test } from "../support/fixtures";
import { expectAccessibleWithoutToasts, joinNewInstitution, SCAN_SEAMS, SHARPS } from "./support";

// A scan on a server WITHOUT photo storage and AI (the plain e2e server: no E2E_SCAN_SEAMS). Nothing can be uploaded
// there, so the scan is inserted into the test database by e2e/scans/fixtures/seed-scan.mts. The review must still work:
// the photos say storage is off instead of showing broken images, every step is answered by hand, and it finalises.

test.describe("review with storage and AI off", () => {
  test.skip(SCAN_SEAMS, "runs on the plain e2e server (storage and AI off): run without E2E_SCAN_SEAMS");

  test("the photos say storage is off; the examiner answers every step and finalises", async (
    { page, browser, clientIp, uniqueEmail, strongPassword },
    testInfo,
  ) => {
    test.setTimeout(240_000); // institution + sign-up + a tsx process + six saves + axe scans
    const inst = await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });
    const userId = await sessionUserId(page.request);
    expect(userId).toBeTruthy();
    const area = `E2E storage off ${Date.now()}`;
    const seeded = spawnSync(`pnpm exec tsx e2e/scans/fixtures/seed-scan.mts ${inst.organizationId} ${userId} "${area}"`, {
      cwd: ROOT,
      shell: true,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL, WAQAYA_E2E: "1" },
    });
    expect(seeded.status, `seed-scan failed: ${seeded.stderr}`).toBe(0);
    const scanId = (JSON.parse(seeded.stdout.trim().split("\n").at(-1)!) as { id: string }).id;

    await page.goto(`/ar/scans/${scanId}`);
    await expect(page.getByRole("heading", { level: 1, name: area })).toBeVisible();
    await expect(page.getByText(msg("ar", "common.states.storageOff"))).toBeVisible();
    // No broken image and no AI action without storage.
    await expect(page.locator('img[src^="/api/scans/photos/"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: msg("ar", "scans.detail.analysis.run") })).toHaveCount(0);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expectAccessibleWithoutToasts(page, testInfo, { label: `review-storage-off-${scheme}` });
    }

    const compliant = new RegExp(`^${msg("ar", "common.verdict.compliant")}`);
    for (const key of Object.values(SHARPS.steps)) {
      const card = page.locator(`article[data-step-key="${key}"]`);
      await expect(card).toContainText(
        key === SHARPS.steps.noRecap || key === SHARPS.steps.noHandCarry || key === SHARPS.steps.injury
          ? msg("ar", "scans.detail.step.manualOnly")
          : msg("ar", "scans.detail.step.noAi"),
      );
      await card.getByRole("radio", { name: compliant }).click();
      await expect(card.getByText(msg("ar", "scans.detail.step.saved"), { exact: true })).toBeVisible();
    }
    const summary = page.getByRole("region", { name: msg("ar", "scans.detail.summary.title") });
    await expect(summary).toContainText("100");
    await expect(summary).toContainText(msg("ar", "common.risk.low"));

    await page.getByRole("button", { name: msg("ar", "scans.detail.finalize.button") }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: msg("ar", "scans.detail.finalize.confirm") }).click();
    const result = page.getByRole("region", { name: msg("ar", "scans.detail.report.result") });
    await expect(result).toContainText(msg("ar", "scans.detail.report.riskReason.allCompliant"), { timeout: 30_000 });
    await expect(result).toContainText(msg("ar", "common.risk.low"));
    await expect(page.getByRole("region", { name: msg("ar", "scans.detail.report.recommendations.title") })).toContainText(
      msg("ar", "scans.detail.report.recommendations.none"),
    );
    await expect(page.getByText(msg("ar", "common.states.storageOff"))).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expectAccessibleWithoutToasts(page, testInfo, { label: `report-storage-off-${scheme}` });
    }
  });
});
