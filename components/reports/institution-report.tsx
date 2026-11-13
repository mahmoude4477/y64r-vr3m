import { BarChart3Icon, ChevronDownIcon, FilterXIcon, GraduationCapIcon, PrinterIcon, ScanLineIcon } from "lucide-react";
import type { Locale } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { GapCriticalBadge } from "./badges";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { isOrgManager } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { riskPercents, riskTotal } from "@/lib/reports/aggregate";
import { type ReportFilters, filtersToQuery, queryString, type SearchParamsRecord } from "@/lib/reports/filters";
import {
  type BreakdownRow,
  complianceByDepartment,
  complianceByProtocol,
  complianceTrend,
  type DepartmentKey,
  type FilterOptions,
  type GapItem,
  type InstitutionSummary,
  type ProtocolMeta,
  topGaps,
} from "@/lib/reports/institution";
import type { InstitutionScope } from "@/lib/reports/scope";
import { TRAINEE_PAGE_SIZE, traineeProgress } from "@/lib/reports/trainees";
import { cn } from "@/lib/utils";
import { ChartDataTable } from "./chart-data-table";
import { ReportPendingArea } from "./filters-bar";
import { bucketLabels, dayDate } from "./format";
import { Pager } from "./pager";
import { ExportMenu } from "./report-actions";
import { ReportCard, StatGrid, StatTile } from "./report-card";
import { RiskDistribution } from "./risk-distribution";
import { ScoreLineChart } from "./score-line-chart";
import { ScoreMeter } from "./score-meter";
import { ScrollToHash } from "./scroll-to-hash";
import { CardSkeleton } from "./skeletons";
import { TableFrame } from "./table-frame";
import { RiskBadge, ScoreBadge } from "@/components/shared/status-badges";

/** The section the dashboard's "trainee progress" link and the trainee page's back link open (/reports#…). */
export const TRAINEES_ANCHOR = "report-trainees";
/** Gaps shown at once on /reports; the rest of the list opens on demand (the print view shows them all). */
const GAPS_SHOWN = 5;

/**
 * The institution report (/reports for staff, and the print view). Every section is its own Suspense boundary, so
 * the page streams section by section; all of them read the same filters and the same lib/reports queries.
 */

type Props = { inst: InstitutionScope; filters: ReportFilters; locale: Locale };

/** Opening line under the filters: the period in words (also what the print view puts in its header). */
export async function PeriodSummary({ filters }: { filters: ReportFilters }) {
  const t = await getTranslations("reports.filters");
  const format = await getFormatter();
  return (
    <p className="text-sm text-muted-foreground">
      {t("summary", {
        from: format.dateTime(dayDate(filters.from), "date"),
        to: format.dateTime(dayDate(filters.to), "date"),
        period: t(filters.granularity),
      })}
    </p>
  );
}

export async function InstitutionKpis({ summary }: { summary: InstitutionSummary }) {
  const t = await getTranslations("reports.kpi");
  const common = await getTranslations("reports.common");
  const score = await getTranslations("common.score");
  const format = await getFormatter();
  const pct = (v: number | null) => (v === null ? null : score("value", { score: format.number(v, "integer") }));
  const high = summary.combined.risk.high;
  const highShare = riskTotal(summary.combined.risk) > 0 ? riskPercents(summary.combined.risk).high : 0;
  const noScore = (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">{common("noScore")}</span>
    </>
  );
  return (
    <StatGrid label={t("label")}>
      <StatTile
        label={t("overall")}
        value={pct(summary.combined.average) ?? noScore}
        hint={t("results", { count: summary.combined.n })}
      />
      <StatTile
        label={t("scans")}
        value={format.number(summary.scans.n, "integer")}
        hint={summary.scans.average === null ? t("noAverage") : t("average", { score: pct(summary.scans.average) ?? "" })}
      />
      <StatTile
        label={t("simulations")}
        value={format.number(summary.simulations.n, "integer")}
        hint={
          summary.simulations.average === null
            ? t("noAverage")
            : t("averageAndTrainees", { score: pct(summary.simulations.average) ?? "", count: summary.simulations.people })
        }
      />
      <StatTile
        label={t("highRisk")}
        value={format.number(high, "integer")}
        hint={t("share", { value: common("percent", { value: format.number(highShare, "integer") }) })}
      />
    </StatGrid>
  );
}

async function TrendSection({ inst, filters }: Props) {
  const t = await getTranslations("reports.trend");
  const format = await getFormatter();
  const points = await complianceTrend(inst, filters);
  const labelled = points.map((p) => ({ ...p, ...bucketLabels(p.bucket, filters.granularity, format, (date) => t("weekOf", { date })) }));
  const series = [
    { key: "combined", label: t("combined"), color: "chart-1", emphasis: true },
    { key: "scans", label: t("scans"), color: "chart-3" },
    { key: "simulations", label: t("simulations"), color: "chart-5" },
  ] as const;
  const score = await getTranslations("common.score");
  const scorePct = (v: number | null) => (v === null ? "—" : score("value", { score: format.number(v, "integer") }));
  return (
    <ReportCard id="report-trend" title={t("title")} description={t("description")}>
      <figure className="m-0">
        <figcaption className="sr-only">{t("chartLabel")}</figcaption>
        <div className="print:hidden">
          <ScoreLineChart
            label={t("chartLabel")}
            series={series}
            data={labelled.map((p) => ({
              label: p.label,
              tooltipLabel: p.tooltipLabel,
              combined: p.combined,
              scans: p.scans,
              simulations: p.simulations,
            }))}
          />
        </div>
      </figure>
      <ChartDataTable
        summary={t("showTable")}
        caption={t("tableCaption")}
        columns={[t("columns.period"), t("columns.combined"), t("columns.scans"), t("columns.simulations")]}
        rows={labelled.map((p) => ({
          key: p.bucket,
          cells: [
            p.tooltipLabel,
            scorePct(p.combined),
            p.scanCount ? t("cell", { score: scorePct(p.scans), count: format.number(p.scanCount, "integer") }) : "—",
            p.simulationCount ? t("cell", { score: scorePct(p.simulations), count: format.number(p.simulationCount, "integer") }) : "—",
          ],
        }))}
      />
    </ReportCard>
  );
}

export async function RiskSection({ summary }: { summary: InstitutionSummary }) {
  const t = await getTranslations("reports.risk");
  return (
    <ReportCard id="report-risk" title={t("title")} description={t("description")}>
      <RiskDistribution
        sources={[
          { key: "scans", label: t("scans"), counts: summary.scans.risk },
          { key: "simulations", label: t("simulations"), counts: summary.simulations.risk },
        ]}
      />
    </ReportCard>
  );
}

async function GapItems({ gaps, locale, first }: { gaps: readonly GapItem[]; locale: Locale; first: number }) {
  const t = await getTranslations("reports.gaps");
  const common = await getTranslations("reports.common");
  const format = await getFormatter();
  const nowrap = (chunks: React.ReactNode) => <span className="whitespace-nowrap">{chunks}</span>;
  return (
    <ol start={first} className="flex flex-col divide-y">
      {gaps.map((gap, index) => (
        <li key={gap.stepId} className="flex gap-3 py-3 first:pt-0 last:pb-0 print:break-inside-avoid">
          <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
            {format.number(first + index, "integer")}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="font-medium text-pretty">{pick(gap.step, "text", locale)}</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ProtocolIcon name={gap.step.protocol.icon} className="size-3.5" />
                {pick(gap.step.protocol, "title", locale)}
              </span>
              <GapCriticalBadge criticalStep={gap.step.isCritical} criticalViolations={gap.criticalChoices} />
            </p>
            <p className="text-sm">
              {t("missed", {
                violated: format.number(gap.violated, "integer"),
                assessed: format.number(gap.assessed, "integer"),
                rate: common("percent", { value: format.number(Math.round(gap.rate * 100), "integer") }),
              })}
              <span className="text-muted-foreground">
                {" · "}
                {t.rich("sources", {
                  scans: format.number(gap.scanViolations, "integer"),
                  simulations: format.number(gap.simulationViolations, "integer"),
                  pair: nowrap,
                })}
              </span>
            </p>
            {gap.scenario ? (
              <p className="text-sm">
                <span className="text-muted-foreground">{t("train")} </span>
                <Link
                  href={`/simulations/${gap.scenario.slug}`}
                  className="inline-flex min-h-8 items-center font-medium text-primary underline-offset-4 hover:underline"
                >
                  {pick(gap.scenario, "title", locale)}
                </Link>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noScenario")}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The gaps, most violated first. With `shown`, only the first ones are listed and the rest open in a disclosure
 * (a long list beside the short risk card left most of that card blank); the print view lists them all.
 */
export async function GapList({ gaps, locale, shown }: { gaps: readonly GapItem[]; locale: Locale; shown?: number }) {
  const t = await getTranslations("reports.gaps");
  if (!shown || gaps.length <= shown) return <GapItems gaps={gaps} locale={locale} first={1} />;
  const rest = gaps.slice(shown);
  return (
    <div className="flex flex-col">
      <GapItems gaps={gaps.slice(0, shown)} locale={locale} first={1} />
      <details className="group mt-3 rounded-lg border">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none select-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <ChevronDownIcon aria-hidden className="size-4 transition-transform group-open:rotate-180" />
          {t("showMore", { count: rest.length })}
        </summary>
        <div className="border-t px-3 pt-3 pb-1">
          <GapItems gaps={rest} locale={locale} first={shown + 1} />
        </div>
      </details>
    </div>
  );
}

async function GapsSection({ inst, filters, locale }: Props) {
  const t = await getTranslations("reports.gaps");
  const gaps = await topGaps(inst, filters);
  return (
    <ReportCard id="report-gaps" title={t("title")} description={t("description")}>
      {gaps.length === 0 ? <p className="text-sm text-muted-foreground">{t("none")}</p> : <GapList gaps={gaps} locale={locale} shown={GAPS_SHOWN} />}
    </ReportCard>
  );
}

async function BreakdownTable<K>({
  rows,
  caption,
  firstColumn,
  renderKey,
}: {
  rows: ReadonlyArray<BreakdownRow<K>>;
  caption: string;
  firstColumn: string;
  renderKey: (row: BreakdownRow<K>) => React.ReactNode;
}) {
  const t = await getTranslations("reports.breakdown");
  const format = await getFormatter();
  const score = await getTranslations("common.score");
  const avg = (v: number | null) => (v === null ? "—" : score("value", { score: format.number(v, "integer") }));
  const source = (s: BreakdownRow<K>["scans"]) => (s.n ? t("cell", { count: format.number(s.n, "integer"), score: avg(s.average) }) : "—");
  // "Scans" with what its "3 · 78%" cells are (count · average) on a second, smaller line: as one line the header
  // made the column far wider than its numbers and left the names too little room.
  const sourceLabel = (key: "scans" | "simulations", unitClass?: string) => (
    <>
      {t(key)}{" "}
      <span className={cn("block", unitClass)}>{t("countAverage")}</span>
    </>
  );
  return (
    <>
      {/* Until the card is wide enough for the table (about 36rem): one block per row. The labels say what the
          "3 · 78%" pair is (count · average), as the table's column headers do. The values line up at the bottom
          (a two-line label next to a one-line one). */}
      <ul aria-label={caption} className="flex flex-col divide-y @2xl:hidden print:hidden">
        {rows.map((row, i) => (
          <li key={i} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="text-sm font-medium">{renderKey(row)}</div>
            <ScoreMeter score={row.combined.average} />
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex min-w-0 flex-col">
                <dt className="text-muted-foreground">{sourceLabel("scans")}</dt>
                <dd className="mt-auto tabular-nums">{source(row.scans)}</dd>
              </div>
              <div className="flex min-w-0 flex-col">
                <dt className="text-muted-foreground">{sourceLabel("simulations")}</dt>
                <dd className="mt-auto tabular-nums">{source(row.simulations)}</dd>
              </div>
              <div className="flex min-w-0 flex-col">
                <dt className="text-muted-foreground">{t("highRisk")}</dt>
                <dd className="mt-auto tabular-nums">{format.number(row.scans.risk.high + row.simulations.risk.high, "integer")}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <TableFrame label={caption} className="hidden @2xl:block print:block">
        <Table className="min-w-[36rem] print:min-w-0">
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{firstColumn}</TableHead>
              <TableHead scope="col">{t("combined")}</TableHead>
              {/* The number columns take only the width they need (w-px); the rest goes to the names. */}
              <TableHead scope="col" className="h-auto w-px py-2 text-end">
                {sourceLabel("scans", "text-xs font-normal text-muted-foreground")}
              </TableHead>
              <TableHead scope="col" className="h-auto w-px py-2 text-end">
                {sourceLabel("simulations", "text-xs font-normal text-muted-foreground")}
              </TableHead>
              <TableHead scope="col" className="w-px text-end">
                {t("highRisk")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableHead scope="row" className="font-normal whitespace-normal">
                  {/* A floor for the name (it wrapped to three lines on a tablet), and a cap on a wide screen. */}
                  <div className="max-w-64 min-w-40">{renderKey(row)}</div>
                </TableHead>
                <TableCell>
                  <ScoreMeter score={row.combined.average} />
                </TableCell>
                <TableCell className="text-end tabular-nums">{source(row.scans)}</TableCell>
                <TableCell className="text-end tabular-nums">{source(row.simulations)}</TableCell>
                <TableCell className="text-end tabular-nums">{format.number(row.scans.risk.high + row.simulations.risk.high, "integer")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </>
  );
}

export async function ProtocolTable({ rows, locale }: { rows: ReadonlyArray<BreakdownRow<ProtocolMeta>>; locale: Locale }) {
  const t = await getTranslations("reports.byProtocol");
  return (
    <BreakdownTable
      rows={rows}
      caption={t("tableCaption")}
      firstColumn={t("protocol")}
      renderKey={(row) => (
        <Link href={`/protocols/${row.key.slug}`} className="inline-flex min-h-8 items-center gap-2 underline-offset-4 hover:underline">
          <ProtocolIcon name={row.key.icon} className="size-4 shrink-0 text-muted-foreground" />
          <span>{pick(row.key, "title", locale)}</span>
        </Link>
      )}
    />
  );
}

async function ProtocolSection({ inst, filters, locale }: Props) {
  const t = await getTranslations("reports.byProtocol");
  const rows = await complianceByProtocol(inst, filters);
  return (
    <ReportCard id="report-protocols" title={t("title")} description={t("description")}>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("none")}</p> : <ProtocolTable rows={rows} locale={locale} />}
    </ReportCard>
  );
}

export async function DepartmentTable({ rows }: { rows: ReadonlyArray<BreakdownRow<DepartmentKey>> }) {
  const t = await getTranslations("reports.byDepartment");
  return (
    <BreakdownTable
      rows={rows}
      caption={t("tableCaption")}
      firstColumn={t("department")}
      renderKey={(row) => (row.key ? <bdi>{row.key.name}</bdi> : <span className="text-muted-foreground">{t("none")}</span>)}
    />
  );
}

async function DepartmentSection({ inst, filters, options }: Props & { options: FilterOptions }) {
  const t = await getTranslations("reports.byDepartment");
  if (options.departments.length === 0) {
    return (
      <ReportCard id="report-departments" title={t("title")} description={t("description")}>
        <p className="text-sm text-muted-foreground">
          {t("noDepartments")}{" "}
          {isOrgManager(inst.scope) && (
            <Link href="/org/departments" className="font-medium text-primary underline-offset-4 hover:underline">
              {t("manage")}
            </Link>
          )}
        </p>
      </ReportCard>
    );
  }
  const rows = await complianceByDepartment(inst, filters);
  return (
    <ReportCard id="report-departments" title={t("title")} description={t("description")}>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : <DepartmentTable rows={rows} />}
    </ReportCard>
  );
}

export async function TraineeTable({
  inst,
  filters,
  locale,
  rawPage,
  baseQuery,
  pageSize = TRAINEE_PAGE_SIZE,
  paged = true,
}: Props & { rawPage?: string; baseQuery: Record<string, string>; pageSize?: number; paged?: boolean }) {
  const t = await getTranslations("reports.trainees");
  const format = await getFormatter();
  const { rows, info } = await traineeProgress(inst, filters, { rawPage, locale, pageSize });
  if (rows.length === 0) {
    // Filtered to a department: the institution may well have trainees, just none there (no invitation either).
    if (filters.teamId) return <p className="text-sm text-muted-foreground">{t("noneInDepartment")}</p>;
    return (
      <p className="text-sm text-muted-foreground">
        {t("none")}{" "}
        {isOrgManager(inst.scope) && (
          <Link href="/org/members" className="inline-flex min-h-8 items-center font-medium text-primary underline-offset-4 hover:underline">
            {t("invite")}
          </Link>
        )}
      </p>
    );
  }
  // The trainee page links back to this report with the same filters and trainee page (UX: "back" keeps the view).
  const traineeQuery = queryString({ ...baseQuery, tpage: info.page > 1 ? info.page : null });
  const name = (row: (typeof rows)[number]) => (
    <Link
      href={`/reports/trainees/${row.userId}${traineeQuery}`}
      className="inline-flex min-h-8 items-center font-medium underline-offset-4 hover:underline"
    >
      <bdi>{row.name}</bdi>
    </Link>
  );
  const departments = (row: (typeof rows)[number]) =>
    row.departments.length > 0 && <p className="text-xs text-muted-foreground">{format.list(row.departments, { type: "conjunction" })}</p>;
  const latest = (row: (typeof rows)[number]) =>
    row.latest ? (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <ScoreBadge score={row.latest.score} />
        {row.latest.riskLevel && <RiskBadge level={row.latest.riskLevel} />}
        <span className="text-xs text-muted-foreground">{format.dateTime(row.latest.completedAt, "date")}</span>
      </span>
    ) : (
      <span className="text-muted-foreground">{t("noAttempts")}</span>
    );
  // The phone list has the room: every step in full. The table cell is narrow, so a step there shows two lines, with
  // the whole text as the tooltip (and on the trainee's page, one tap away); screen readers and paper get it all.
  const weak = (row: (typeof rows)[number], clamp: boolean) =>
    row.weakSteps.length === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <ul className="flex flex-col gap-1">
        {row.weakSteps.map((s) => {
          const text = pick(s, "text", locale);
          return (
            <li key={s.id} className="text-pretty">
              {clamp ? (
                <span title={text} className="line-clamp-2 print:line-clamp-none">
                  {text}
                </span>
              ) : (
                text
              )}
            </li>
          );
        })}
      </ul>
    );
  return (
    <>
      {/* Until the card is wide enough for the table (about 44rem): one card per trainee. */}
      <ul className="flex flex-col divide-y @3xl:hidden print:hidden">
        {rows.map((row) => (
          <li key={row.userId} className="flex flex-col gap-2 py-3 first:pt-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {name(row)}
                {departments(row)}
              </div>
              <span className="shrink-0 pt-1.5 text-sm text-muted-foreground tabular-nums">{t("attemptsCount", { count: row.attempts })}</span>
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground">{t("average")}</dt>
                <dd>
                  <ScoreMeter score={row.average} />
                </dd>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground">{t("latest")}</dt>
                <dd>{latest(row)}</dd>
              </div>
              {row.weakSteps.length > 0 && (
                <div className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">{t("weakAreas")}</dt>
                  <dd>{weak(row, false)}</dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>
      <TableFrame label={t("tableCaption")} className="hidden @3xl:block print:block">
        <Table className="min-w-[44rem] print:min-w-0">
          <caption className="sr-only">{t("tableCaption")}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("trainee")}</TableHead>
              <TableHead scope="col" className="text-end">
                {t("attempts")}
              </TableHead>
              <TableHead scope="col">{t("average")}</TableHead>
              <TableHead scope="col">{t("latest")}</TableHead>
              <TableHead scope="col">{t("weakAreas")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.userId}>
                <TableHead scope="row" className="font-normal whitespace-normal">
                  <div className="flex flex-col items-start">
                    {name(row)}
                    {departments(row)}
                  </div>
                </TableHead>
                <TableCell className="text-end tabular-nums">{format.number(row.attempts, "integer")}</TableCell>
                <TableCell>
                  <ScoreMeter score={row.average} />
                </TableCell>
                <TableCell className="whitespace-normal">{latest(row)}</TableCell>
                <TableCell className="max-w-72 text-xs whitespace-normal">{weak(row, true)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
      {paged ? (
        <Pager info={info} label={t("pages")} href={(page) => `/reports${queryString({ ...baseQuery, tpage: page > 1 ? page : null })}`} />
      ) : (
        info.pageCount > 1 && <p className="mt-3 text-xs text-muted-foreground">{t("printCap", { shown: format.number(rows.length, "integer"), total: info.total })}</p>
      )}
    </>
  );
}

async function TraineeSection(props: Props & { rawPage?: string; baseQuery: Record<string, string> }) {
  const t = await getTranslations("reports.trainees");
  return (
    <ReportCard id={TRAINEES_ANCHOR} title={t("title")} description={t("description")}>
      <ScrollToHash id={TRAINEES_ANCHOR} />
      <TraineeTable {...props} />
    </ReportCard>
  );
}

/** First run: the institution has no finalised scan and no completed attempt yet. */
export async function InstitutionFirstRun() {
  const t = await getTranslations("reports.institution");
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BarChart3Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>
          <h2>{t("emptyTitle")}</h2>
        </EmptyTitle>
        <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">
        {/* cn(): buttonVariants alone does not merge its classes, and the outline border lost to border-transparent. */}
        <Link href="/scans/new" className={cn(buttonVariants({ variant: "default" }))}>
          <ScanLineIcon aria-hidden />
          {t("startScan")}
        </Link>
        <Link href="/simulations" className={cn(buttonVariants({ variant: "outline" }))}>
          <GraduationCapIcon aria-hidden />
          {t("openSimulations")}
        </Link>
      </EmptyContent>
    </Empty>
  );
}

/** Results exist, but none match the filters. */
async function NoMatch() {
  const t = await getTranslations("reports.institution");
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FilterXIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>
          <h2>{t("noMatchTitle")}</h2>
        </EmptyTitle>
        <EmptyDescription>{t("noMatchDescription")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/reports" className={cn(buttonVariants({ variant: "outline" }))}>
          {t("clearFilters")}
        </Link>
      </EmptyContent>
    </Empty>
  );
}

export function printHref(filters: ReportFilters): string {
  return `/reports/print${queryString(filtersToQuery(filters))}`;
}

export function exportHref(kind: "scans" | "attempts", filters: ReportFilters, locale: Locale): string {
  return `/api/reports/export${queryString({ ...filtersToQuery(filters), kind, locale })}`;
}

export async function InstitutionReportBody({
  inst,
  filters,
  locale,
  options,
  summary,
  hasResults,
  searchParams,
}: Props & { options: FilterOptions; summary: InstitutionSummary; hasResults: boolean; searchParams: SearchParamsRecord }) {
  const t = await getTranslations("reports.institution");
  const baseQuery = filtersToQuery(filters);
  const rawPage = typeof searchParams.tpage === "string" ? searchParams.tpage : undefined;
  const trainees = (
    <Suspense fallback={<CardSkeleton rows={4} />}>
      <TraineeSection inst={inst} filters={filters} locale={locale} rawPage={rawPage} baseQuery={baseQuery} />
    </Suspense>
  );
  if (!hasResults) {
    return (
      <ReportPendingArea>
        <InstitutionFirstRun />
        {trainees}
      </ReportPendingArea>
    );
  }
  const anyInRange = summary.combined.n > 0;
  return (
    <ReportPendingArea>
      <PeriodSummary filters={filters} />
      {anyInRange ? (
        <>
          <InstitutionKpis summary={summary} />
          <Suspense fallback={<CardSkeleton chart />}>
            <TrendSection inst={inst} filters={filters} locale={locale} />
          </Suspense>
          {/* items-start: the short risk card keeps its own height beside the gaps list. */}
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <RiskSection summary={summary} />
            <Suspense fallback={<CardSkeleton rows={4} />}>
              <GapsSection inst={inst} filters={filters} locale={locale} />
            </Suspense>
          </div>
          <Suspense fallback={<CardSkeleton rows={5} />}>
            <ProtocolSection inst={inst} filters={filters} locale={locale} />
          </Suspense>
          <Suspense fallback={<CardSkeleton rows={3} />}>
            <DepartmentSection inst={inst} filters={filters} locale={locale} options={options} />
          </Suspense>
        </>
      ) : (
        <NoMatch />
      )}
      {trainees}
      <p className="text-xs text-muted-foreground">{t("method")}</p>
    </ReportPendingArea>
  );
}

/** Shown next to the filters: the export menu and the link to the print view. */
export async function InstitutionActions({ filters, locale }: { filters: ReportFilters; locale: Locale }) {
  const t = await getTranslations("reports.export");
  const print = await getTranslations("reports.print");
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <ExportMenu
        note={t("note")}
        items={[
          { key: "scans", label: t("scans"), href: exportHref("scans", filters, locale) },
          { key: "attempts", label: t("attempts"), href: exportHref("attempts", filters, locale) },
        ]}
      />
      {/* It opens a page (the print view, which has its own Print button): labelled as such, not "Print". */}
      <Link href={printHref(filters)} className={cn(buttonVariants({ variant: "outline" }), "min-h-8")}>
        <PrinterIcon aria-hidden />
        {print("open")}
      </Link>
    </div>
  );
}

