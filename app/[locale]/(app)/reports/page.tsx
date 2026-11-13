import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ReportFilterProvider, ReportFiltersBar } from "@/components/reports/filters-bar";
import { InstitutionActions, InstitutionReportBody } from "@/components/reports/institution-report";
import { PersonReportBody } from "@/components/reports/person-report";
import { InstitutionReportSkeleton, PersonalReportSkeleton, ReportsSkeleton } from "@/components/reports/skeletons";
import { ReportViewNav } from "@/components/reports/view-nav";
import { PageHeader } from "@/components/shared/page-header";
import { type Scope, scopeOf } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { filtersToQuery, parseReportFilters, reportViewQuery, type SearchParamsRecord, todayInRiyadh } from "@/lib/reports/filters";
import {
  institutionHasResults,
  institutionSummary,
  organizationLabel,
  reportFilterOptions,
  resolveFilters,
} from "@/lib/reports/institution";
import { attemptSummary, ownAttempts } from "@/lib/reports/personal";
import { type InstitutionScope, institutionScope } from "@/lib/reports/scope";
import { requireUser } from "@/lib/session";

// /reports: "my results" for everyone; the institution report (and a switch to "my results") for staff of the
// active institution (owner / admin / examiner). Filters, the view and the page numbers live in the URL. Only
// generic strings are static here; everything that depends on the user renders inside <Suspense>.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports");
  return { title: t("title") };
}

export default async function ReportsPage({ searchParams }: PageProps<"/[locale]/reports">) {
  const t = await getTranslations("reports");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<ReportsSkeleton />}>
        <ReportsView searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Decides the view (fast: the session is read once per request), then streams it behind a skeleton of THAT view:
 * the institution report has a view switch and a filter bar, "my results" has neither, so one shared skeleton made
 * the content jump when it arrived.
 */
async function ReportsView({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const ctx = await requireUser();
  const scope = scopeOf(ctx);
  const [sp, locale] = await Promise.all([searchParams, getLocale() as Promise<Locale>]);
  const inst = institutionScope(scope);
  if (inst && first(sp.view) !== "personal") {
    return (
      <Suspense fallback={<InstitutionReportSkeleton />}>
        <InstitutionView inst={inst} sp={sp} locale={locale} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<PersonalReportSkeleton withViewNav={inst !== null} />}>
      <PersonalView scope={scope} inst={inst} sp={sp} locale={locale} />
    </Suspense>
  );
}

async function PersonalView({
  scope,
  inst,
  sp,
  locale,
}: {
  scope: Scope;
  inst: InstitutionScope | null;
  sp: SearchParamsRecord;
  locale: Locale;
}) {
  const subject = ownAttempts(scope);
  // Staff only: the institution report filters ride along (the view switch and the pages carry them back).
  const filterQuery = inst ? filtersToQuery(parseReportFilters(sp, todayInRiyadh())) : {};
  const [summary, institutionName] = await Promise.all([
    attemptSummary(subject),
    inst ? institutionDisplayName(inst, locale) : Promise.resolve(""),
  ]);
  return (
    <div className="flex flex-col gap-6">
      {inst && <ReportViewNav view="personal" institutionName={institutionName} filterQuery={filterQuery} />}
      <PersonReportBody
        subject={subject}
        summary={summary}
        locale={locale}
        audience="self"
        rawPage={first(sp.page)}
        pagePath="/reports"
        baseQuery={inst ? reportViewQuery("personal", filterQuery) : {}}
      />
    </div>
  );
}

async function institutionDisplayName(inst: InstitutionScope, locale: Locale): Promise<string> {
  const org = await organizationLabel(inst);
  return locale === "en" && org.nameEn ? org.nameEn : org.name;
}

async function InstitutionView({ inst, sp, locale }: { inst: InstitutionScope; sp: SearchParamsRecord; locale: Locale }) {
  const today = todayInRiyadh();
  const [options, institutionName, hasResults] = await Promise.all([
    reportFilterOptions(inst),
    institutionDisplayName(inst, locale),
    institutionHasResults(inst),
  ]);
  const filters = resolveFilters(parseReportFilters(sp, today), options);
  const summary = await institutionSummary(inst, filters);
  const protocols = options.protocols
    .map((p) => ({ id: p.id, label: pick(p, "title", locale) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  return (
    <ReportFilterProvider>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ReportViewNav view="institution" institutionName={institutionName} filterQuery={filtersToQuery(filters)} />
          {hasResults && <InstitutionActions filters={filters} locale={locale} />}
        </div>
        {hasResults && (
          <ReportFiltersBar
            // No `key`: the bar syncs itself to a new URL without remounting (the pressed button keeps its focus).
            value={filters}
            today={today}
            protocols={protocols}
            departments={options.departments}
          />
        )}
        <InstitutionReportBody
          inst={inst}
          filters={filters}
          locale={locale}
          options={options}
          summary={summary}
          hasResults={hasResults}
          searchParams={sp}
        />
      </div>
    </ReportFilterProvider>
  );
}
