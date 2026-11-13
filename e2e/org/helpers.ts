import { randomUUID } from "node:crypto";
import type { APIRequestContext, Browser, BrowserContext, Page } from "@playwright/test";
import { type Account, addMember, createOrganization, createVerifiedUser } from "../support/auth";
import { ADMIN_STATE } from "../support/env";
import { expect, type Locale, msg } from "../support/fixtures";

// Helpers of the org specs (e2e/org/**). Every institution and person is new per test.

/** msg() with {placeholders} filled in (the specs look for the same text the page renders). */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all);
}

export type Institution = { id: string; slug: string; name: string; nameEn: string };

/**
 * A platform admin creates an institution (the admin becomes its first owner) and adds `owner` (signed in with
 * `ownerRequest`) as a second owner, the way the admin panel hands an institution over. Returns the admin context:
 * close it when done.
 */
export async function institutionWithOwner(
  browser: Browser,
  ownerRequest: APIRequestContext,
  input: { headers: Record<string, string>; email: string; password: string; name?: string; locale?: Locale },
): Promise<{ admin: BrowserContext; org: Institution; owner: Account }> {
  const admin = await browser.newContext({ storageState: ADMIN_STATE, extraHTTPHeaders: input.headers });
  const owner = await createVerifiedUser(ownerRequest, {
    email: input.email,
    password: input.password,
    name: input.name ?? "مالكة المؤسسة",
    locale: input.locale,
  });
  const tag = randomUUID().slice(0, 6);
  const name = `مستشفى الاختبار ${tag}`;
  const nameEn = `Test Hospital ${tag}`;
  const org = await createOrganization(admin.request, { name, nameEn, slug: `e2e-org-${randomUUID().slice(0, 12)}`, type: "hospital" });
  await addMember(admin.request, ownerRequest, { organizationId: org.id, email: owner.email, role: "owner" });
  return { admin, org: { ...org, name, nameEn }, owner };
}

/** A new signed-in person in their own browser context, added to the institution with `role` (through the API). */
export async function memberInNewContext(
  browser: Browser,
  inviter: APIRequestContext,
  input: { headers: Record<string, string>; organizationId: string; email: string; password: string; name: string; role: "admin" | "examiner" | "trainee" },
): Promise<{ context: BrowserContext; page: Page; account: Account }> {
  const context = await browser.newContext({ extraHTTPHeaders: input.headers });
  const account = await createVerifiedUser(context.request, { email: input.email, password: input.password, name: input.name });
  await addMember(inviter, context.request, { organizationId: input.organizationId, email: account.email, role: input.role });
  return { context, page: await context.newPage(), account };
}

/** On phones the sidebar is a sheet: open it before looking for navigation links. */
export async function openNavigation(page: Page, locale: Locale = "ar") {
  const viewport = page.viewportSize();
  if (viewport && viewport.width < 768) {
    await page.getByRole("button", { name: msg(locale, "nav.toggleSidebar") }).first().click();
  }
}

export async function expectNotFound(page: Page, locale: Locale = "ar") {
  const title = msg(locale, "common.notFound.title");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  // The tab says so too, not the name of the page that was refused (R2-UX-7).
  // The not-found titles are plain words (no regular-expression characters), so they go into the pattern as they are.
  await expect(page).toHaveTitle(new RegExp(`^${title}`));
}
