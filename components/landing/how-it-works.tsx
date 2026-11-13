import { getFormatter, getTranslations } from "next-intl/server";
import { SectionHeading } from "@/components/landing/section-heading";

const STEPS = ["choose", "practice", "improve"] as const;

export async function HowItWorks() {
  const t = await getTranslations("landing.howItWorks");
  const format = await getFormatter();
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-16">
        <SectionHeading id="how-it-works-title" kicker={t("kicker")} title={t("title")} lead={t("lead")} />
        {/* role="list": Safari drops list semantics when list-style is none. The number is visual only: the list
            order already says it. */}
        <ol role="list" className="grid gap-8 sm:grid-cols-3 sm:gap-6 lg:pt-1">
          {STEPS.map((key, i) => (
            <li key={key} className="relative flex gap-4 sm:flex-col">
              {i < STEPS.length - 1 && (
                <>
                  <span
                    aria-hidden
                    className="absolute start-[calc(1.125rem-0.75px)] top-12 -bottom-5 border-s-[1.5px] border-dashed border-primary/45 sm:hidden"
                  />
                  <span
                    aria-hidden
                    className="absolute start-12 -end-4 top-[calc(1.125rem-0.75px)] hidden border-t-[1.5px] border-dashed border-primary/45 sm:block"
                  />
                </>
              )}
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums ring-4 ring-primary/15"
              >
                {format.number(i + 1, "integer")}
              </span>
              <div className="min-w-0 pt-1.5 sm:pt-0">
                <h3 className="text-lg font-semibold">{t(`steps.${key}.title`)}</h3>
                <p className="mt-2 text-[0.9375rem]/relaxed text-pretty text-muted-foreground">
                  {t(`steps.${key}.description`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
