import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { HeroVisual } from "@/components/landing/hero-visual";
import { CTA_CLASS, LINK_FOCUS_CLASS } from "@/components/landing/styles";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Headline sizes per language: the English line is longer, so it is set a step smaller.
const TITLE_SIZE = {
  ar: "text-[1.875rem]/[1.35] sm:text-[2.625rem]/[1.3] xl:text-[2.75rem]/[1.3]",
  en: "text-[1.75rem]/[1.25] tracking-tight sm:text-[2.375rem]/[1.2]",
} as const;

export async function Hero() {
  const locale = await getLocale();
  const t = await getTranslations("landing.hero");
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden border-b">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-background to-[color-mix(in_oklab,var(--secondary)_70%,var(--background))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -end-1/4 top-1/3 -z-10 aspect-square w-[70rem] max-w-[160vw] -translate-y-1/2 bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_16%,transparent),transparent)] lg:-end-1/5"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-14 sm:pt-14 sm:pb-16 lg:grid-cols-2 lg:gap-10 lg:py-20">
        <div className="flex flex-col items-start">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/80 px-3 py-1 text-sm font-medium text-accent-foreground shadow-xs">
            <span aria-hidden className="size-1.5 rounded-full bg-success ring-3 ring-success/20" />
            {t("eyebrow")}
          </p>
          <h1
            id="hero-title"
            className={cn("mt-5 font-bold text-balance", TITLE_SIZE[locale])}
          >
            <span className="block">{t("titleLead")}</span> <span className="block text-primary">{t("titleAccent")}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base/relaxed text-pretty text-muted-foreground sm:text-lg/relaxed">{t("description")}</p>
          {/* Phones: two full-width buttons, one under the other. */}
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Link href="/sign-up" className={cn(buttonVariants({ size: "lg" }), CTA_CLASS, "w-full shadow-sm sm:w-auto")}>
              {t("primaryCta")}
              <ArrowRightIcon className="size-4.5 rtl:rotate-180" aria-hidden />
            </Link>
            <a href="#how-it-works" className={cn(buttonVariants({ variant: "outline", size: "lg" }), CTA_CLASS, "w-full sm:w-auto")}>
              {t("secondaryCta")}
            </a>
          </div>
          {/* The site header shows "sign in" from sm only; on a phone it is offered here. A signed-in visitor who taps
              it goes on to the dashboard (sign-in is a guest-only page). */}
          <p className="mt-3 flex w-full flex-wrap items-center justify-center gap-x-1 text-sm text-muted-foreground sm:hidden">
            {t("haveAccount")}
            <Link
              href="/sign-in"
              className={cn(
                "inline-flex h-8 items-center rounded-md px-1 font-semibold text-primary underline underline-offset-4",
                LINK_FOCUS_CLASS,
              )}
            >
              {t("signIn")}
            </Link>
          </p>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground sm:mt-6">
            <ShieldCheckIcon className="size-4.5 shrink-0 text-primary" aria-hidden />
            <span>{t.rich("trust", { b: (chunks) => <b className="font-semibold text-foreground">{chunks}</b> })}</span>
          </p>
        </div>
        {/* Phones get the narrow proportion of the picture (hero-visual.tsx), at most 25rem wide so its type stays
            the size it was drawn for. */}
        <HeroVisual className="mx-auto max-w-[25rem] sm:max-w-xl lg:max-w-none" />
      </div>
    </section>
  );
}
