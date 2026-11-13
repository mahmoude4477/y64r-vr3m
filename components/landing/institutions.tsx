import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ContactLink } from "@/components/landing/contact-link";
import { DepartmentChart } from "@/components/landing/department-chart";
import { SectionHeading } from "@/components/landing/section-heading";
import { CTA_CLASS } from "@/components/landing/styles";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { institutionContact } from "@/lib/landing/contact";
import { cn } from "@/lib/utils";

const POINTS = ["byDepartment", "topMistakes", "membersAndRoles"] as const;

export async function Institutions() {
  const t = await getTranslations("landing.institutions");
  const l = await getTranslations("landing");
  // No address is shown until one is chosen (lib/landing/contact.ts); meanwhile institutions start with an account.
  const contact = institutionContact();
  const cta = cn(buttonVariants({ variant: "outline", size: "lg" }), CTA_CLASS);
  return (
    <section
      id="institutions"
      aria-labelledby="institutions-title"
      className="relative isolate border-t"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-[color-mix(in_oklab,var(--secondary)_40%,var(--background))] to-secondary"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading id="institutions-title" kicker={t("kicker")} title={t("title")} lead={t("lead")} />
          <ul className="mt-6 flex flex-col gap-3">
            {POINTS.map((key) => (
              <li key={key} className="flex items-start gap-3 text-[0.9375rem]/relaxed">
                <span
                  aria-hidden
                  className="mt-0.5 grid size-5.5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
                >
                  <CheckIcon className="size-3.5" strokeWidth={3} />
                </span>
                <span>{t(`points.${key}`)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            {contact ? (
              <ContactLink contact={contact} label={t("cta.contact")} newTabHint={l("opensInNewTab")} className={cta} />
            ) : (
              <>
                <Link href="/sign-up" className={cta}>
                  {/* The hero's label: one name for every sign-up link of the page. */}
                  {l("hero.primaryCta")}
                  <ArrowRightIcon className="size-4.5 rtl:rotate-180" aria-hidden />
                </Link>
                <p className="mt-3 text-sm text-muted-foreground">{t("cta.signUpNote")}</p>
              </>
            )}
          </div>
        </div>
        <DepartmentChart className="w-full max-w-xl justify-self-center lg:max-w-none" />
      </div>
    </section>
  );
}
