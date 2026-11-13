import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { authPost, createVerifiedUser, sessionUserId } from "../support/auth";
import { ADMIN_STATE, E2E_DATABASE_URL, ROOT } from "../support/env";
import { expect, type Locale, msg, waitForHydration } from "../support/fixtures";

// Helpers for the admin panel specs (e2e/admin/**). The shared platform admin (ADMIN_STATE) is used read-mostly:
// it is never signed out, its password never changes and it never impersonates; a test that does any of that makes
// its own platform admin with newAdmin().

/** A context signed in as the shared platform admin, with the test's own client IP (Better Auth limits per IP). */
export async function sharedAdmin(browser: Browser, clientIp: string): Promise<BrowserContext> {
  return browser.newContext({ storageState: ADMIN_STATE, extraHTTPHeaders: { "x-real-ip": clientIp } });
}

/**
 * A fresh platform admin: a verified account signed in on `page`, promoted by the shared admin through Better Auth's
 * set-role (audited). Use it for flows that change the admin's own session (impersonation).
 */
export async function newAdmin(
  page: Page,
  shared: BrowserContext,
  account: { email: string; password: string; name?: string },
): Promise<{ id: string; email: string }> {
  await createVerifiedUser(page.request, { ...account, name: account.name ?? "مدير اختبار" });
  const id = await sessionUserId(page.request);
  expect(id).toBeTruthy();
  const promoted = await authPost(shared.request, "/admin/set-role", { userId: id, role: "admin" });
  expect(promoted.ok(), await promoted.text()).toBe(true);
  return { id: id!, email: account.email };
}

/**
 * Opens a Base UI select by its label and picks the option with this visible text. On a phone the filters of a long
 * admin list sit in a "Filters" disclosure: it is opened first when the select is not shown.
 */
export async function choose(page: Page, label: string, option: string) {
  const select = page.getByRole("combobox", { name: label });
  // The list's filters stream in with its data: wait for the select, or for the phone toggle that hides it.
  await expect(select.or(page.locator("[data-filters-toggle]")).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
  if (!(await select.isVisible())) await openFilters(page);
  await select.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Phones: opens the "Filters (n)" disclosure of an admin list (no-op on wide screens, where it is hidden). */
export async function openFilters(page: Page) {
  // The filters stream in with the list's data.
  await expect(page.getByRole("search").first()).toBeVisible({ timeout: 20_000 });
  const toggle = page.locator("[data-filters-toggle]").first();
  if ((await toggle.count()) === 0 || !(await toggle.isVisible())) return;
  if ((await toggle.getAttribute("aria-expanded")) === "true") return;
  await waitForHydration(toggle);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

/** The list's live region (role=status) holding "Showing 1–2 of 2" or the empty / no-results title. */
export function listStatus(page: Page, text: string) {
  return page.getByRole("status").filter({ hasText: text });
}

/** "Showing {from}–{to} of {total}" in that language. */
export function summaryText(locale: Locale, from: number, to: number, total: number) {
  return msg(locale, "admin.list.summary").replace("{from}", String(from)).replace("{to}", String(to)).replace("{total}", String(total));
}

/** A message as shown on the page: rich-text tags such as <code>…</code> removed (the text inside stays). */
export function plain(locale: Locale, key: string, values: Record<string, string> = {}) {
  let text = msg(locale, key).replace(/<\/?[a-z]+>/g, "");
  for (const [k, v] of Object.entries(values)) text = text.replaceAll(`{${k}}`, v);
  return text;
}

/** Waits until the page's main heading is there (data streamed) and the given control is hydrated. */
export async function ready(page: Page, heading: string | RegExp, control?: string, locale: Locale = "ar") {
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: msg(locale, "common.notFound.title") })).toHaveCount(0);
  if (control) await waitForHydration(page.getByRole("button", { name: control }).first());
}

/** The not-found page a denied admin URL shows (a client-side 404 inside a 200: assert on the UI), titled the same. */
export async function expectNotFound(page: Page, locale: Locale = "ar") {
  await expect(page.getByRole("heading", { level: 1, name: msg(locale, "common.notFound.title") })).toBeVisible({ timeout: 20_000 });
  await expectTitle(page, msg(locale, "common.notFound.title"));
}

/** The document title starts with `start` ("<start> | Waqaya", or "<start> | <section> | Waqaya"). */
export async function expectTitle(page: Page, start: string) {
  const escaped = start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(page).toHaveTitle(new RegExp(`^${escaped} \\|`), { timeout: 20_000 });
}

export type SeededAssessments = {
  organization: { id: string; name: string; nameEn: string };
  examiner: { id: string; name: string };
  trainee: { id: string; name: string };
  scans: { finalized: { id: string; areaLabel: string; score: number | null; riskLevel: string | null }; inReview: { id: string; areaLabel: string } };
  scenario: { id: string; titleAr: string; titleEn: string };
  attempt: { id: string; score: number | null; riskLevel: string | null };
};

/**
 * A new institution with a finalised scan (two photo rows), a scan in review, a completed attempt on its own scenario
 * and six AI calls (every state), written by e2e/admin/seed-assessments.mts (tsx in its own short process: Playwright
 * cannot load the generated Prisma client). Every call makes new rows, so parallel tests never share them.
 */
export function seedAssessments(): SeededAssessments {
  const run = spawnSync(
    process.execPath,
    [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join("e2e", "admin", "seed-assessments.mts")],
    {
      cwd: ROOT,
      input: JSON.stringify({ tag: randomUUID().slice(0, 8) }),
      encoding: "utf8",
      env: { ...process.env, ADMIN_SEED_DATABASE_URL: E2E_DATABASE_URL },
      timeout: 90_000,
    },
  );
  if (run.status !== 0) throw new Error(`seed-assessments.mts failed (${run.status}): ${run.stderr}`);
  return JSON.parse(run.stdout.trim().split("\n").at(-1) ?? "{}") as SeededAssessments;
}
