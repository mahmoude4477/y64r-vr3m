import { randomUUID } from "node:crypto";
import { type Browser, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { expectAccessible } from "../support/a11y";
import { addMember, authPost, createOrganization, createVerifiedUser } from "../support/auth";
import { ADMIN_STATE, BASE_URL } from "../support/env";
import { msg, waitForHydration } from "../support/fixtures";

/**
 * expectAccessible once the toasts are gone. Toasts are transient (4 s), and sonner's rich success colours are under
 * 4.5:1 in light mode (foundation request: components/providers.tsx), so a scan that catches one fails on the toast,
 * not on the page. The pointer leaves the page first: a hovered toaster pauses its timers.
 */
export async function expectAccessibleWithoutToasts(page: Page, testInfo: TestInfo, opts: { label?: string } = {}): Promise<void> {
  await page.mouse.move(0, 0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 20_000 });
  await expectAccessible(page, testInfo, opts);
}

/**
 * Tablets and small laptops (the sidebar is shown from 768 px; iPad portrait 768 / 820, landscape 1024 / 1180): the
 * page never scrolls sideways, and no visible table hides columns in its own scroll box (touch screens show no
 * scrollbar, so a cut-off Status or Result column would simply look missing). Restores the viewport.
 */
export async function expectNoSidewaysScroll(page: Page, widths: readonly number[] = [768, 820, 1024, 1180, 1280]): Promise<void> {
  const before = page.viewportSize();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
        message: `sideways scroll at ${width} px`,
      })
      .toBeLessThanOrEqual(0);
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Math.max(
              0,
              ...Array.from(document.querySelectorAll<HTMLElement>("[data-slot=table-container]"))
                .filter((el) => el.getClientRects().length > 0)
                .map((el) => el.scrollWidth - el.clientWidth),
            ),
          ),
        { message: `a table cut off inside its own scroll box at ${width} px` },
      )
      .toBeLessThanOrEqual(1);
  }
  if (before) await page.setViewportSize(before);
}

/** The colour `locator`'s text is drawn in, as sRGB 0-255, whatever CSS colour syntax set it (oklch(), color-mix()…). */
export async function textRgb(locator: Locator): Promise<[number, number, number]> {
  return locator.evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const g = canvas.getContext("2d")!;
    g.fillStyle = getComputedStyle(el).color;
    g.fillRect(0, 0, 1, 1);
    const [r, green, b] = g.getImageData(0, 0, 1, 1).data;
    return [r, green, b] as [number, number, number];
  });
}

/** True when the server runs with the scan seams (disk photo store + AI stub): E2E_SCAN_SEAMS=1, e2e/README.md. */
export const SCAN_SEAMS = process.env.E2E_SCAN_SEAMS === "1";

export type Institution = { organizationId: string; departmentId: string | null; email: string };

/** The English name of every institution joinNewInstitution creates (the report prints it). */
export const INSTITUTION_EN = "Scan test hospital";

/**
 * A fresh institution (created by the shared platform admin, who becomes its owner) with `page` signed in as a new
 * member of it in `role`, the institution active in that session. Optionally one department.
 */
export async function joinNewInstitution(
  browser: Browser,
  page: Page,
  input: { clientIp: string; email: string; password: string; role?: "examiner" | "admin" | "trainee"; department?: string },
): Promise<Institution> {
  const admin = await browser.newContext({ storageState: ADMIN_STATE, baseURL: BASE_URL, extraHTTPHeaders: { "x-real-ip": input.clientIp } });
  try {
    const slug = `e2e-scan-${randomUUID().slice(0, 10)}`;
    const org = await createOrganization(admin.request, { name: "مستشفى اختبار الفحص", nameEn: INSTITUTION_EN, slug, type: "hospital" });
    let departmentId: string | null = null;
    if (input.department) {
      const res = await authPost(admin.request, "/organization/create-team", { name: input.department, organizationId: org.id });
      expect(res.ok(), `create-team answered ${res.status()}`).toBe(true);
      departmentId = ((await res.json()) as { id: string }).id;
    }
    await createVerifiedUser(page.request, { email: input.email, password: input.password, name: "مقيّم اختبار" });
    await addMember(admin.request, page.request, { organizationId: org.id, email: input.email, role: input.role ?? "examiner" });
    const active = await authPost(page.request, "/organization/set-active", { organizationId: org.id });
    expect(active.ok(), `set-active answered ${active.status()}`).toBe(true);
    return { organizationId: org.id, departmentId, email: input.email };
  } finally {
    await admin.close();
  }
}

/** A small real JPEG drawn in the page (no fixture file): a "sink" and a "label" on a tiled wall. */
export async function makeJpeg(page: Page, seed = 0): Promise<Buffer> {
  const base64 = await page.evaluate((s) => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const g = canvas.getContext("2d")!;
    g.fillStyle = `hsl(${(s * 47) % 360} 30% 85%)`;
    g.fillRect(0, 0, 800, 600);
    g.strokeStyle = "#9aa";
    for (let x = 0; x < 800; x += 40) g.strokeRect(x, 0, 40, 600);
    g.fillStyle = "#eef";
    g.fillRect(250, 300, 300, 120);
    g.fillStyle = "#333";
    g.fillRect(560, 120, 90, 60);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  }, seed);
  return Buffer.from(base64, "base64");
}

/** `page` signs up and joins an EXISTING test institution (created by the shared admin, its owner) in `role`. */
export async function joinInstitution(
  browser: Browser,
  page: Page,
  input: { clientIp: string; organizationId: string; email: string; password: string; role: "examiner" | "admin" | "trainee"; name?: string },
): Promise<void> {
  const admin = await browser.newContext({ storageState: ADMIN_STATE, baseURL: BASE_URL, extraHTTPHeaders: { "x-real-ip": input.clientIp } });
  try {
    await createVerifiedUser(page.request, { email: input.email, password: input.password, name: input.name ?? "مقيّم ثانٍ" });
    await addMember(admin.request, page.request, { organizationId: input.organizationId, email: input.email, role: input.role });
    const active = await authPost(page.request, "/organization/set-active", { organizationId: input.organizationId });
    expect(active.ok(), `set-active answered ${active.status()}`).toBe(true);
  } finally {
    await admin.close();
  }
}

/**
 * The seeded "Sharps safety" protocol (prisma/seed/protocols.ts): 6 steps, 3 checked from photos. With the AI stub the
 * visual ones come back compliant 92 %, non-compliant 81 %, not visible (lib/scans/e2e/ai-stub.ts).
 */
export const SHARPS = {
  titleEn: "Sharps safety",
  steps: {
    noRecap: "no-recap", // non-visual, critical, weight 3
    disposal: "immediate-disposal", // visual -> AI compliant 0.92, critical, weight 3
    container: "container-at-point-of-use", // visual -> AI non_compliant 0.81, weight 2
    fillLine: "container-fill-line", // visual -> AI not_visible 0.35, weight 2
    noHandCarry: "no-hand-carry", // non-visual, weight 2
    injury: "report-injury", // non-visual, weight 2
  },
} as const;

/**
 * The seeded "Sink, faucet and hand hygiene station" protocol: 6 steps, all checked from photos. With the AI stub its
 * fourth step (paper towels) comes back compliant at 55 %, under the review threshold: an unsure verdict.
 */
export const HAND_HYGIENE = { titleEn: "Sink, faucet and hand hygiene station", unsureStep: "paper-towels" } as const;

/**
 * New scan through the real form in English (protocol by its seeded title, one JPEG via setInputFiles), analysed by
 * the stub; resolves on the review page with the scan's id.
 */
export async function startAnalyzedScan(page: Page, input: { area: string; protocolTitle?: string }): Promise<string> {
  await page.goto("/en/scans/new");
  await waitForHydration(page.locator("#scan-area"));
  await page.getByRole("combobox", { name: msg("en", "scans.new.protocol") }).click();
  await page.getByRole("option", { name: input.protocolTitle ?? SHARPS.titleEn, exact: true }).click();
  await page.locator("#scan-area").fill(input.area);
  await page.getByTestId("scan-photo-input").setInputFiles({ name: "sharps.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, 7) });
  await expect(page.locator('li[data-status="uploaded"]')).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole("button", { name: msg("en", "scans.new.submit") }).click();
  await expect(page).toHaveURL(/\/en\/scans\/(?!new$)[A-Za-z0-9_-]+$/, { timeout: 60_000 });
  return new URL(page.url()).pathname.split("/").pop()!;
}
