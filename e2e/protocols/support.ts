import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { APIRequestContext, Browser, Locator, Page } from "@playwright/test";
import { protocols as seedProtocols } from "../../prisma/seed/protocols";
import { addMember, authPost, createOrganization, createVerifiedUser } from "../support/auth";
import { ADMIN_STATE, E2E_DATABASE_URL, ROOT } from "../support/env";
import { expect, type Locale, msg } from "../support/fixtures";

// Helpers of the protocol library specs. Seed content (titles, steps, references) is read from
// prisma/seed/protocols.ts, so the specs follow content edits the same way msg() follows copy edits.

export { seedProtocols };

export function seedProtocol(slug: string) {
  const found = seedProtocols.find((p) => p.slug === slug);
  if (!found) throw new Error(`no seed protocol ${slug}`);
  return found;
}

/** "e2e-<random>": test rows use this prefix (db.mts refuses anything else). */
export function testSlug(label: string): string {
  return `e2e-${label}-${randomUUID().slice(0, 8)}`;
}

type DbResult = { protocols: Record<string, string>; scenarios: Record<string, string> };

/** Runs e2e/protocols/db.mts against the e2e database (JSON actions in, ids out). */
export function db(actions: unknown[]): DbResult {
  const once = () =>
    spawnSync(process.execPath, [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join("e2e", "protocols", "db.mts")], {
      cwd: ROOT,
      input: JSON.stringify(actions),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
      timeout: 120_000, // tsx + Prisma start; slow while the full suite loads the machine
    });
  let run = once();
  // A busy shared database can time out the connection before the first query: one more try (a create that did
  // run would fail the retry on its unique "e2e-" slug, so nothing is written twice).
  if (run.status !== 0 && /connection (timeout|terminated)|ECONNREFUSED|ECONNRESET/i.test(run.stderr ?? "")) run = once();
  if (run.status !== 0) throw new Error(`e2e/protocols/db.mts failed (${run.status}): ${run.stderr}`);
  const last = run.stdout.trim().split("\n").at(-1) ?? "{}";
  return JSON.parse(last) as DbResult;
}

/** Deletes the rows a test created (scenarios first). Safe to call twice. */
export function cleanup(rows: { protocolSlugs?: string[]; scenarioSlugs?: string[] }) {
  db([{ type: "delete", protocolSlugs: rows.protocolSlugs ?? [], scenarioSlugs: rows.scenarioSlugs ?? [] }]);
}

/**
 * A new institution (created by the platform admin) and a fresh verified user who joins it with `role` and makes it
 * the active institution of `memberRequest`'s session (the browser context it belongs to is signed in afterwards).
 */
export async function joinNewInstitution(
  browser: Browser,
  memberRequest: APIRequestContext,
  input: { email: string; password: string; role: "owner" | "admin" | "examiner" | "trainee"; clientIp: string },
): Promise<{ organizationId: string }> {
  const admin = await browser.newContext({ storageState: ADMIN_STATE, extraHTTPHeaders: { "x-real-ip": input.clientIp } });
  try {
    await createVerifiedUser(memberRequest, { email: input.email, password: input.password });
    const org = await createOrganization(admin.request, {
      name: `مستشفى البروتوكولات ${randomUUID().slice(0, 6)}`,
      nameEn: "Protocols test hospital",
      slug: `e2e-${randomUUID().slice(0, 12)}`,
      type: "hospital",
    });
    await addMember(admin.request, memberRequest, { organizationId: org.id, email: input.email, role: input.role });
    const active = await authPost(memberRequest, "/organization/set-active", { organizationId: org.id });
    expect(active.ok(), await active.text()).toBe(true);
    return { organizationId: org.id };
  } finally {
    await admin.close();
  }
}

/** A second institution nobody in the test belongs to (except the platform admin who created it). */
export async function otherInstitution(browser: Browser, clientIp: string): Promise<{ organizationId: string }> {
  const admin = await browser.newContext({ storageState: ADMIN_STATE, extraHTTPHeaders: { "x-real-ip": clientIp } });
  try {
    const org = await createOrganization(admin.request, { name: `مؤسسة أخرى ${randomUUID().slice(0, 6)}`, slug: `e2e-${randomUUID().slice(0, 12)}` });
    return { organizationId: org.id };
  } finally {
    await admin.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Protocol editor (/admin/protocols/**, /org/protocols/**)

/** A message whose only placeholders are plain {name} values (no plural / select), filled in like next-intl does. */
export function msgWith(locale: Locale, key: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), msg(locale, key));
}

export const notFoundHeading = (locale: Locale) => ({ level: 1 as const, name: msg(locale, "common.notFound.title") });

/** The editor's form on screen (pages the router keeps mounted after a navigation are hidden, not removed). */
export function editorForm(page: Page): Locator {
  return page.locator("form[data-protocol-editor]").filter({ visible: true });
}

/** Step `index` (0-based) of the editor. */
export function editorStep(page: Page, index: number): Locator {
  return editorForm(page).locator("ol > li").nth(index);
}

/** Fills the four required texts of an OPEN step. */
export async function fillStepTexts(step: Locator, locale: Locale, texts: { textAr: string; textEn: string; rationaleAr: string; rationaleEn: string }) {
  const f = (key: string) => step.getByLabel(msg(locale, `protocols.editor.steps.fields.${key}`), { exact: true });
  await f("textAr").fill(texts.textAr);
  await f("textEn").fill(texts.textEn);
  await f("rationaleAr").fill(texts.rationaleAr);
  await f("rationaleEn").fill(texts.rationaleEn);
}

/** The id at the end of an editor URL (/<locale>/<admin|org>/protocols/<id>). */
export function editorIdFromUrl(url: string): string {
  const match = /\/protocols\/([a-z0-9]+)$/.exec(new URL(url).pathname);
  if (!match) throw new Error(`not an editor URL: ${url}`);
  return match[1]!;
}

/**
 * Waits until no toast is on screen (a toast fading in or out has partial opacity, which axe reads as low contrast).
 * A toast under the pointer never times out (on the phone it sits where the save button was tapped): move the pointer
 * away first.
 */
export async function noToasts(page: Page) {
  await page.mouse.move(1, 1);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 20_000 });
}

/** Opens the publish / unpublish / version / delete dialog and confirms it. */
export async function confirmDialog(page: Page, trigger: string, confirm: string = trigger) {
  await page.getByRole("button", { name: trigger, exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirm, exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });
}
