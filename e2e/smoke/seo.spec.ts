import { BASE_URL, TRAINEE_STATE } from "../support/env";
import { expect, LOCALES, msg, test } from "../support/fixtures";

// Findability plumbing (PRODUCT 9, note 07 §2): robots.txt, sitemap, per-locale web manifest, icons, Open Graph
// tags and noindex on private pages. This server is not Railway "production", so robots.txt must block everything.

test("robots.txt outside production disallows everything", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  const text = await res.text();
  expect(text).toMatch(/User-Agent: \*/i);
  expect(text).toMatch(/^Disallow: \/$/m);
  expect(text).not.toMatch(/Sitemap:/i);
});

test("sitemap.xml lists only existing public pages, in both languages, with hreflang alternates", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("xml");
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toContain(`${BASE_URL}/ar`);
  expect(locs).toContain(`${BASE_URL}/en`);
  expect(xml).toContain(`hreflang="x-default" href="${BASE_URL}/ar"`);
  expect(xml).not.toMatch(/dashboard|sign-in|admin|api\//);
  // A sitemap never lists a page that does not exist (lib/seo.ts SITEMAP_PATHS).
  for (const loc of locs) {
    const page = await request.get(loc, { maxRedirects: 0 });
    expect(page.status(), loc).toBe(200);
  }
});

for (const locale of LOCALES) {
  test(`/${locale}/manifest.webmanifest: name, language, direction and icons`, async ({ request }) => {
    const res = await request.get(`/${locale}/manifest.webmanifest`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/manifest+json");
    const manifest = await res.json();
    expect(manifest).toMatchObject({
      name: msg(locale, "meta.title"),
      lang: locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      start_url: `/${locale}/dashboard`,
      display: "standalone",
    });
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    for (const icon of manifest.icons as Array<{ src: string; type: string }>) {
      const img = await request.get(icon.src);
      expect(img.status(), icon.src).toBe(200);
      expect(img.headers()["content-type"]).toBe(icon.type);
    }
  });
}

test("brand images and icons are served", async ({ request }) => {
  for (const [path, type] of [
    ["/og/ar.png", "image/png"],
    ["/og/en.png", "image/png"],
    ["/icon.svg", "image/svg+xml"],
    ["/apple-icon.png", "image/png"],
    ["/favicon.ico", "image/x-icon"],
  ] as const) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"], path).toContain(type);
  }
});

for (const locale of LOCALES) {
  test(`/${locale}: title, description, manifest, icons and Open Graph tags in the head`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const head = page.locator("head");
    await expect(page).toHaveTitle(`${msg(locale, "landing.meta.title")} | ${msg(locale, "meta.title")}`);
    await expect(head.locator('meta[name="description"]')).toHaveAttribute("content", msg(locale, "landing.meta.description"));
    await expect(head.locator('link[rel="manifest"]')).toHaveAttribute("href", `/${locale}/manifest.webmanifest`);
    await expect(head.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveCount(1);
    await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(head.locator('meta[property="og:image"]')).toHaveAttribute("content", `${BASE_URL}/og/${locale}.png`);
    await expect(head.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", msg(locale, "meta.ogAlt"));
    await expect(head.locator('meta[property="og:locale"]')).toHaveAttribute("content", locale === "ar" ? "ar_AR" : "en_US");
    await expect(head.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(head.locator('meta[name="robots"]')).toHaveCount(0); // public: indexable (robots.txt decides per environment)
    // canonical + hreflang tie /ar and /en together (lib/seo.ts publicPageMetadata).
    await expect(head.locator('link[rel="canonical"]')).toHaveAttribute("href", `${BASE_URL}/${locale}`);
    for (const alt of LOCALES) {
      await expect(head.locator(`link[rel="alternate"][hreflang="${alt}"]`)).toHaveAttribute("href", `${BASE_URL}/${alt}`);
    }
    await expect(head.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", `${BASE_URL}/ar`);
  });
}

test("sign-in pages: noindex, but links may be followed", async ({ page }) => {
  for (const locale of LOCALES) {
    await page.goto(`/${locale}/sign-in`);
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  }
});

test.describe("signed in", () => {
  test.use({ storageState: TRAINEE_STATE });
  test("app pages: noindex, nofollow", async ({ page }) => {
    await page.goto("/ar/dashboard");
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  });
});
