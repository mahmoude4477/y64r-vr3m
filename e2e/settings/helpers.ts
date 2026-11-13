import { type APIRequestContext, type Browser, type BrowserContext, expect, type Page } from "@playwright/test";
import { authPost } from "../support/auth";
import { type Locale, msg, waitForHydration } from "../support/fixtures";

// Helpers of the settings specs (e2e/settings/**). Every test signs up its own user (createVerifiedUser).

/**
 * The settings page, hydrated (its forms and radios answer clicks). Field locators keep visible matches only: in two
 * slow phone runs the page also held a hidden second copy of the streamed settings content, with the same ids (a
 * streamed Suspense segment left behind when React had already rendered the boundary on the client; reported to the
 * foundation). getByRole ignores hidden elements by itself; ids and text do not.
 */
export async function openSettings(page: Page, locale: Locale = "ar") {
  await page.goto(`/${locale}/settings`);
  await expect(page.getByRole("heading", { level: 1, name: msg(locale, "settings.title") })).toBeVisible();
  await waitForHydration(page.locator("#settings-name").filter({ visible: true }));
}

/** The list of active sessions (named by its heading). */
export function sessionsList(page: Page, locale: Locale = "ar") {
  return page.getByRole("list", { name: msg(locale, "settings.security.sessions.title") });
}

/** The list of the user's institutions (named by the section heading). */
export function institutionsList(page: Page, locale: Locale = "ar") {
  return page.getByRole("list", { name: msg(locale, "settings.institutions.title") });
}

/** Another device: a new browser context (same test IP for the rate limits) signed in through the API. */
export async function signedInElsewhere(
  browser: Browser,
  account: { email: string; password: string },
  headers: Record<string, string>,
): Promise<BrowserContext> {
  const context = await browser.newContext({ extraHTTPHeaders: headers });
  const res = await authPost(context.request, "/sign-in/email", { email: account.email, password: account.password });
  expect(res.ok(), `sign-in answered ${res.status()}: ${await res.text()}`).toBe(true);
  return context;
}

/** The signed-in user's saved language (user.locale), as Better Auth returns it. */
export async function savedLocale(request: APIRequestContext): Promise<string | null> {
  const res = await request.get("/api/auth/get-session");
  const body = (await res.json().catch(() => null)) as { user?: { locale?: string | null } } | null;
  return body?.user?.locale ?? null;
}
