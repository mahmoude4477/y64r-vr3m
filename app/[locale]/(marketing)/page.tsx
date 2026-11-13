import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ClosingCta } from "@/components/landing/closing-cta";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Institutions } from "@/components/landing/institutions";
import { publicPageMetadata } from "@/lib/seo";

// The public landing page (/ar, /en). OWNER: landing team (components/landing/**, lib/landing/**,
// messages/{ar,en}/landing.json, e2e/landing/**).
//
// A concise SaaS page (2026-10-28): headline + value, product picture, the three capabilities, how it works,
// a short part for institutions and a closing call to action. No deck tables, statistics, award line or team names
// (PRODUCT.md). Fully static: no request data and no client components of its own (the header's language and theme
// controls are the only client code). The footer (with the educational disclaimer) comes from the (marketing) layout.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("landing.meta");
  const brand = (await getTranslations("meta"))("title");
  const title = t("title");
  const metadata = await publicPageMetadata("/", locale, { title, description: t("description") });
  // Share cards (WhatsApp, X…) take og:title / twitter:title, which socialMetadata sets to the bare page title. The
  // home page is the most shared URL, so its cards carry the product name too: the same text as the document title
  // (the root layout's template "%s | <brand>").
  const shareTitle = `${title} | ${brand}`;
  return {
    ...metadata,
    openGraph: { ...metadata.openGraph, title: shareTitle },
    twitter: { ...metadata.twitter, title: shareTitle },
  };
}

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <Institutions />
      <ClosingCta />
    </>
  );
}
