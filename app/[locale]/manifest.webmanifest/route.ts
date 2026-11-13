import { isAppLocale, routing } from "@/i18n/routing";
import { webManifest } from "@/lib/seo";

// /ar/manifest.webmanifest and /en/manifest.webmanifest (note 07 §2.6). app/manifest.ts is root-only, so one file
// could not carry a per-locale name, lang, dir and start_url; this route does. Prerendered at build (two files).
// The root layout links it (lib/seo.ts rootMetadata). The proxy matcher skips dotted paths, so next-intl never sees it.

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function GET(_request: Request, ctx: RouteContext<"/[locale]/manifest.webmanifest">) {
  const { locale } = await ctx.params;
  if (!isAppLocale(locale)) return new Response("Not found", { status: 404 });
  // Route handlers cannot use next/root-params: pass the locale explicitly (CONVENTIONS 3).
  return new Response(JSON.stringify(await webManifest(locale)), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
