import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { DataTable } from "@/components/reports/chart-data-table";
import { bucketLabels, dayDate } from "@/components/reports/format";
import {
  DepartmentTable,
  GapList,
  InstitutionKpis,
  ProtocolTable,
  RiskSection,
  TraineeTable,
} from "@/components/reports/institution-report";
import { PrintButton, PrintInLightColors } from "@/components/reports/report-actions";
import { ReportCard } from "@/components/reports/report-card";
import { PrintReportSkeleton } from "@/components/reports/skeletons";
import { LogoMark } from "@/components/brand/logo";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { scopeOf } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import { filtersToQuery, parseReportFilters, queryString, type SearchParamsRecord, todayInRiyadh } from "@/lib/reports/filters";
import {
  complianceByDepartment,
  complianceByProtocol,
  complianceTrend,
  institutionSummary,
  organizationLabel,
  reportFilterOptions,
  resolveFilters,
  topGaps,
} from "@/lib/reports/institution";
import { institutionScope } from "@/lib/reports/scope";
import { requireOrgRole } from "@/lib/session";
import { cn } from "@/lib/utils";

// Printable institution report (/reports/print, same filters as /reports): one document with every section as a
// table, no interactive chrome. The app shell hides itself in print (globals.css) and this page prints in light
// colors even from dark mode (PrintInLightColors). Institution staff only.

/** Trainee rows in the printed report (the rest stay in /reports, which pages them). */
const PRINT_TRAINEE_ROWS = 200;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.print");
  return { title: t("title") };
}

export default async function ReportPrintPage({ searchParams }: PageProps<"/[locale]/reports/print">) {
  const t = await getTranslations("reports.print");
  const common = await getTranslations("common");
  return (
    <>
      {/* Paper only: the app shell is hidden in print, so the sheet says where it comes from. */}
      <div aria-hidden className="hidden items-center gap-2 border-b pb-3 print:flex">
        <LogoMark className="size-6" />
        <span className="font-semibold">{common("appName")}</span>
      </div>
      <PageHeader title={t("title")} description={<span className="print:hidden">{t("description")}</span>} />
      <Suspense fallback={<PrintReportSkeleton />}>
        <PrintView searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PrintView({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const ctx = await requireOrgRole(ORG_STAFF_ROLES);
  const inst = institutionScope(scopeOf(ctx));
  if (!inst) return null; // unreachable: requireOrgRole(ORG_STAFF_ROLES) passed
  const [sp, locale] = await Promise.all([searchParams, getLocale() as Promise<Locale>]);
  const t = await getTranslations("reports.print");
  const trendT = await getTranslations("reports.trend");
  const filtersT = await getTranslations("reports.filters");
  const score = await getTranslations("common.score");
  const format = await getFormatter();

  const options = await reportFilterOptions(inst);
  const filters = resolveFilters(parseReportFilters(sp, todayInRiyadh()), options);
  const [org, summary, trend, gaps, byProtocol, byDepartment] = await Promise.all([
    organizationLabel(inst),
    institutionSummary(inst, filters),
    complianceTrend(inst, filters),
    topGaps(inst, filters, 10),
    complianceByProtocol(inst, filters),
    options.departments.length > 0 ? complianceByDepartment(inst, filters) : Promise.resolve([]),
  ]);
  const orgName = locale === "en" && org.nameEn ? org.nameEn : org.name;
  const protocol = filters.protocolId ? options.protocols.find((p) => p.id === filters.protocolId) : null;
  const department = filters.teamId ? options.departments.find((d) => d.id === filters.teamId) : null;
  const pct = (v: number | null) => (v === null ? "—" : score("value", { score: format.number(v, "integer") }));
  const none = <p className="text-sm text-muted-foreground">{t("noData")}</p>;

  return (
    <div className="flex flex-col gap-6 print:gap-4 print:text-[12px]">
      <PrintInLightColors />
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/reports${queryString(filtersToQuery(filters))}`} className={cn(buttonVariants({ variant: "outline" }), "min-h-8")}>
          <ArrowLeftIcon aria-hidden className="rtl:rotate-180" />
          {t("back")}
        </Link>
        <PrintButton />
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>

      <section aria-label={t("details")} className="rounded-xl border p-4 print:rounded-none print:border-x-0 print:border-t-0 print:px-0">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t("institution")}</dt>
            <dd className="font-medium">
              <bdi>{orgName}</bdi>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("period")}</dt>
            <dd className="font-medium">
              {filtersT("range", { from: format.dateTime(dayDate(filters.from), "date"), to: format.dateTime(dayDate(filters.to), "date") })}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{filtersT("protocol")}</dt>
            <dd className="font-medium">{protocol ? pick(protocol, "title", locale) : filtersT("allProtocols")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{filtersT("department")}</dt>
            <dd className="font-medium">{department ? <bdi>{department.name}</bdi> : filtersT("allDepartments")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("generated")}</dt>
            <dd className="font-medium">{format.dateTime(new Date(), "dateTime")}</dd>
          </div>
        </dl>
      </section>

      <InstitutionKpis summary={summary} />

      <ReportCard id="print-trend" print="flow" title={trendT("title")} description={trendT("description")}>
        {summary.combined.n === 0 ? (
          none
        ) : (
          <DataTable
            caption={trendT("tableCaption")}
            columns={[trendT("columns.period"), trendT("columns.combined"), trendT("columns.scans"), trendT("columns.simulations")]}
            rows={trend
              .filter((p) => p.scanCount + p.simulationCount > 0)
              .map((p) => {
                const labels = bucketLabels(p.bucket, filters.granularity, format, (date) => trendT("weekOf", { date }));
                return {
                  key: p.bucket,
                  cells: [
                    labels.tooltipLabel,
                    pct(p.combined),
                    p.scanCount ? trendT("cell", { score: pct(p.scans), count: format.number(p.scanCount, "integer") }) : "—",
                    p.simulationCount ? trendT("cell", { score: pct(p.simulations), count: format.number(p.simulationCount, "integer") }) : "—",
                  ],
                };
              })}
          />
        )}
      </ReportCard>

      <RiskSection summary={summary} />

      <ReportCard id="print-gaps" print="flow" title={t("gaps")}>
        {gaps.length === 0 ? none : <GapList gaps={gaps} locale={locale} />}
      </ReportCard>

      <ReportCard id="print-protocols" print="flow" title={t("byProtocol")}>
        {byProtocol.length === 0 ? none : <ProtocolTable rows={byProtocol} locale={locale} />}
      </ReportCard>

      {options.departments.length > 0 && (
        <ReportCard id="print-departments" print="flow" title={t("byDepartment")}>
          {byDepartment.length === 0 ? none : <DepartmentTable rows={byDepartment} />}
        </ReportCard>
      )}

      <ReportCard id="print-trainees" print="flow" title={t("trainees")}>
        <TraineeTable
          inst={inst}
          filters={filters}
          locale={locale}
          baseQuery={filtersToQuery(filters)}
          pageSize={PRINT_TRAINEE_ROWS}
          paged={false}
        />
      </ReportCard>
    </div>
  );
}
