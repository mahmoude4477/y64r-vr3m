import { readFileSync } from "node:fs";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { BASE_URL } from "./env";
import { type Locale, msg, urlPath, waitForHydration } from "./fixtures";
import { codeFor } from "./mail";

// Account helpers for specs. API helpers go through Better Auth's real endpoints (same rate limits, hooks and
// e-mails as the UI); UI helpers drive the real forms. Every account is created fresh: never reuse one that another
// test may sign out (signing out deletes the session row).

export type Account = { email: string; password: string; name: string };

/** Better Auth checks the Origin of state-changing requests against BETTER_AUTH_URL. */
const ORIGIN = { origin: new URL(BASE_URL).origin };

/** POST /api/auth/<path> with our Origin. Returns the response as is (check `.ok()` / `.status()` yourself). */
export function authPost(request: APIRequestContext, path: string, data: Record<string, unknown>) {
  return request.post(`/api/auth${path}`, { data, headers: ORIGIN });
}

async function postAuth(request: APIRequestContext, path: string, data: Record<string, unknown>) {
  const res = await authPost(request, path, data);
  expect(res.ok(), `${path} answered ${res.status()}: ${await res.text()}`).toBe(true);
  return res;
}

/**
 * Signs up through the API and verifies the address with the e-mailed code. With `request = page.request` (or
 * `context.request`) the browser context is signed in afterwards (autoSignInAfterVerification); with the plain
 * `request` fixture the browser stays signed out.
 */
export async function createVerifiedUser(
  request: APIRequestContext,
  account: { email: string; password: string; name?: string; locale?: Locale },
): Promise<Account> {
  const name = account.name ?? "متدرب اختبار";
  const since = Date.now();
  await postAuth(request, "/sign-up/email", {
    name,
    email: account.email,
    password: account.password,
    locale: account.locale ?? "ar",
  });
  const otp = await codeFor(account.email, "email-verification", since);
  await postAuth(request, "/email-otp/verify-email", { email: account.email, otp });
  return { email: account.email, password: account.password, name };
}

/** Signs in through the sign-in form and waits for the destination (default: the dashboard). */
export async function signInWithForm(
  page: Page,
  account: Pick<Account, "email" | "password">,
  { locale = "ar", query = "", expectPath }: { locale?: Locale; query?: string; expectPath?: string } = {},
) {
  await page.goto(`/${locale}/sign-in${query}`);
  await waitForHydration(page.locator("#email"));
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByRole("button", { name: msg(locale, "auth.signIn.submit"), exact: true }).click();
  await expect(page).toHaveURL(urlPath(expectPath ?? `/${locale}/dashboard`));
}

/** Signs out through the account menu in the app header and waits for the sign-in page. */
export async function signOutWithMenu(page: Page, locale: Locale = "ar") {
  await page.getByRole("button", { name: msg(locale, "nav.userMenu.label") }).click();
  await page.getByRole("menuitem", { name: msg(locale, "nav.userMenu.signOut") }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in`));
}

/** Credentials saved by the setup project (e2e/.auth/*-cred.json). */
export function readAccount(file: string): Account {
  return JSON.parse(readFileSync(file, "utf8")) as Account;
}

/**
 * Creates an institution through Better Auth's organization API. Only platform admins may (lib/auth.ts
 * allowUserToCreateOrganization): pass the admin's request context, e.g.
 * `const ctx = await browser.newContext({ storageState: ADMIN_STATE }); await createOrganization(ctx.request, …)`.
 * The creator becomes its owner. The creator's active institution does NOT switch (keepCurrentActiveOrganization),
 * so the shared admin session stays as the setup left it.
 */
export async function createOrganization(
  request: APIRequestContext,
  org: { name: string; nameEn?: string; slug: string; type?: "university" | "hospital" | "training_center" | "government" },
): Promise<{ id: string; slug: string }> {
  const res = await postAuth(request, "/organization/create", { ...org, keepCurrentActiveOrganization: true });
  const body = (await res.json()) as { id: string; slug: string };
  return { id: body.id, slug: body.slug };
}

/** The signed-in user's id for a request context (null when signed out). */
export async function sessionUserId(request: APIRequestContext): Promise<string | null> {
  const res = await request.get("/api/auth/get-session");
  const body = (await res.json().catch(() => null)) as { user?: { id?: string } } | null;
  return body?.user?.id ?? null;
}

/**
 * Invites `email` to an institution with the inviter's context (an owner/admin of it, or a platform admin who is a
 * member) and accepts with the invitee's signed-in context. The invitee must have a verified address.
 */
export async function addMember(
  inviter: APIRequestContext,
  invitee: APIRequestContext,
  input: { organizationId: string; email: string; role: "owner" | "admin" | "examiner" | "trainee" },
): Promise<void> {
  const invited = await postAuth(inviter, "/organization/invite-member", input);
  const { id } = (await invited.json()) as { id: string };
  await postAuth(invitee, "/organization/accept-invitation", { invitationId: id });
}
