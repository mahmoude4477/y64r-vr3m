import { ArrowRightIcon, ClockIcon, GraduationCapIcon, LayersIcon } from "lucide-react";
import type { Locale } from "next-intl";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/i18n-content";
import type { TrainingScenarios as TrainingScenariosData } from "@/lib/protocols/queries";

/** "Train on this": published scenarios of the protocol (or of its source, for a custom copy). */
export function TrainingScenarios({ data, locale }: { data: TrainingScenariosData; locale: Locale }) {
  const t = useTranslations("protocols.training");
  const td = useTranslations("common.difficulty");
  return (
    <section
      id="training"
      aria-labelledby="training-title"
      className="flex scroll-mt-20 flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5 print:hidden"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <GraduationCapIcon aria-hidden className="size-4.5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="training-title" className="text-base font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>
      {data.fromSource && <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">{t("fromSource")}</p>}
      {data.scenarios.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
          <Link href="/simulations" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            {t("browse")}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.scenarios.map((scenario) => (
            <li
              key={scenario.id}
              className="relative flex items-center gap-3 rounded-lg p-3 ring-1 ring-foreground/10 transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-accent/50 motion-reduce:transition-none"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <h3 className="text-sm leading-snug font-medium">
                  <Link
                    href={`/simulations/${scenario.slug}`}
                    className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
                  >
                    {pick(scenario, "title", locale)}
                  </Link>
                </h3>
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{pick(scenario, "intro", locale)}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant="outline">{td(scenario.difficulty)}</Badge>
                  <span className="flex items-center gap-1">
                    <ClockIcon aria-hidden className="size-3.5" />
                    {t("minutes", { count: scenario.estimatedMinutes })}
                  </span>
                  <span className="flex items-center gap-1">
                    <LayersIcon aria-hidden className="size-3.5" />
                    {t("stages", { count: scenario.stages })}
                  </span>
                  {scenario.own && <Badge variant="secondary">{t("own")}</Badge>}
                </div>
              </div>
              <ArrowRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
