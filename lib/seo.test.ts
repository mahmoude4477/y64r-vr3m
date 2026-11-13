import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// getTranslations({ locale, namespace: "meta" }) reads the real message files, so these tests follow copy edits.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const file = path.join(import.meta.dirname, "..", "messages", locale, `${namespace}.json`);
    const json = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
    return (key: string) => json[key];
  },
}));

// next-intl/navigation does not load under vitest (it imports next/navigation without an extension). Same rule as
// routing.ts (localePrefix "always", no pathnames); the e2e SEO spec checks the real tags.
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) => `/${locale}${href === "/" ? "" : href}`,
}));

const {
  absoluteUrl,
  localeAlternates,
  noindex,
  publicPageMetadata,
  robotsRules,
  rootMetadata,
  siteUrl,
  PUBLIC_PATHS,
  sitemapEntries,
  webManifest,
} = await import("./seo");

afterEach(() => vi.unstubAllEnvs());

const BASE = new URL("https://waqaya.example");

describe("siteUrl", () => {
  it("comes from BETTER_AUTH_URL, with a localhost fallback", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://waqaya.example");
    expect(siteUrl().href).toBe("https://waqaya.example/");
    vi.stubEnv("BETTER_AUTH_URL", "not a url");
    expect(siteUrl().href).toBe("http://localhost:3000/");
    expect(absoluteUrl("/og/ar.png", BASE)).toBe("https://waqaya.example/og/ar.png");
  });
});

describe("localeAlternates", () => {
  it("canonical + ar/en + x-default (Arabic), locale-prefixed", () => {
    expect(localeAlternates("/", "en")).toEqual({
      canonical: "/en",
      languages: { ar: "/ar", en: "/en", "x-default": "/ar" },
    });
    expect(localeAlternates("/privacy", "ar")).toEqual({
      canonical: "/ar/privacy",
      languages: { ar: "/ar/privacy", en: "/en/privacy", "x-default": "/ar/privacy" },
    });
  });
});

describe("noindex", () => {
  it("defaults to noindex, nofollow", () => {
    expect(noindex()).toEqual({ robots: { index: false, follow: false } });
    expect(noindex({ follow: true })).toEqual({ robots: { index: false, follow: true } });
  });
});

describe("social metadata", () => {
  it("root metadata: title template, manifest, per-locale OG image with alt text", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://waqaya.example");
    const m = await rootMetadata("ar");
    expect(m.title).toEqual({ default: "وقاية", template: "%s | وقاية" });
    expect(m.manifest).toBe("/ar/manifest.webmanifest");
    expect(String(m.metadataBase)).toBe("https://waqaya.example/");
    const og = m.openGraph as { images: Array<{ url: string; width: number; height: number; alt: string }>; locale: string };
    expect(og.locale).toBe("ar_AR");
    expect(og.images[0]).toMatchObject({ url: "/og/ar.png", width: 1200, height: 630 });
    expect(og.images[0].alt.length).toBeGreaterThan(10);
    expect((m.twitter as { card: string }).card).toBe("summary_large_image");
  });

  it("a public page keeps its own title in OG/Twitter and gets its canonical", async () => {
    const m = await publicPageMetadata("/terms", "en", { title: "Terms of use", description: "The rules." });
    expect(m.title).toBe("Terms of use");
    expect(m.alternates?.canonical).toBe("/en/terms");
    expect(m.openGraph).toMatchObject({ title: "Terms of use", description: "The rules.", url: "/en/terms", locale: "en_US" });
    expect(m.twitter).toMatchObject({ title: "Terms of use" });
    expect((m.openGraph as { images: Array<{ url: string }> }).images[0].url).toBe("/og/en.png");
  });
});

describe("robotsRules", () => {
  it("production: allows public pages, blocks /api and every signed-in area in both locales, lists the sitemap", () => {
    const r = robotsRules({ indexable: true, base: BASE });
    const rule = (Array.isArray(r.rules) ? r.rules[0] : r.rules)!;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/api/", "/ar/dashboard", "/en/dashboard", "/ar/admin", "/en/invite"]));
    expect(rule.disallow).not.toEqual(expect.arrayContaining(["/ar/sign-in"]));
    expect(r.sitemap).toBe("https://waqaya.example/sitemap.xml");
  });

  it("anything else: disallow everything, no sitemap", () => {
    expect(robotsRules({ indexable: false, base: BASE })).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
  });
});

describe("sitemapEntries", () => {
  it("lists only the pages that exist today (the landing page) in both locales", () => {
    expect(sitemapEntries(BASE).map((e) => e.url)).toEqual(["https://waqaya.example/ar", "https://waqaya.example/en"]);
  });

  it("lists landing, privacy and terms in both locales with hreflang alternates once they exist", () => {
    const entries = sitemapEntries(BASE, PUBLIC_PATHS);
    expect(entries.map((e) => e.url)).toEqual([
      "https://waqaya.example/ar",
      "https://waqaya.example/en",
      "https://waqaya.example/ar/privacy",
      "https://waqaya.example/en/privacy",
      "https://waqaya.example/ar/terms",
      "https://waqaya.example/en/terms",
    ]);
    expect(entries[3].alternates?.languages).toEqual({
      ar: "https://waqaya.example/ar/privacy",
      en: "https://waqaya.example/en/privacy",
      "x-default": "https://waqaya.example/ar/privacy",
    });
    expect(entries.every((e) => !/dashboard|sign-|admin/.test(e.url))).toBe(true);
  });
});

describe("webManifest", () => {
  it("Arabic: «وقاية», rtl, Arabic start page; English: Waqaya, ltr", async () => {
    const ar = await webManifest("ar");
    expect(ar).toMatchObject({ name: "وقاية", short_name: "وقاية", lang: "ar", dir: "rtl", start_url: "/ar/dashboard" });
    expect(ar).toMatchObject({ id: "/", scope: "/", display: "standalone" });
    expect(ar.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    const en = await webManifest("en");
    expect(en).toMatchObject({ name: "Waqaya", lang: "en", dir: "ltr", start_url: "/en/dashboard" });
    expect(en.icons?.map((i) => i.purpose)).toEqual(["any", "any", "maskable"]);
  });
});
