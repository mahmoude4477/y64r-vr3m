import { useFormatter, useTranslations } from "next-intl";
import type { RiskCounts } from "@/lib/admin/queries";
import { cn } from "@/lib/utils";

const SEGMENTS = [
  { key: "low", bar: "bg-risk-low" },
  { key: "medium", bar: "bg-risk-medium" },
  { key: "high", bar: "bg-risk-high" },
  { key: "notAssessable", bar: "bg-muted-foreground/40" },
] as const;

/**
 * One stacked bar per measure (simulations, scans) with a legend that carries the numbers as text, so the chart is
 * readable without colour and by screen readers (the bar itself is decorative).
 */
export function RiskDistribution({ attempts, scans }: { attempts: RiskCounts; scans: RiskCounts }) {
  const t = useTranslations("admin.overview.risk");
  const risk = useTranslations("common.risk");
  const format = useFormatter();

  if (attempts.total === 0 && scans.total === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  }

  const labelOf = (key: (typeof SEGMENTS)[number]["key"]) => (key === "notAssessable" ? t("notAssessable") : risk(key));

  return (
    <div className="flex flex-col gap-6">
      {(
        [
          ["attempts", attempts],
          ["scans", scans],
        ] as const
      ).map(([key, counts]) => (
        <section key={key} className="@container flex flex-col gap-2" aria-labelledby={`risk-${key}`}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 id={`risk-${key}`} className="text-sm font-medium">
              {t(key)}
            </h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("total", { n: format.number(counts.total, "integer") })}
            </span>
          </div>
          <div aria-hidden className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {counts.total > 0 &&
              SEGMENTS.map(({ key: s, bar }) =>
                counts[s] > 0 ? <div key={s} className={cn("h-full", bar)} style={{ width: `${(counts[s] / counts.total) * 100}%` }} /> : null,
              )}
          </div>
          {/* Label on one line, the figures under it: nothing is ever cut, whatever the card width or the numbers. */}
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm @lg:grid-cols-4">
            {SEGMENTS.map(({ key: s, bar }) => (
              <li key={s} className="flex min-w-0 items-start gap-2">
                <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", bar)} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-muted-foreground">{labelOf(s)}</span>
                  <span className="font-medium tabular-nums">
                    {t("segmentValue", {
                      n: format.number(counts[s], "integer"),
                      percent: format.number(counts.total ? counts[s] / counts.total : 0, "percent"),
                    })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
