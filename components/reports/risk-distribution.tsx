import { CircleMinusIcon, ShieldAlertIcon, ShieldCheckIcon, ShieldIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RISK_KEYS, type RiskCounts, riskPercents, riskTotal } from "@/lib/reports/aggregate";
import { cn } from "@/lib/utils";
import { TableFrame } from "./table-frame";

/**
 * Risk distribution as one stacked bar per source (part-to-whole) with the counts and shares in a table right under
 * it, so no value depends on color. Risk is a STATUS: it uses the risk tokens with an icon and a label, the same as
 * RiskBadge. Segments are separated by a 2px surface gap; the bars are decoration (aria-hidden).
 */

const SEGMENT: Record<(typeof RISK_KEYS)[number], string> = {
  low: "bg-risk-low",
  medium: "bg-risk-medium",
  high: "bg-risk-high",
  notAssessable: "bg-muted-foreground/35",
};

const ICON = { low: ShieldCheckIcon, medium: ShieldIcon, high: ShieldAlertIcon, notAssessable: CircleMinusIcon } as const;

export type RiskSource = { key: string; label: string; counts: RiskCounts };

function StackedBar({ counts }: { counts: RiskCounts }) {
  const percents = riskPercents(counts);
  const total = riskTotal(counts);
  if (total === 0) return <div aria-hidden className="h-3 w-full rounded-full bg-muted" />;
  return (
    <div aria-hidden className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full print:[print-color-adjust:exact]">
      {RISK_KEYS.filter((k) => counts[k] > 0).map((k) => (
        <span key={k} className={cn("h-full first:rounded-s-full last:rounded-e-full", SEGMENT[k])} style={{ flexGrow: percents[k] || 1, flexBasis: 0, minWidth: 4 }} />
      ))}
    </div>
  );
}

export function RiskDistribution({ sources }: { sources: readonly RiskSource[] }) {
  const t = useTranslations("reports.risk");
  const common = useTranslations("reports.common");
  const risk = useTranslations("common.risk");
  const score = useTranslations("common.score");
  const format = useFormatter();
  const label = (k: (typeof RISK_KEYS)[number]) => (k === "notAssessable" ? score("notAssessable") : risk(k));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        {sources.map((s) => (
          <div key={s.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{s.label}</span>
              <span className="text-muted-foreground tabular-nums">{t("total", { count: riskTotal(s.counts) })}</span>
            </div>
            <StackedBar counts={s.counts} />
          </div>
        ))}
      </div>
      <TableFrame label={t("tableCaption")}>
        <Table>
          <caption className="sr-only">{t("tableCaption")}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("level")}</TableHead>
              {sources.map((s) => (
                <TableHead key={s.key} scope="col" className="text-end">
                  {s.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {RISK_KEYS.map((k) => {
              const Icon = ICON[k];
              return (
                <TableRow key={k}>
                  <TableHead scope="row" className="font-normal whitespace-normal">
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full print:[print-color-adjust:exact]", SEGMENT[k])} />
                      <Icon aria-hidden className="size-4 text-muted-foreground" />
                      {label(k)}
                    </span>
                  </TableHead>
                  {sources.map((s) => {
                    const pct = riskPercents(s.counts)[k];
                    return (
                      <TableCell key={s.key} className="text-end tabular-nums">
                        {format.number(s.counts[k], "integer")}
                        <span className="block text-xs text-muted-foreground sm:ms-1.5 sm:inline">
                          <bdi>({common("percent", { value: format.number(pct, "integer") })})</bdi>
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>
    </div>
  );
}
