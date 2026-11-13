import { ChartColumnIcon, GraduationCapIcon, type LucideIcon, ScanLineIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SectionHeading } from "@/components/landing/section-heading";

// The three capabilities. Same icons as the app's sidebar (components/shell/nav.ts), so the page and the app match.
const ITEMS: ReadonlyArray<{ key: "simulation" | "scan" | "reports"; icon: LucideIcon }> = [
  { key: "simulation", icon: GraduationCapIcon },
  { key: "scan", icon: ScanLineIcon },
  { key: "reports", icon: ChartColumnIcon },
];

export async function Features() {
  const t = await getTranslations("landing.features");
  return (
    <section id="features" aria-labelledby="features-title">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <SectionHeading id="features-title" kicker={t("kicker")} title={t("title")} />
        <ul className="mt-10 grid gap-4 sm:gap-5 md:grid-cols-3">
          {ITEMS.map(({ key, icon: Icon }) => (
            <li
              key={key}
              className="flex flex-col rounded-2xl border bg-linear-to-b from-card to-[color-mix(in_oklab,var(--secondary)_55%,var(--card))] p-6 shadow-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="rounded-full border bg-background/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {t(`items.${key}.audience`)}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{t(`items.${key}.title`)}</h3>
              <p className="mt-2 text-[0.9375rem]/relaxed text-pretty text-muted-foreground">
                {t(`items.${key}.description`)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
