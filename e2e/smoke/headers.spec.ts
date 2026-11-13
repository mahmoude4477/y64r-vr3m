import { TRAINEE_STATE } from "../support/env";
import { expect, msg, test } from "../support/fixtures";

// Security headers on every kind of response (lib/security-headers.ts, note 07 §1.6) and no Content-Security-Policy
// violations while the main pages load and hydrate. This server runs on http and is not Railway "production":
// no HSTS, and X-Robots-Tag noindex.

const PATHS = ["/ar", "/en/sign-in", "/api/health", "/robots.txt", "/og/ar.png", "/ar/this-page-does-not-exist"];

test("security headers on pages, API routes, static files and 404s", async ({ request }) => {
  for (const path of PATHS) {
    const h = (await request.get(path, { maxRedirects: 0 })).headers();
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], path).toContain("camera=(self)");
    expect(h["permissions-policy"], path).toContain("microphone=()");
    const csp = h["content-security-policy"] ?? "";
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).toContain("object-src 'none'");
    expect(csp, path).not.toContain("unsafe-eval");
    expect(csp, path).not.toMatch(/'nonce-|'sha256-/); // never next to 'unsafe-inline' (note 07, Gotcha 1)
    expect(h["strict-transport-security"], path).toBeUndefined(); // http only
    expect(h["x-robots-tag"], path).toBe("noindex, nofollow");
    expect(h["x-powered-by"], path).toBeUndefined();
  }
});

test("the bare-domain redirect carries the headers too", async ({ request }) => {
  const res = await request.get("/", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["content-security-policy"]).toContain("default-src 'self'");
});

/** Records CSP violations reported by the page (the browser fires securitypolicyviolation events). */
async function watchCsp(page: import("@playwright/test").Page) {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      console.log(`[cspv] ${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`),
    );
  });
  page.on("console", (m) => {
    if (m.text().startsWith("[cspv]")) violations.push(`${page.url()} ${m.text()}`);
  });
  return violations;
}

test("no CSP violations on the public pages and a language switch", async ({ page }) => {
  test.slow(); // six full page loads that each wait for the network to go quiet
  const violations = await watchCsp(page);
  for (const path of ["/ar", "/en", "/ar/sign-in", "/ar/sign-up", "/en/forgot-password"]) {
    await page.goto(path, { waitUntil: "networkidle" });
  }
  await page.goto("/ar/sign-in", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: msg("ar", "common.localeSwitcher.label") }).click();
  await page.waitForURL(/\/en\/sign-in/);
  await page.waitForLoadState("networkidle");
  expect(violations).toEqual([]);
});

test.describe("signed in", () => {
  test.use({ storageState: TRAINEE_STATE });
  test("no CSP violations in the app shell, including client navigation", async ({ page }) => {
    test.slow();
    const violations = await watchCsp(page);
    await page.goto("/ar/dashboard", { waitUntil: "networkidle" });
    await page.goto("/ar/protocols", { waitUntil: "networkidle" });
    await page.goto("/en/simulations", { waitUntil: "networkidle" });
    expect(violations).toEqual([]);
  });
});
