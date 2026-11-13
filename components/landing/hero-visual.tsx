import {
  ArrowRightIcon,
  Building2Icon,
  ChartColumnIcon,
  CheckIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  ScanLineIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { localeDir } from "@/i18n/routing";
import { SAMPLE_COUNTS, SAMPLE_TREND, SAMPLE_TREND_MONTHS, trendSummary } from "@/lib/landing/sample";
import { trendChart } from "@/lib/landing/trend-chart";
import { cn } from "@/lib/utils";

// The hero's product picture: the institution dashboard with a phone in front of it showing a simulation stage.
// Drawn with HTML/CSS/SVG (no raster image, nothing external) and server-rendered: no client JavaScript.
//
// Sizes are container-query units (cqw = 1 % of the picture's width), so the composition scales as one piece
// without layout shift. Two proportions of the same drawing (`@max-[28rem]:` = the narrow one):
// - wide (the picture is 28rem or more: tablets and desktops): dashboard with its rail, three figures and the trend,
//   the phone overlapping its reading-start side. Its smallest texts never go under 9 px (`max(…cqw, 0.5625rem)`):
//   at 1024 px the hero's two columns leave the picture only 476 px, where the phone's texts were 8.5 px;
// - narrow (phones; the hero caps the picture at 25rem there): larger type and a larger phone, so every text stays
//   readable (about 10.5 px and up at 390 px; the "sample data" tag never under 12 px). The phone then covers the
//   whole start half of the dashboard, so nothing is drawn there (no rail, one figure, no chart title, the last
//   months only): a text under the phone would peek out at its rounded corner as a stray glyph. The phone is taller
//   than the dashboard's content, so the dashboard keeps its own height (self-start) and the phone runs past its
//   bottom edge, as in the wide picture; stretched to the phone's height it ended in an empty strip.
// The phone is its own size container: its contents are sized in ITS cqw, so they grow with it. Its height comes
// from its aspect ratio, and it grows (overflow-clip, not hidden: the automatic minimum height applies) instead of
// cutting off its last button if a text ever runs longer.
//
// It is ONE image for assistive technology (role="img" + a label that says it is an illustration); its values are
// sample values (lib/landing/sample.ts) and it carries a visible "sample data" tag.

// The picture shows the dashboard, so the dashboard item is the active one. It sits high in the rail, above the
// phone (an item lower down would be hidden behind it).
const RAIL: ReadonlyArray<{ icon: LucideIcon; active?: boolean; brand?: boolean }> = [
  { icon: ShieldCheckIcon, brand: true },
  { icon: LayoutDashboardIcon, active: true },
  { icon: GraduationCapIcon },
  { icon: ScanLineIcon },
  { icon: ChartColumnIcon },
  { icon: Building2Icon },
];

const TREND_TARGET = 80; // the "low risk" band starts here (lib/scoring)

export async function HeroVisual({ className }: { className?: string }) {
  const locale = await getLocale();
  const t = await getTranslations("landing.visual");
  const c = await getTranslations("common");
  const format = await getFormatter();

  // The larger start inset keeps the oldest point and its month clear of the phone in the wide picture.
  const chart = trendChart(SAMPLE_TREND, {
    dir: localeDir[locale],
    min: 40,
    max: 100,
    ticks: [100, 80, 60, 40],
    height: 172,
    insetStart: 62,
  });
  const { latest, change } = trendSummary(SAMPLE_TREND);
  const months = SAMPLE_TREND_MONTHS.map((m) =>
    format.dateTime(new Date(Date.UTC(2026, m - 1, 15)), { month: "short", timeZone: "UTC", numberingSystem: "latn" }),
  );
  const lastPoint = chart.points.length - 1;

  // Start to end; the headline figure sits at the end, away from the phone. The narrow picture keeps only that one,
  // in its end column: there the phone covers the whole start half of the dashboard, and anything drawn under it
  // shows a sliver at the phone's rounded corner.
  const kpis = [
    {
      key: "simulations",
      label: t("dashboard.completedSimulations"),
      value: format.number(SAMPLE_COUNTS.completedSimulations, "integer"),
      wideOnly: true,
    },
    {
      key: "scans",
      label: t("dashboard.finalizedScans"),
      value: format.number(SAMPLE_COUNTS.finalizedScans, "integer"),
      wideOnly: true,
    },
    {
      key: "compliance",
      label: t("dashboard.compliance"),
      value: c("score.value", { score: String(latest) }),
      change: format.number(change, { signDisplay: "exceptZero", numberingSystem: "latn" }),
    },
  ];

  return (
    <div role="img" aria-label={t("label")} className={cn("@container relative w-full select-none", className)}>
      <div className="grid">
        {/* Institution dashboard */}
        <div className="col-start-1 row-start-1 ms-auto mb-[19cqw] grid w-[86%] grid-cols-[8.5cqw_minmax(0,1fr)] overflow-hidden rounded-[2.4cqw] border bg-card shadow-2xl shadow-black/10 @max-[28rem]:mb-0 @max-[28rem]:self-start @max-[28rem]:w-[90%] @max-[28rem]:grid-cols-1 @max-[28rem]:rounded-[3cqw] dark:shadow-black/50">
          <div className="flex flex-col items-center gap-[0.8cqw] border-e border-sidebar-border bg-sidebar py-[1.8cqw] @max-[28rem]:hidden">
            {RAIL.map(({ icon: Icon, active, brand }, i) => (
              <span
                key={i}
                className={cn(
                  "grid size-[5.6cqw] place-items-center rounded-[1.5cqw] text-muted-foreground",
                  active && "bg-sidebar-accent text-primary",
                  brand && "mb-[0.8cqw] text-primary",
                )}
              >
                <Icon className="size-[3cqw]" aria-hidden />
              </span>
            ))}
          </div>

          <div className="min-w-0">
            <div className="flex h-[7.8cqw] items-center gap-[1.6cqw] border-b px-[2.6cqw] @max-[28rem]:h-[11cqw] @max-[28rem]:gap-[2cqw] @max-[28rem]:px-[3.4cqw]">
              <span className="truncate text-[2.8cqw] font-semibold @max-[28rem]:text-[3.6cqw]">{t("dashboard.title")}</span>
              {/* The disclosure that the figures are not real: never smaller than 12 px. */}
              <span className="ms-auto shrink-0 rounded-full border border-dashed border-muted-foreground/40 px-[max(1.6cqw,0.5rem)] py-[0.35cqw] text-[max(1.85cqw,0.75rem)] leading-normal font-medium text-muted-foreground @max-[28rem]:py-[0.5cqw]">
                {t("sample")}
              </span>
            </div>

            <div className="flex flex-col gap-[1.6cqw] bg-background p-[2.4cqw] @max-[28rem]:gap-[2.6cqw] @max-[28rem]:p-[3.2cqw]">
              <div className="grid grid-cols-3 gap-[1.4cqw] @max-[28rem]:grid-cols-2 @max-[28rem]:gap-[2.4cqw]">
                {kpis.map((kpi) => (
                  <div
                    key={kpi.key}
                    className={cn(
                      "min-w-0 rounded-[1.8cqw] border bg-card px-[1.9cqw] py-[1.4cqw] @max-[28rem]:rounded-[2.4cqw] @max-[28rem]:px-[2.8cqw] @max-[28rem]:py-[2.4cqw]",
                      kpi.wideOnly ? "@max-[28rem]:hidden" : "@max-[28rem]:col-start-2",
                    )}
                  >
                    <div className="truncate text-[max(1.95cqw,0.5625rem)] text-muted-foreground @max-[28rem]:text-[3.15cqw]">{kpi.label}</div>
                    <div className="mt-[0.6cqw] flex items-center gap-[1cqw] text-[4.1cqw] leading-none font-bold tabular-nums @max-[28rem]:mt-[1cqw] @max-[28rem]:gap-[1.6cqw] @max-[28rem]:text-[6.8cqw]">
                      <span>{kpi.value}</span>
                      {kpi.change && (
                        <span
                          dir="ltr"
                          className="rounded-full bg-success/15 px-[1.1cqw] py-[0.35cqw] text-[max(1.85cqw,0.5625rem)] font-semibold text-[color-mix(in_oklab,var(--success),var(--foreground)_35%)] @max-[28rem]:px-[1.6cqw] @max-[28rem]:py-[0.5cqw] @max-[28rem]:text-[3.1cqw]"
                        >
                          {kpi.change}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.8cqw] border bg-card px-[2.2cqw] pt-[1.5cqw] pb-[0.6cqw] @max-[28rem]:rounded-[2.4cqw] @max-[28rem]:px-[2.6cqw] @max-[28rem]:pt-[2.4cqw] @max-[28rem]:pb-[1cqw]">
                <div className="flex items-center gap-[1.6cqw] @max-[28rem]:gap-[2.4cqw]">
                  {/* Under the phone in the narrow picture (its end would peek out beside it): not drawn there. */}
                  <span className="min-w-0 truncate text-[2.3cqw] font-semibold @max-[28rem]:hidden">{t("dashboard.trend")}</span>
                  {/* Legend of the dashed line, on the reading-end side (the phone covers the start side). */}
                  <span className="ms-auto flex shrink-0 items-center gap-[0.8cqw] text-[max(1.9cqw,0.5625rem)] text-muted-foreground @max-[28rem]:gap-[1.2cqw] @max-[28rem]:text-[3.15cqw]">
                    <span className="w-[2.8cqw] border-t-[0.35cqw] border-dashed border-risk-low @max-[28rem]:w-[4cqw] @max-[28rem]:border-t-[0.5cqw]" />
                    <span>{t("dashboard.target")}</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {c("score.value", { score: String(TREND_TARGET) })}
                    </span>
                  </span>
                </div>
                <svg
                  viewBox={`0 0 ${chart.width} ${chart.height}`}
                  className="mt-[0.6cqw] block h-auto w-full overflow-visible [direction:ltr] @max-[28rem]:mt-[1cqw]"
                  aria-hidden
                  focusable="false"
                >
                  <defs>
                    <linearGradient id="landing-trend-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" className="[stop-color:var(--chart-2)] [stop-opacity:0.28]" />
                      <stop offset="1" className="[stop-color:var(--chart-2)] [stop-opacity:0]" />
                    </linearGradient>
                  </defs>
                  {chart.ticks.map((tick) =>
                    tick.value === TREND_TARGET ? (
                      <line
                        key={tick.value}
                        x1={chart.gridFrom}
                        x2={chart.gridTo}
                        y1={tick.y}
                        y2={tick.y}
                        strokeDasharray="5 4"
                        className="stroke-risk-low [stroke-width:1.6] @max-[28rem]:[stroke-width:2.4]"
                      />
                    ) : (
                      <line
                        key={tick.value}
                        x1={chart.gridFrom}
                        x2={chart.gridTo}
                        y1={tick.y}
                        y2={tick.y}
                        className="stroke-border [stroke-width:1] @max-[28rem]:[stroke-width:1.5]"
                      />
                    ),
                  )}
                  <polygon points={chart.area} fill="url(#landing-trend-fill)" />
                  <polyline
                    points={chart.line}
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="stroke-chart-2 [stroke-width:3] @max-[28rem]:[stroke-width:4]"
                  />
                  {chart.points.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={i === lastPoint ? 5.5 : 3.5}
                      className={cn("fill-chart-2", i === lastPoint && "stroke-card")}
                      strokeWidth={i === lastPoint ? 2.5 : 0}
                    />
                  ))}
                  {months.map((month, i) => (
                    <text
                      key={i}
                      x={chart.points[i]?.x}
                      y={chart.labelY}
                      textAnchor="middle"
                      className={cn(
                        "fill-muted-foreground text-[14px] @max-[28rem]:text-[21px]",
                        // The narrow picture's phone covers the first half of the chart: only the last months show.
                        i < months.length - 3 && "@max-[28rem]:hidden",
                      )}
                    >
                      {month}
                    </text>
                  ))}
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Phone: one stage of a simulation. Its own size container: everything inside is in the phone's cqw. The
            bezel stays dark in both themes (a white frame outshone the headline in dark mode). */}
        <div className="@container col-start-1 row-start-1 flex aspect-[200/292] w-[33%] flex-col self-end justify-self-start overflow-clip rounded-[5.6cqw] border-[1.2cqw] border-(--bezel) bg-background shadow-2xl shadow-black/25 [--bezel:var(--foreground)] @max-[28rem]:mt-[12.4cqw] @max-[28rem]:w-[54%] @max-[28rem]:self-start @max-[28rem]:rounded-[8.6cqw] @max-[28rem]:border-[1.9cqw] dark:shadow-black/60 dark:ring-1 dark:ring-foreground/15 dark:[--bezel:color-mix(in_oklab,var(--sidebar),black_45%)]">
          <div className="flex h-[14cqw] shrink-0 items-center justify-between px-[8.5cqw] text-[max(5.8cqw,0.5625rem)] font-semibold">
            <span dir="ltr" className="tabular-nums">
              9:41
            </span>
            <span className="h-[7.3cqw] w-[27cqw] rounded-full bg-(--bezel)" />
            <span dir="ltr" className="flex items-end gap-[1.1cqw]">
              <span className="h-[2.7cqw] w-[1.7cqw] rounded-[0.6cqw] bg-foreground" />
              <span className="h-[4.1cqw] w-[1.7cqw] rounded-[0.6cqw] bg-foreground" />
              <span className="h-[5.5cqw] w-[1.7cqw] rounded-[0.6cqw] bg-foreground" />
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-[3.4cqw] px-[6.6cqw] pt-[1.8cqw] pb-[6.6cqw]">
            <div className="text-[max(6.4cqw,0.5625rem)] leading-snug font-semibold">{t("phone.scenario")}</div>
            <div className="flex items-center gap-[3.6cqw]">
              <div className="h-[2.7cqw] flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-3/4 rounded-full bg-primary" />
              </div>
              <span dir="ltr" className="text-[max(5.8cqw,0.5625rem)] leading-snug text-muted-foreground tabular-nums">
                3/4
              </span>
            </div>
            <div className="mt-[1.2cqw] text-[max(6.4cqw,0.5625rem)] leading-snug font-semibold">{t("phone.question")}</div>
            <div className="flex items-start gap-[3.6cqw] rounded-[4.8cqw] border border-primary bg-primary/10 p-[3.9cqw] text-[max(5.9cqw,0.5625rem)] leading-snug">
              <span className="mt-[0.3cqw] grid size-[7.9cqw] shrink-0 place-items-center rounded-[1.8cqw] bg-primary text-primary-foreground">
                <CheckIcon className="size-[6cqw]" strokeWidth={3} aria-hidden />
              </span>
              <span>{t("phone.correct")}</span>
            </div>
            <div className="flex items-start gap-[3.6cqw] rounded-[4.8cqw] border bg-card p-[3.9cqw] text-[max(5.9cqw,0.5625rem)] leading-snug">
              <span className="mt-[0.3cqw] size-[7.9cqw] shrink-0 rounded-[1.8cqw] border border-input bg-background" />
              <span>{t("phone.wrong")}</span>
            </div>
            <div className="mt-auto flex h-[15cqw] shrink-0 items-center justify-center gap-[2.4cqw] rounded-[4.2cqw] bg-primary text-[max(6.2cqw,0.5625rem)] font-semibold text-primary-foreground">
              {c("actions.next")}
              <ArrowRightIcon className="size-[6.6cqw] rtl:rotate-180" aria-hidden />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
