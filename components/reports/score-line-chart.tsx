"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

/**
 * Score (0..100 %) over time as lines, one per series (dataviz: 2px lines, >= 8px dots with a surface ring, solid
 * hairline grid, one y-axis, a legend for 2+ series). Colors are the theme's chart tokens (validated order:
 * chart-1, chart-3, chart-5 keep adjacent CVD distance >= 20). Recharts does not mirror for RTL: the x-axis is
 * reversed and the y-axis moves to the right in Arabic. A data table twin is rendered next to it by the caller
 * (ChartDataTable), so the tooltip never gates a value.
 */

export type ScoreSeries = { key: string; label: string; color: "chart-1" | "chart-3" | "chart-5"; emphasis?: boolean };
export type ScoreDatum = { label: string; tooltipLabel?: string } & Record<string, number | null | string | undefined>;

type TooltipItem = { dataKey?: unknown; value?: unknown; color?: string; payload?: ScoreDatum };

function ScoreTooltip({
  active,
  payload,
  series,
}: {
  active?: boolean;
  payload?: readonly TooltipItem[];
  series: readonly ScoreSeries[];
}) {
  const t = useTranslations("common.score");
  const format = useFormatter();
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  return (
    <div className="grid min-w-36 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{datum?.tooltipLabel ?? datum?.label}</div>
      {series.map((s) => {
        const item = payload.find((p) => p.dataKey === s.key);
        const value = typeof item?.value === "number" ? item.value : null;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: `var(--${s.color})` }} />
            <span className="me-auto text-muted-foreground">{s.label}</span>
            <span className="font-medium text-foreground tabular-nums">
              {value === null ? "—" : t("value", { score: format.number(value, "integer") })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ScoreLineChart({
  data,
  series,
  label,
  className,
}: {
  data: readonly ScoreDatum[];
  series: readonly ScoreSeries[];
  /** The chart's accessible name (the keyboard stop of accessibilityLayer is an unnamed application otherwise). */
  label: string;
  className?: string;
}) {
  const locale = useLocale();
  const rtl = locale === "ar";
  const format = useFormatter();
  const t = useTranslations("reports.common");
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: `var(--${s.color})` }])) satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className={cn(
        "aspect-auto h-64 w-full sm:h-72",
        // The accessibilityLayer surface is a keyboard stop (arrow keys walk the points): show where focus is. The
        // container hides the surface's outline; this rule is more specific, and sets the style the hidden one cleared.
        "[&_.recharts-surface:focus-visible]:rounded-md [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-offset-2 [&_.recharts-surface:focus-visible]:outline-ring [&_.recharts-surface:focus-visible]:outline-solid",
        className,
      )}
    >
      <LineChart accessibilityLayer aria-label={label} data={[...data]} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          reversed={rtl}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          // Always let Recharts thin the labels by their measured width (a forced interval of 0 drew every label and
          // ignored minTickGap: the dates ran into each other on a phone). The first and last dates always show.
          interval="preserveStartEnd"
          minTickGap={20}
          // Room at both ends, so the first and last date labels are not cut off on a phone.
          padding={{ left: 28, right: 28 }}
        />
        <YAxis
          orientation={rtl ? "right" : "left"}
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => t("percent", { value: format.number(v, "integer") })}
        />
        <ChartTooltip cursor content={<ScoreTooltip series={series} />} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.key}
            type="monotone"
            stroke={`var(--color-${s.key})`}
            strokeWidth={s.emphasis ? 2.5 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            connectNulls={false}
            dot={{ r: 4, fill: `var(--color-${s.key})`, stroke: "var(--card)", strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
