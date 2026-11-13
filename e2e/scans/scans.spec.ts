import { spawnSync } from "node:child_process";
import { expectAccessible } from "../support/a11y";
import { sessionUserId } from "../support/auth";
import { BASE_URL, E2E_DATABASE_URL, ROOT, TRAINEE_STATE } from "../support/env";
import { expect, type Locale, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import { expectNoSidewaysScroll, joinNewInstitution, makeJpeg, SCAN_SEAMS, SHARPS } from "./support";

// Smart scan, part 1: the scan list, the new-scan form (camera / upload -> photos -> AI analysis) and the API routes.
// Scans are institutional: only staff (owner / admin / examiner) of the ACTIVE institution reach them.
// The full upload + analysis flow needs the scan seams (E2E_SCAN_SEAMS=1: disk photo store + deterministic AI stub,
// e2e/README.md); without them storage and AI are off and the page must say so instead of crashing.

const AREA_PREFIX = "E2E sink";

test.describe("who may scan", () => {
  test.use({ storageState: TRAINEE_STATE });

  test("a trainee without an institution gets the not-found page and the API refuses", async ({ page }) => {
    for (const path of ["/ar/scans", "/ar/scans/new", "/en/scans"]) {
      await page.goto(path);
      const locale = path.split("/")[1] as Locale;
      await expect(page.getByRole("heading", { level: 1, name: msg(locale, "common.notFound.title") })).toBeVisible();
    }
    const sign = await page.request.post("/api/scans/photos/sign", { data: { contentType: "image/jpeg", size: 1000 } });
    expect(sign.status()).toBe(403);
    const create = await page.request.post("/api/scans", { data: { protocolId: "x", areaLabel: "x", photoIds: ["a"] } });
    expect(create.status()).toBe(403);
    expect((await page.request.get("/api/scans/photos/abc", { maxRedirects: 0 })).status()).toBe(403);
  });
});

test.describe("institution staff", () => {
  test("an examiner sees the first-run empty state and opens the new-scan form", async ({ page, browser, clientIp, uniqueEmail, strongPassword }, testInfo) => {
    test.slow(); // an institution, a sign-up with an e-mailed code, an invitation and four axe scans
    await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });

    await page.goto("/ar/scans");
    await expect(page.getByText(msg("ar", "scans.list.empty.title"))).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expectAccessible(page, testInfo, { label: `list-empty-${scheme}` });
    }

    await page.getByRole("link", { name: msg("ar", "scans.list.empty.action") }).click();
    await expect(page).toHaveURL(urlPath("/ar/scans/new"));
    await expect(page.getByRole("heading", { level: 1, name: msg("ar", "nav.sub.scanNew") })).toBeVisible();
    await expect(page.getByRole("combobox", { name: msg("ar", "scans.new.protocol") })).toBeVisible();
    await expect(page.getByLabel(msg("ar", "scans.new.area"))).toBeVisible();
    if (!SCAN_SEAMS) {
      // Storage and AI are off on a plain e2e server: one clear notice first, no crash, nothing to upload. (Without
      // storage nothing can be saved, so "save and answer by hand" would be a false promise: no AI notice then.)
      await expect(page.getByText(msg("ar", "common.states.storageOff"))).toBeVisible();
      await expect(page.getByText(msg("ar", "scans.new.ai.offNote"))).toHaveCount(0);
      await expect(page.getByText(msg("ar", "scans.new.submitHintPhotos"))).toHaveCount(0);
      await expect(page.getByRole("button", { name: msg("ar", "scans.new.photos.takePhoto") })).toBeDisabled();
    }
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expectAccessible(page, testInfo, { label: `new-${scheme}` });
    }
  });

  test("a cross-site request to the scan API is refused", async ({ page, browser, clientIp, uniqueEmail, strongPassword }) => {
    test.slow();
    await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });
    const res = await page.request.post("/api/scans/photos/sign", {
      data: { contentType: "image/jpeg", size: 1000 },
      headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden_origin" });
  });
});

test.describe("scan flow (disk store + AI stub)", () => {
  test.skip(!SCAN_SEAMS, "needs E2E_SCAN_SEAMS=1 (e2e/README.md)");

  test("upload a photo, analyse it, find the scan in the list", async ({ page, browser, clientIp, uniqueEmail, strongPassword }, testInfo) => {
    test.slow(); // institution + sign-up + upload + analysis + list checks
    const department = `Ward ${clientIp.split(".").at(-1)}`;
    const inst = await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword(), department });
    const area = `${AREA_PREFIX} ${Date.now()}`;

    await page.goto("/en/scans/new");
    await waitForHydration(page.locator("#scan-area"));
    await page.getByRole("combobox", { name: msg("en", "scans.new.protocol") }).click();
    await page.getByRole("option").first().click();
    await page.getByRole("combobox", { name: new RegExp(msg("en", "scans.new.department")) }).click();
    await page.getByRole("option", { name: department }).click();
    await page.locator("#scan-area").fill(area);

    // No photo yet: the form says so and moves focus to the camera button.
    await page.getByRole("button", { name: msg("en", "scans.new.submit") }).click();
    await expect(page.getByRole("alert").filter({ hasText: msg("en", "scans.new.submitHintPhotos") })).toBeVisible();
    // Said once: the footer's grey hint gives way to the error under the photos.
    await expect(page.getByText(msg("en", "scans.new.submitHintPhotos"))).toHaveCount(1);

    await page.getByTestId("scan-photo-input").setInputFiles([
      { name: "sink.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, 1) },
      { name: "label.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, 2) },
    ]);
    await expect(page.locator('li[data-status="uploaded"]')).toHaveCount(2, { timeout: 30_000 });
    await expectAccessible(page, testInfo, { label: "new-with-photos" });

    await page.getByRole("button", { name: msg("en", "scans.new.submit") }).click();
    // The review URL (the form itself is /en/scans/new, which must not count).
    await expect(page).toHaveURL(/\/en\/scans\/(?!new$)[A-Za-z0-9_-]+$/, { timeout: 60_000 });
    const scanId = new URL(page.url()).pathname.split("/").pop()!;

    // The analysis was saved with the scan: AI verdicts on the visual steps (stub pattern), none on the others.
    const status = await page.request.get(`/api/scans/${scanId}`);
    expect(status.ok()).toBe(true);
    const body = (await status.json()) as {
      status: string;
      photoIds: string[];
      results: Array<{ visual: boolean; aiVerdict: string | null; aiConfidence: number | null }>;
    };
    expect(body.status).toBe("review");
    expect(body.photoIds).toHaveLength(2);
    const visual = body.results.filter((r) => r.visual);
    expect(visual.length).toBeGreaterThan(0);
    expect(visual[0]).toMatchObject({ aiVerdict: "compliant", aiConfidence: 0.92 });
    if (visual[1]) expect(visual[1]).toMatchObject({ aiVerdict: "non_compliant" });
    expect(body.results.filter((r) => !r.visual).every((r) => r.aiVerdict === null)).toBe(true);

    // A photo opens through the authenticated 302 to a short-lived URL, and is a real JPEG.
    const view = await page.request.get(`/api/scans/photos/${body.photoIds[0]}`, { maxRedirects: 0 });
    expect(view.status()).toBe(302);
    expect(view.headers()["cache-control"]).toContain("private");
    const image = await page.request.get(`/api/scans/photos/${body.photoIds[0]}`);
    expect(image.headers()["content-type"]).toBe("image/jpeg");

    // A second analysis of the same scan is refused (the verdicts are kept).
    const again = await page.request.post(`/api/scans/${scanId}/analyze`, { data: {} });
    expect(again.status()).toBe(409);

    // The list shows it; the filters narrow by status, department and "mine".
    await page.goto("/en/scans");
    const link = page.getByRole("link", { name: new RegExp(area) });
    await expect(link).toBeVisible();
    await expect(page.getByText(msg("en", "common.scanStatus.review"), { exact: true }).filter({ visible: true }).first()).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expectAccessible(page, testInfo, { label: `list-${scheme}` });
    }
    await expectNoSidewaysScroll(page);
    await page.goto(`/en/scans?status=review&department=${inst.departmentId}&mine=1`);
    await expect(page.getByRole("link", { name: new RegExp(area) })).toBeVisible();
    await page.goto("/en/scans?status=finalized");
    await expect(page.getByText(msg("en", "scans.list.noMatch.title"))).toBeVisible();
    await page.goto(`/en/scans?q=${encodeURIComponent(area.slice(-6))}`);
    await expect(page.getByRole("link", { name: new RegExp(area) })).toBeVisible();

    // Staff of another institution never see it, not even by id.
    const outsider = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { "x-real-ip": clientIp } });
    try {
      const other = await outsider.newPage();
      await joinNewInstitution(browser, other, { clientIp, email: `other-${inst.email}`, password: strongPassword() });
      expect((await other.request.get(`/api/scans/${scanId}`)).status()).toBe(404);
      expect((await other.request.get(`/api/scans/photos/${body.photoIds[0]}`, { maxRedirects: 0 })).status()).toBe(404);
      expect((await other.request.post(`/api/scans/${scanId}/analyze`, { data: {} })).status()).toBe(404);
    } finally {
      await outsider.close();
    }
  });

  test("the AI limit is reached at submit: one notice, no retry, the scan stays a draft to review by hand", async (
    { page, browser, clientIp, uniqueEmail, strongPassword },
    testInfo,
  ) => {
    test.slow(); // institution + sign-up + upload + a tsx process + the review
    await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });
    const userId = await sessionUserId(page.request);
    expect(userId).toBeTruthy();
    await page.goto("/en/scans/new");
    await waitForHydration(page.locator("#scan-area"));
    await page.getByRole("combobox", { name: msg("en", "scans.new.protocol") }).click();
    await page.getByRole("option", { name: SHARPS.titleEn, exact: true }).click();
    await page.locator("#scan-area").fill(`E2E limit ${Date.now()}`);
    await page.getByTestId("scan-photo-input").setInputFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, 5) });
    await expect(page.locator('li[data-status="uploaded"]')).toHaveCount(1, { timeout: 30_000 });

    // Today's limit runs out after the page was opened (it still offers the analysis).
    const filled = spawnSync(`pnpm exec tsx e2e/scans/fixtures/fill-ai-quota.mts ${userId}`, {
      cwd: ROOT,
      shell: true,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL, WAQAYA_E2E: "1" },
    });
    expect(filled.status, `fill-ai-quota failed: ${filled.stderr}`).toBe(0);
    await page.getByRole("button", { name: msg("en", "scans.new.submit") }).click();

    // Said once, by the shared notice; no "did not finish" error and no retry that could never work.
    await expect(page.getByText(msg("en", "common.states.aiLimit"))).toHaveCount(1);
    await expect(page.getByText(msg("en", "scans.new.failed.descriptionManual"))).toBeVisible();
    await expect(page.getByText(msg("en", "scans.new.failed.title"))).toHaveCount(0);
    await expect(page.getByRole("button", { name: msg("en", "scans.new.failed.retry") })).toHaveCount(0);
    await expectAccessible(page, testInfo, { label: "new-limit-at-submit" });

    await page.getByRole("link", { name: msg("en", "scans.new.failed.manual") }).click();
    await expect(page).toHaveURL(/\/en\/scans\/(?!new$)[A-Za-z0-9_-]+$/, { timeout: 30_000 });
    const scanId = new URL(page.url()).pathname.split("/").pop()!;
    const status = (await (await page.request.get(`/api/scans/${scanId}`)).json()) as { status: string };
    expect(status.status).toBe("draft");
    // The review knows the AI never ran: the manual wording, and the limit notice instead of an "analyze" button.
    // (The router keeps the form page hidden in the DOM after the client-side navigation: count visible text only.)
    await expect(page.getByText(msg("en", "scans.detail.review.descriptionManual"))).toBeVisible();
    await expect(page.getByText(msg("en", "common.states.aiLimit")).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: msg("en", "scans.detail.analysis.run") })).toHaveCount(0);
  });

  test("an upload is discarded when the page is reloaded before saving", async ({ page, browser, clientIp, uniqueEmail, strongPassword }) => {
    test.slow();
    await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });
    await page.goto("/en/scans/new");
    await waitForHydration(page.locator("#scan-area"));
    const confirmed = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/scans/photos");
    await page.getByTestId("scan-photo-input").setInputFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, 6) });
    const photoId = ((await (await confirmed).json()) as { id: string }).id;
    await expect(page.locator('li[data-status="uploaded"]')).toHaveCount(1, { timeout: 30_000 });
    const photo = () => page.request.get(`/api/scans/photos/${photoId}`, { maxRedirects: 0 }).then((r) => r.status());
    expect(await photo()).toBe(302);

    // A reload never unmounts the form: the pagehide handler discards the upload (the leave prompt is accepted).
    page.on("dialog", (d) => void d.accept());
    await page.reload();
    await expect.poll(photo, { timeout: 15_000 }).toBe(404);
  });

  test("remove a photo before saving: it is discarded on the server", async ({ page, browser, clientIp, uniqueEmail, strongPassword }) => {
    test.slow();
    await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });
    await page.goto("/ar/scans/new");
    await waitForHydration(page.locator("#scan-area"));
    const discarded = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/api/scans/photos/"));
    await page.getByTestId("scan-photo-input").setInputFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, 3) });
    await expect(page.locator('li[data-status="uploaded"]')).toHaveCount(1, { timeout: 30_000 });
    await page.getByRole("button", { name: msg("ar", "scans.new.photos.remove").replace("{number}", "1") }).click();
    expect((await discarded).status()).toBe(200);
    await expect(page.locator("li[data-status]")).toHaveCount(0);
  });
});


test.describe("camera blocked", () => {
  test.skip(!SCAN_SEAMS, "needs E2E_SCAN_SEAMS=1 (e2e/README.md)");

  test("a denied camera says why and offers the upload instead", async ({ page, browser, clientIp, uniqueEmail, strongPassword }, testInfo) => {
    test.slow();
    // The browser refuses the camera the way it does after the user blocked it for the site.
    await page.addInitScript(() => {
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
      }
    });
    await joinNewInstitution(browser, page, { clientIp, email: uniqueEmail(), password: strongPassword() });
    await page.goto("/ar/scans/new");
    await waitForHydration(page.locator("#scan-area"));
    await page.getByRole("button", { name: msg("ar", "scans.new.photos.takePhoto") }).click();
    const dialog = page.getByRole("dialog", { name: msg("ar", "scans.new.camera.title") });
    await expect(dialog.getByRole("alert").filter({ hasText: msg("ar", "scans.new.camera.denied") })).toBeVisible();
    await expectAccessible(page, testInfo, { label: "camera-denied" });
    const chooser = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: msg("ar", "scans.new.camera.uploadInstead") }).click();
    await (await chooser).setFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, 4) });
    await expect(dialog).toBeHidden();
    await expect(page.locator('li[data-status="uploaded"]')).toHaveCount(1, { timeout: 30_000 });
  });
});
