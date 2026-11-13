import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ContactLink } from "@/components/landing/contact-link";
import { CTA_CLASS } from "@/components/landing/styles";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { institutionContact } from "@/lib/landing/contact";
import { cn } from "@/lib/utils";

/**
 * The closing band with the product's slogan. It is dark in both themes: the `dark` class scopes the dark theme
 * tokens to this band (globals.css defines them on `.dark`), so every colour still comes from the theme.
 */
export async function ClosingCta() {
  const t = await getTranslations("landing.closing");
  const l = await getTranslations("landing");
  const contact = institutionContact();
  return (
    <section
      aria-labelledby="closing-title"
      className="dark relative isolate overflow-hidden border-t bg-sidebar text-foreground"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_140%_at_8%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%),radial-gradient(40%_120%_at_100%_100%,color-mix(in_oklab,var(--chart-2)_14%,transparent),transparent_70%)] rtl:-scale-x-100"
      />
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-14 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 id="closing-title" className="text-2xl/snug font-bold text-balance sm:text-3xl/snug ltr:tracking-tight">
            {/* The slogan is two parallel halves: each starts its own line at every width (inline on phones, the
                first line ended on a dangling «إلى»; text-balance wraps each half on its own). */}
            <span className="block">{t("titleStart")}</span> <span className="block">{t("titleEnd")}</span>
          </h2>
          <p className="mt-3 text-base/relaxed text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
          <Link
            href="/sign-up"
            className={cn(buttonVariants({ size: "lg" }), CTA_CLASS, "bg-foreground text-background hover:bg-foreground/90")}
          >
            {/* One label for every sign-up link of the page (the hero's): same destination, same name. */}
            {l("hero.primaryCta")}
            <ArrowRightIcon className="size-4.5 rtl:rotate-180" aria-hidden />
          </Link>
          {contact && (
            <ContactLink
              contact={contact}
              label={t("contact")}
              newTabHint={l("opensInNewTab")}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), CTA_CLASS, "bg-transparent")}
            />
          )}
        </div>
      </div>
    </section>
  );
}
