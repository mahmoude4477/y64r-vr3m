import { randomUUID } from "node:crypto";
import { authPost, createOrganization, createVerifiedUser, signInWithForm } from "../support/auth";
import { ADMIN_STATE, BASE_URL, TRAINEE_STATE } from "../support/env";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";

// Who may open what. The proxy only redirects optimistically (cookie present or not); the real checks run in
// every page and endpoint (CONVENTIONS 4). Assert on the UI, never on status codes: a denied page is a client-side
// not-found inside a 200 response.

test.describe("guests", () => {
  test("a signed-in area sends guests to sign-in with a locale-prefixed callback", async ({ page }) => {
    await page.goto("/ar/dashboard");
    await expect(page).toHaveURL(urlPath("/ar/sign-in?callbackUrl=%2Far%2Fdashboard"));
    await page.goto("/en/protocols?tab=all");
    await expect(page).toHaveURL(urlPath("/en/sign-in?callbackUrl=%2Fen%2Fprotocols%3Ftab%3Dall"));
  });

  test("after signing in, the visitor lands on the page they asked for", async ({ page, request, uniqueEmail, strongPassword }) => {
    const account = await createVerifiedUser(request, { email: uniqueEmail(), password: strongPassword() });
    await page.goto("/ar/protocols");
    await expect(page).toHaveURL(urlPath("/ar/sign-in?callbackUrl=%2Far%2Fprotocols"));
    await waitForHydration(page.locator("#email"));
    await page.locator("#email").fill(account.email);
    await page.locator("#password").fill(account.password);
    await page.getByRole("button", { name: msg("ar", "auth.signIn.submit"), exact: true }).click();
    await expect(page).toHaveURL(urlPath("/ar/protocols"));
  });

  test("an unsafe callback never leaves the site", async ({ page, request, uniqueEmail, strongPassword }) => {
    test.slow(); // a sign-up and four form sign-ins (password hashing): 23-27 s alone, more under parallel load
    const account = await createVerifiedUser(request, { email: uniqueEmail(), password: strongPassword() });
    // Absolute, protocol-relative and backslash tricks ("/\evil" resolves to https://evil), crosscheck C6.
    for (const callback of ["https://evil.example/x", "//evil.example/x", "/\\evil.example/x", "javascript:alert(1)"]) {
      await page.context().clearCookies();
      await signInWithForm(page, account, { query: `?callbackUrl=${encodeURIComponent(callback)}` });
      expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL!).host);
    }
  });
});

test.describe("a session cookie whose session is gone (deleted elsewhere, revoked, expired)", () => {
  test("lands on sign-in on the SAME host, with the dead cookie cleared", async ({ page }) => {
    await page.context().addCookies([{ name: "better-auth.session_token", value: "gone.gone", url: BASE_URL }]);
    await page.goto("/ar/dashboard");
    await expect(page).toHaveURL(urlPath("/ar/sign-in"));
    expect(new URL(page.url()).origin).toBe(BASE_URL); // review round 2: never http://localhost:<port>
    const cookies = await page.context().cookies(BASE_URL);
    expect(cookies.find((c) => c.name === "better-auth.session_token")).toBeUndefined();
  });

  test("the redirect is relative whatever Host the proxy in front sends", async ({ request }) => {
    for (const locale of ["ar", "en"]) {
      const res = await request.get(`/api/session/expired?locale=${locale}`, {
        headers: { cookie: "better-auth.session_token=gone.gone", "x-forwarded-host": "waqaya.example", "x-forwarded-proto": "https" },
        maxRedirects: 0,
      });
      expect(res.status()).toBe(307);
      expect(res.headers().location).toBe(`/${locale}/sign-in`);
      expect(res.headers()["cache-control"]).toBe("no-store");
    }
  });
});

test.describe("signed-in trainee", () => {
  test.use({ storageState: TRAINEE_STATE });

  test("guest-only pages send a signed-in user to the dashboard", async ({ page }) => {
    await page.goto("/ar/sign-in");
    await expect(page).toHaveURL(urlPath("/ar/dashboard"));
    await page.goto("/en/sign-up");
    await expect(page).toHaveURL(urlPath("/en/dashboard"));
  });

  test("the platform admin area is not found for a trainee", async ({ page }) => {
    await page.goto("/ar/admin");
    await expect(page.getByRole("heading", { level: 1, name: msg("ar", "common.notFound.title") })).toBeVisible();
  });

  test("a trainee cannot create an institution through the API", async ({ page }) => {
    const res = await authPost(page.request, "/organization/create", { name: "مؤسسة", slug: `e2e-${randomUUID().slice(0, 12)}` });
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(403);
  });
});

test.describe("platform admin", () => {
  test.use({ storageState: ADMIN_STATE });

  test("a platform admin creates an institution through the API", async ({ page }) => {
    const slug = `e2e-${randomUUID().slice(0, 12)}`;
    const org = await createOrganization(page.request, { name: "مستشفى اختبار", nameEn: "E2E Hospital", slug, type: "hospital" });
    expect(org.slug).toBe(slug);
    expect(org.id).toBeTruthy();
  });
});
