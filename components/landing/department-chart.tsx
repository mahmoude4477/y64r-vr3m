import { PlayIcon, TargetIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Fragment } from "react";
import type { RiskLevel } from "@/lib/scoring";
import { departmentRisk, SAMPLE_DEPARTMENTS } from "@/lib/landing/sample";
import { cn } from "@/lib/utils";

const BAR: Record<RiskLevel, string> = {
  low: "bg-risk-low",
  medium: "bg-risk-medium",
  high: "bg-risk-high",
};

/**
 * Illustration of the institution report (compliance by department, the most frequent mistake and the scenario
 * suggested for it). Sample values (lib/landing/sample.ts), a visible "sample data" tag, and one image for
 * assistive technology, so nobody hears the numbers as real figures.
 */
export async function DepartmentChart({ className }: { className?: string }) {
  const t = await getTranslations("landing.institutions.chart");
  const v = await getTranslations("landing.visual");
  const c = await getTranslations("common");
  return (
    <div
      role="img"
      aria-label={t("label")}
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-2xl shadow-black/10 select-none sm:p-6 dark:shadow-black/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{t("title")}</span>
        <span className="shrink-0 rounded-full border border-dashed border-muted-foreground/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {v("sample")}
        </span>
      </div>

      {/* One grid for all rows: the label column is as wide as the longest department name (no "Internal medici…"
          on a phone), and every bar starts at the same place. */}
      <div className="mt-5 grid grid-cols-[max-content_minmax(0,1fr)_max-content] items-center gap-x-3 gap-y-3.5 text-sm sm:gap-x-4">
        {SAMPLE_DEPARTMENTS.map(({ key, score }) => (
          <Fragment key={key}>
            <span>{t(`departments.${key}`)}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-muted">
              <span className={cn("block h-full rounded-full", BAR[departmentRisk(score)])} style={{ width: `${score}%` }} />
            </span>
            <span className="min-w-[2.75rem] text-end font-semibold tabular-nums">
              {c("score.value", { score: String(score) })}
            </span>
          </Fragment>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 dark:bg-destructive/10">
        <TargetIcon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 text-sm">
          <div className="text-xs font-medium text-muted-foreground">{t("topMistakeLabel")}</div>
          <div className="mt-0.5 font-semibold">{t("topMistake")}</div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t("suggested")}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              <PlayIcon className="size-3 fill-current" aria-hidden />
              {t("scenario")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
