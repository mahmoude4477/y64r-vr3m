import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Providers } from "@/components/providers";
import { clientMessages } from "@/i18n/client-messages";
import { localeDir, routing } from "@/i18n/routing";
import { THEME_COLOR } from "@/lib/brand";
import { fontVariables } from "@/lib/fonts";
import { rootMetadata } from "@/lib/seo";
import "../globals.css";

// This is the ROOT layout (there is no app/layout.tsx): next/root-params needs [locale] at the root.
//
// CSP (note 07, option b): a static policy from next.config.ts headers(), no per-request nonce. Nothing to read
// here, and this layout must stay free of request reads (headers(), cookies()) so every page keeps its static
// shell. Never add a nonce/hash next to 'unsafe-inline' in script-src.

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale })); // required by cacheComponents
}

// Site metadata lives in lib/seo.ts (owner O): title template, metadataBase, manifest, social defaults.
export async function generateMetadata(): Promise<Metadata> {
  return rootMetadata(await getLocale());
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await getLocale(); // from next/root-params in i18n/request.ts, never headers()
  const dir = localeDir[locale];
  const t = await getTranslations("common");
  return (
    <html lang={locale} dir={dir} className={`${fontVariables} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-background font-sans text-foreground">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          {t("skipToContent")}
        </a>
        {/* Shared namespaces only; (auth), (account) and (app) add theirs (i18n/client-messages.ts). */}
        <NextIntlClientProvider messages={await clientMessages()}>
          <Providers dir={dir}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
