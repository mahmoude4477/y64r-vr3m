import { useFormatter, useTranslations } from "next-intl";
import { HIGH_RISK_BELOW, MEDIUM_RISK_BELOW } from "@/lib/scoring";
import { cn } from "@/lib/utils";

/**
 * A score 0..100 as text plus a thin bar (dataviz meter: the fill carries severity with the risk thresholds of
 * lib/scoring.ts, the track is a light step of the same color). The bar is decoration; the number is the value.
 * null = nothing scored: a dash with a screen-reader label.
 */
export function ScoreMeter({ score, className }: { score: number | null; className?: string }) {
  const t = useTranslations("reports.common");
  const common = useTranslations("common.score");
  const format = useFormatter();
  if (score === null) {
    return (
      <span className={cn("text-muted-foreground", className)}>
        <span aria-hidden>—</span>
        <span className="sr-only">{t("noScore")}</span>
      </span>
    );
  }
  const tone = score >= MEDIUM_RISK_BELOW ? "low" : score >= HIGH_RISK_BELOW ? "medium" : "high";
  return (
    <span className={cn("inline-flex min-w-28 items-center gap-2", className)}>
      <span className="w-10 shrink-0 font-medium tabular-nums">
        <bdi>{common("value", { score: format.number(score, "integer") })}</bdi>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-1.5 w-full min-w-12 overflow-hidden rounded-full",
          tone === "low" && "bg-risk-low/15",
          tone === "medium" && "bg-risk-medium/20",
          tone === "high" && "bg-risk-high/15",
        )}
      >
        <span
          className={cn(
            "absolute inset-y-0 start-0 rounded-full",
            tone === "low" && "bg-risk-low",
            tone === "medium" && "bg-risk-medium",
            tone === "high" && "bg-risk-high",
          )}
          style={{ width: `${Math.max(2, Math.min(100, score))}%` }}
        />
      </span>
    </span>
  );
}
