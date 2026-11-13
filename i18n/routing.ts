import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "always", // /ar/... and /en/...; "/" -> 307 -> "/ar"
  localeDetection: false, // Arabic stays the default even when the browser sends Accept-Language: en
  localeCookie: false, // never read while detection is off, so never set
  // No `Link:` hreflang header from the proxy: it used the visitor's host (incl. *.up.railway.app) and an
  // unprefixed x-default that redirects. hreflang comes from page metadata only (lib/seo.ts, note 07 §2.2).
  alternateLinks: false,
});

export type AppLocale = (typeof routing.locales)[number];

export const localeDir = { ar: "rtl", en: "ltr" } as const satisfies Record<AppLocale, "rtl" | "ltr">;

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (routing.locales as readonly string[]).includes(value);
}
