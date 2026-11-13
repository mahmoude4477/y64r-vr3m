import { expectAccessible } from "../support/a11y";
import { expect, msg, test, waitForHydration } from "../support/fixtures";
import { joinNewInstitution, SCAN_SEAMS } from "./support";

// The in-app camera with Chromium's fake camera (a moving test pattern). Launch flags apply to a whole file
// (Playwright starts a new worker for them), so this test has its own file.

test.use({
  permissions: ["camera"],
  launchOptions: {
    ...(process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {}),
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
});

test.describe("camera (fake device)", () => {
  test.skip(!SCAN_SEAMS, "needs E2E_SCAN_SEAMS=1 (e2e/README.md)");

  test("take a photo with the rear camera and upload it", async ({ page, browser, clientIp, uniqueEmail, strongPassword }, testInfo) => {
    test.slow();
    await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });
    await page.goto("/en/scans/new");
    await waitForHydration(page.locator("#scan-area"));
    await page.getByRole("button", { name: msg("en", "scans.new.photos.takePhoto") }).click();
    const dialog = page.getByRole("dialog", { name: msg("en", "scans.new.camera.title") });
    await expect(dialog).toBeVisible();
    const shutter = dialog.getByRole("button", { name: msg("en", "scans.new.camera.capture") });
    // The first getUserMedia starts the browser's video capture process: slow on a busy machine.
    await expect(shutter).toBeEnabled({ timeout: 30_000 });
    await expectAccessible(page, testInfo, { label: "camera" });
    await shutter.click();
    await expect(dialog.getByText(msg("en", "scans.new.camera.taken").replace("{count}", "1").replace("{max}", "4"))).toBeVisible();
    await dialog.getByRole("button", { name: msg("en", "scans.new.camera.done") }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('li[data-status="uploaded"]')).toHaveCount(1, { timeout: 30_000 });
  });
});
