import { GraduationCapIcon, LineChartIcon } from "lucide-react";
import type { Locale } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { CriticalViolationBadge } from "./badges";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/i18n-content";
import { queryString } from "@/lib/reports/filters";
import {
  type AttemptSubject,
  type AttemptSummary,
  attemptHistory,
  attemptScoreHistory,
  weakSteps,
} from "@/lib/reports/personal";
import { ChartDataTable } from "./chart-data-table";
import { DAY_MONTH } from "./format";
import { Pager } from "./pager";
import { ReportCard, StatGrid, StatTile } from "./report-card";
import { TableFrame } from "./table-frame";
import { ScoreLineChart } from "./score-line-chart";
import { CardSkeleton } from "./skeletons";
import { AttemptStatusBadge, RiskBadge, ScoreBadge } from "@/components/shared/status-badges";

/**
 * Simulation results of one person: "my results" on /reports, or one trainee on /reports/trainees/<id> for
 * institution staff (`audience`). Same sections, same queries (lib/reports/personal.ts).
 */

type Audience = "self" | "staff";

export async function PersonKpis({ summary, audience }: { summary: AttemptSummary; audience: Audience }) {
  const t = await getTranslations("reports.personal.kpi");
  const common = await getTranslations("reports.common");
  const score = await getTranslations("common.score");
  const format = await getFormatter();
  const value = (v: number | null) =>
    v === null ? (
      <>
        <span aria-hidden>—</span>
        <span className="sr-only">{common("noScore")}</span>
      </>
    ) : (
      score("value", { score: format.number(v, "integer") })
    );
  return (
    <StatGrid label={t("label")}>
      <StatTile
        label={t(audience === "self" ? "completed" : "completedStaff")}
        value={format.number(summary.completed, "integer")}
        hint={summary.inProgress > 0 ? t("inProgress", { count: summary.inProgress }) : undefined}
      />
      <StatTile label={t("average")} value={value(summary.average)} />
      <StatTile label={t("best")} value={value(summary.best)} />
      <StatTile
        label={t("latest")}
        // A completed attempt that could not be assessed says so (CONVENTIONS 7), like the dashboard and the history.
        value={summary.latest ? summary.latest.score === null ? <ScoreBadge score={null} /> : value(summary.latest.score) : value(null)}
        badge={summary.latest?.riskLevel ? <RiskBadge level={summary.latest.riskLevel} /> : undefined}
        hint={summary.latest ? format.dateTime(summary.latest.completedAt, "date") : undefined}
      />
    </StatGrid>
  );
}

async function ScoreTrend({ subject, locale, audience }: { subject: AttemptSubject; locale: Locale; audience: Audience }) {
  const t = await getTranslations("reports.personal.trend");
  const score = await getTranslations("common.score");
  const format = await getFormatter();
  const points = await attemptScoreHistory(subject);
  if (points.length < 2) {
    return (
      <ReportCard id="person-trend" title={t("title")} description={t("descriptionShort")}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LineChartIcon aria-hidden className="size-4" />
          {t("needMore")}
        </p>
      </ReportCard>
    );
  }
  const data = points.map((p) => ({
    key: p.id,
    label: format.dateTime(p.completedAt, DAY_MONTH),
    tooltipLabel: `${pick(p, "title", locale)} · ${format.dateTime(p.completedAt, "date")}`,
    score: p.score,
  }));
  return (
    <ReportCard id="person-trend" title={t("title")} description={t(audience === "self" ? "description" : "descriptionStaff")}>
      <figure className="m-0">
        <figcaption className="sr-only">{t("chartLabel")}</figcaption>
        <div className="print:hidden">
          <ScoreLineChart label={t("chartLabel")} series={[{ key: "score", label: t("series"), color: "chart-1", emphasis: true }]} data={data} />
        </div>
      </figure>
      <ChartDataTable
        summary={t("showTable")}
        caption={t("tableCaption")}
        columns={[t("columns.date"), t("columns.scenario"), t("columns.score")]}
        rows={points.map((p) => ({
          key: p.id,
          cells: [format.dateTime(p.completedAt, "date"), pick(p, "title", locale), score("value", { score: format.number(p.score, "integer") })],
        }))}
      />
    </ReportCard>
  );
}

async function WeakStepsSection({ subject, locale, audience }: { subject: AttemptSubject; locale: Locale; audience: Audience }) {
  const t = await getTranslations("reports.personal.weak");
  const common = await getTranslations("reports.common");
  const format = await getFormatter();
  const steps = await weakSteps(subject);
  return (
    <ReportCard id="person-weak" title={t("title")} description={t(audience === "self" ? "description" : "descriptionStaff")}>
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {steps.map((s) => (
            <li key={s.step.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 print:break-inside-avoid">
              <p className="font-medium text-pretty">{pick(s.step, "text", locale)}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ProtocolIcon name={s.step.protocol.icon} className="size-3.5" />
                  {pick(s.step.protocol, "title", locale)}
                </span>
                {s.critical && <CriticalViolationBadge />}
              </p>
              <p className="text-sm">
                {t("missed", {
                  violated: format.number(s.violated, "integer"),
                  assessed: s.assessed,
                  rate: common("percent", { value: format.number(Math.round((s.violated / s.assessed) * 100), "integer") }),
                })}
              </p>
              <p className="text-sm text-muted-foreground text-pretty">
                <span className="font-medium text-foreground">{t("why")} </span>
                {pick(s.step, "rationale", locale)}
              </p>
              {s.scenario ? (
                <p className="text-sm">
                  <Link
                    href={`/simulations/${s.scenario.slug}`}
                    className="inline-flex min-h-8 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
                  >
                    <GraduationCapIcon aria-hidden className="size-4" />
                    {t("practice", { title: pick(s.scenario, "title", locale) })}
                  </Link>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noScenario")}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </ReportCard>
  );
}

async function HistorySection({
  subject,
  locale,
  rawPage,
  pagePath,
  baseQuery,
}: {
  subject: AttemptSubject;
  locale: Locale;
  rawPage?: string;
  pagePath: string;
  baseQuery: Record<string, string>;
}) {
  const t = await getTranslations("reports.personal.history");
  const format = await getFormatter();
  const { rows, info } = await attemptHistory(subject, rawPage);
  const date = (row: (typeof rows)[number]) => format.dateTime(row.completedAt ?? row.startedAt, "date");
  const duration = (row: (typeof rows)[number]) =>
    row.durationSec === null ? "—" : t("minutes", { count: Math.max(1, Math.round(row.durationSec / 60)) });
  const result = (row: (typeof rows)[number]) =>
    row.status === "completed" ? (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <ScoreBadge score={row.score} />
        {row.riskLevel && <RiskBadge level={row.riskLevel} />}
      </span>
    ) : (
      <AttemptStatusBadge status={row.status} />
    );
  const open = (row: (typeof rows)[number]) => (
    <Link
      href={`/simulations/attempts/${row.id}`}
      className="inline-flex min-h-8 items-center self-start font-medium text-pretty underline-offset-4 hover:underline"
    >
      {pick(row.scenario, "title", locale)}
    </Link>
  );
  const protocolLine = (row: (typeof rows)[number], withDate: boolean) => (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <ProtocolIcon name={row.scenario.protocol.icon} className="size-3.5 shrink-0" />
        {pick(row.scenario.protocol, "title", locale)}
      </span>
      {withDate && (
        <>
          <span aria-hidden>·</span>
          <span>{date(row)}</span>
        </>
      )}
    </p>
  );
  return (
    <ReportCard id="person-history" title={t("title")} description={t("description", { count: info.total })}>
      {/* Cards until the card itself is wide enough for the table (a container query: a tablet with the sidebar open
          is too narrow although the screen is wide). */}
      <ul className="flex flex-col divide-y @2xl:hidden print:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 py-3 first:pt-0">
            {open(row)}
            {protocolLine(row, true)}
            <div className="pt-0.5">{result(row)}</div>
          </li>
        ))}
      </ul>
      <TableFrame label={t("tableCaption")} className="hidden @2xl:block print:block">
        <Table className="min-w-[40rem] print:min-w-0">
          <caption className="sr-only">{t("tableCaption")}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("scenario")}</TableHead>
              <TableHead scope="col">{t("result")}</TableHead>
              <TableHead scope="col">{t("date")}</TableHead>
              <TableHead scope="col" className="text-end">
                {t("duration")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableHead scope="row" className="font-normal whitespace-normal">
                  {/* The link and the protocol line stack (the line used to run into the link's last word). */}
                  <div className="flex flex-col items-start gap-0.5">
                    {open(row)}
                    {protocolLine(row, false)}
                  </div>
                </TableHead>
                <TableCell>{result(row)}</TableCell>
                <TableCell>{date(row)}</TableCell>
                <TableCell className="text-end tabular-nums">{duration(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
      <Pager info={info} label={t("pages")} href={(page) => `${pagePath}${queryString({ ...baseQuery, page: page > 1 ? page : null })}`} />
    </ReportCard>
  );
}

/** The person has not finished any attempt yet. */
export async function PersonEmpty({ audience, inProgress }: { audience: Audience; inProgress: number }) {
  const t = await getTranslations("reports.personal");
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <GraduationCapIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>
          <h2>{t(audience === "self" ? "emptyTitle" : "emptyTitleStaff")}</h2>
        </EmptyTitle>
        <EmptyDescription>
          {t(audience === "self" ? "emptyDescription" : "emptyDescriptionStaff")}
          {inProgress > 0 && <> {t("emptyInProgress", { count: inProgress })}</>}
        </EmptyDescription>
      </EmptyHeader>
      {audience === "self" && (
        <EmptyContent>
          <Link href="/simulations" className={cn(buttonVariants({ variant: "default" }))}>
            {t("browse")}
          </Link>
        </EmptyContent>
      )}
    </Empty>
  );
}

export async function PersonReportBody({
  subject,
  summary,
  locale,
  audience,
  rawPage,
  pagePath,
  baseQuery,
}: {
  subject: AttemptSubject;
  summary: AttemptSummary;
  locale: Locale;
  audience: Audience;
  rawPage?: string;
  pagePath: string;
  baseQuery: Record<string, string>;
}) {
  if (summary.completed === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PersonEmpty audience={audience} inProgress={summary.inProgress} />
        {summary.inProgress > 0 && (
          <Suspense fallback={<CardSkeleton rows={2} />}>
            <HistorySection subject={subject} locale={locale} rawPage={rawPage} pagePath={pagePath} baseQuery={baseQuery} />
          </Suspense>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PersonKpis summary={summary} audience={audience} />
      {/* items-start: each card keeps its own height (a stretched trend card beside a long list was mostly blank). */}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Suspense fallback={<CardSkeleton chart />}>
          <ScoreTrend subject={subject} locale={locale} audience={audience} />
        </Suspense>
        <Suspense fallback={<CardSkeleton rows={4} />}>
          <WeakStepsSection subject={subject} locale={locale} audience={audience} />
        </Suspense>
      </div>
      <Suspense fallback={<CardSkeleton rows={5} />}>
        <HistorySection subject={subject} locale={locale} rawPage={rawPage} pagePath={pagePath} baseQuery={baseQuery} />
      </Suspense>
    </div>
  );
}
