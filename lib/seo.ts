import type { Metadata, MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import { type AppLocale, localeDir, routing } from "@/i18n/routing";
import { BRAND_NAVY } from "@/lib/brand";
import { NO_CRAWL_PREFIXES } from "@/lib/routes";

// Site metadata helpers (note 07 §2). OWNER: implementer O (ops/SEO).
//
// Who calls what:
// - the root layout: rootMetadata(locale) (title template, metadataBase, manifest link, site-wide social tags);
// - a PUBLIC page (landing, privacy, terms) from its generateMetadata:
//     return publicPageMetadata("/privacy", locale, { title: t("privacy.title"), description: t("privacy.description") });
//   = its title/description + canonical + hreflang ar/en/x-default + matching Open Graph/Twitter tags and image;
// - any other page: `return { title: t("title") }` only. The (app)/(account) layouts already send PRIVATE_ROBOTS
//   and the (auth) layout AUTH_ROBOTS; spread noindex() into a page outside those groups that must stay out of
//   search results;
// - app/robots.ts, app/sitemap.ts and app/[locale]/manifest.webmanifest use robotsRules(), sitemapEntries() and
//   webManifest().
//
// Under cacheComponents, metadata of static pages is computed at BUILD time: BETTER_AUTH_URL must be the real
// public origin during `next build` (Railway passes service variables to the build). No team names anywhere
// (PRODUCT.md): all copy comes from messages/{ar,en}/meta.json.

/** Public origin of this environment (BETTER_AUTH_URL). Falls back to localhost when unset or invalid. */
export function siteUrl(): URL {
  try {
    return new URL(process.env.BETTER_AUTH_URL ?? "");
  } catch {
    return new URL("http://localhost:3000");
  }
}

/** Absolute URL on this site, e.g. absoluteUrl("/og/ar.png"). */
export function absoluteUrl(path: string, base: URL = siteUrl()): string {
  return new URL(path, base).href;
}

/** Indexable pages (no locale prefix). Only these get canonical + hreflang (publicPageMetadata). */
export const PUBLIC_PATHS = ["/", "/privacy", "/terms"] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];

/**
 * The public pages that EXIST today: only these go into sitemap.xml (a sitemap must never list a 404). The landing
 * team adds "/privacy" and "/terms" here in the same change that ships those pages (e2e/smoke/seo.spec.ts checks
 * that every sitemap URL answers 200).
 */
export const SITEMAP_PATHS: readonly PublicPath[] = ["/"];

/** Signed-in pages: (app) and (account) layouts. */
export const PRIVATE_ROBOTS = { index: false, follow: false } as const satisfies Metadata["robots"];
/** Sign-in, sign-up, password reset: never in search results, but crawlers may follow their links. */
export const AUTH_ROBOTS = { index: false, follow: true } as const satisfies Metadata["robots"];

/** `robots` metadata for one page that must stay out of search results: `{ title, ...noindex() }`. */
export function noindex({ follow = false }: { follow?: boolean } = {}): Pick<Metadata, "robots"> {
  return { robots: follow ? AUTH_ROBOTS : PRIVATE_ROBOTS };
}

/** /ar, /ar/privacy, /en/terms … (routing.localePrefix "always"). */
export function localePath(href: PublicPath, locale: AppLocale): string {
  return getPathname({ href, locale });
}

/**
 * canonical + hreflang ar/en + x-default (Arabic). Relative paths: metadataBase makes them absolute.
 * Never set this in a layout: children inherit `alternates`, so every page below would claim the same canonical.
 */
export function localeAlternates(href: PublicPath, locale: AppLocale): NonNullable<Metadata["alternates"]> {
  return {
    canonical: localePath(href, locale),
    languages: {
      ar: localePath(href, "ar"),
      en: localePath(href, "en"),
      "x-default": localePath(href, routing.defaultLocale),
    },
  };
}

const OG_LOCALE = { ar: "ar_AR", en: "en_US" } as const satisfies Record<AppLocale, string>;

/** Size and type of the per-locale Open Graph image public/og/<locale>.png (`pnpm brand:assets`). */
export const OG_IMAGE = { width: 1200, height: 630, type: "image/png" } as const;
export const ogImagePath = (locale: AppLocale) => `/og/${locale}.png`;

/**
 * openGraph + twitter, with the per-locale image. A child segment that sets either one REPLACES it (no deep merge),
 * so always build both here.
 */
export async function socialMetadata(
  locale: AppLocale,
  page: { title?: string; description?: string; url?: string } = {},
): Promise<Pick<Metadata, "openGraph" | "twitter">> {
  const t = await getTranslations({ locale, namespace: "meta" });
  const title = page.title ?? t("title");
  const description = page.description ?? t("description");
  const image = { url: ogImagePath(locale), alt: t("ogAlt"), ...OG_IMAGE };
  return {
    openGraph: {
      type: "website",
      siteName: t("title"),
      title,
      description,
      url: page.url,
      locale: OG_LOCALE[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/** Root layout: title template, metadataBase, manifest link, site-wide social defaults. */
export async function rootMetadata(locale: AppLocale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: siteUrl(),
    title: { default: t("title"), template: `%s | ${t("title")}` },
    description: t("description"),
    applicationName: t("title"),
    // Per-locale manifest (name, lang, dir, start_url): app/[locale]/manifest.webmanifest/route.ts.
    manifest: `/${locale}/manifest.webmanifest`,
    formatDetection: { telephone: false, email: false, address: false },
    appleWebApp: { capable: true, title: t("title"), statusBarStyle: "default" },
    ...(await socialMetadata(locale)),
  };
}

/** A public page: its own title/description, canonical + hreflang, and matching social tags. */
export async function publicPageMetadata(
  href: PublicPath,
  locale: AppLocale,
  page: { title?: string; description?: string } = {},
): Promise<Metadata> {
  const alternates = localeAlternates(href, locale);
  return {
    ...page,
    alternates,
    ...(await socialMetadata(locale, { ...page, url: alternates.canonical as string })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// robots.txt, sitemap.xml, web manifest

/**
 * robots.txt. Indexable (Railway production): everything but /api and the signed-in areas (/ar/dashboard,
 * /en/scans, …), plus the sitemap. Sign-in/sign-up stay crawlable on purpose: crawlers must fetch them to see their
 * noindex. Anything else (staging, local, CI): disallow everything; lib/security-headers.ts also sends
 * X-Robots-Tag: noindex there.
 */
export function robotsRules({ indexable, base }: { indexable: boolean; base: URL }): MetadataRoute.Robots {
  if (!indexable) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const appPaths = NO_CRAWL_PREFIXES.flatMap((prefix) => routing.locales.map((locale) => `/${locale}${prefix}`));
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", ...appPaths] }],
    sitemap: absoluteUrl("/sitemap.xml", base),
  };
}

/** One sitemap entry per existing public page (SITEMAP_PATHS) and locale, each with its hreflang alternates. */
export function sitemapEntries(base: URL, paths: readonly PublicPath[] = SITEMAP_PATHS): MetadataRoute.Sitemap {
  const abs = (href: PublicPath, locale: AppLocale) => absoluteUrl(localePath(href, locale), base);
  return paths.flatMap((href) =>
    routing.locales.map((locale) => ({
      url: abs(href, locale),
      changeFrequency: "monthly" as const,
      priority: href === "/" ? 1 : 0.3,
      alternates: {
        languages: { ar: abs(href, "ar"), en: abs(href, "en"), "x-default": abs(href, routing.defaultLocale) },
      },
    })),
  );
}

/** Icons listed in the web manifest (public/icons, generated by `pnpm brand:assets`). */
export const MANIFEST_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
] satisfies MetadataRoute.Manifest["icons"];

/**
 * The web manifest of one locale («وقاية» rtl / Waqaya ltr), served at /<locale>/manifest.webmanifest so the
 * installed app's name, lang, dir and start page follow the page it was added from.
 * - One app for both languages: same `id` and `scope` "/" (switching language inside the installed app stays in it);
 *   start_url is the dashboard (signed-out users go through sign-in and come back).
 * - Colours: deck navy (lib/brand.ts) for the splash screen and title bar, the same navy as the icons; once a page
 *   loads, its own media-aware <meta name="theme-color"> (light/dark page background) takes over.
 */
export async function webManifest(locale: AppLocale): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    id: "/",
    name: t("title"),
    short_name: t("title"),
    description: t("description"),
    lang: locale,
    dir: localeDir[locale],
    start_url: `/${locale}/dashboard`,
    scope: "/",
    display: "standalone",
    background_color: BRAND_NAVY,
    theme_color: BRAND_NAVY,
    categories: ["medical", "education", "productivity"],
    icons: MANIFEST_ICONS,
  };
}
