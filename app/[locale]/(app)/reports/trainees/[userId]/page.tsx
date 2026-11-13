import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { TRAINEES_ANCHOR } from "@/components/reports/institution-report";
import { PersonReportBody } from "@/components/reports/person-report";
import { TraineeReportSkeleton } from "@/components/reports/skeletons";
import { PageHeader } from "@/components/shared/page-header";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { scopeOf } from "@/lib/authz";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import {
  filtersToQuery,
  isReportId,
  parseReportFilters,
  queryString,
  type SearchParamsRecord,
  todayInRiyadh,
} from "@/lib/reports/filters";
import { attemptSummary, traineeAttempts } from "@/lib/reports/personal";
import { institutionScope } from "@/lib/reports/scope";
import { traineeInOrganization } from "@/lib/reports/trainees";
import { requireOrgRole } from "@/lib/session";

// One trainee's simulation results in the active institution (institution staff only): the same sections as
// "my results", over the attempts this person made here. Reached from the trainee progress table on /reports.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.trainee");
  return { title: t("metaTitle") };
}

export default function TraineeReportPage({ params, searchParams }: PageProps<"/[locale]/reports/trainees/[userId]">) {
  return (
    <Suspense fallback={<TraineeReportSkeleton />}>
      <TraineeView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * The institution report this page was opened from (its filters and trainee page, carried in the URL), so the back
 * link and the history pages keep it.
 */
function reportQuery(sp: SearchParamsRecord): Record<string, string> {
  const query = filtersToQuery(parseReportFilters(sp, todayInRiyadh()));
  const tpage = Array.isArray(sp.tpage) ? sp.tpage[0] : sp.tpage;
  return typeof tpage === "string" && /^\d{1,6}$/.test(tpage) && tpage !== "1" ? { ...query, tpage } : query;
}

async function TraineeView({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const ctx = await requireOrgRole(ORG_STAFF_ROLES);
  const inst = institutionScope(scopeOf(ctx));
  if (!inst) notFound();
  const [{ userId }, sp, locale] = await Promise.all([params, searchParams, getLocale() as Promise<Locale>]);
  if (!isReportId(userId)) notFound();
  const trainee = await traineeInOrganization(inst, userId);
  if (!trainee) notFound();
  const t = await getTranslations("reports.trainee");
  const roles = await getTranslations("common.roles");
  const format = await getFormatter();
  const subject = traineeAttempts(inst, userId);
  const summary = await attemptSummary(subject);
  const page = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const back = reportQuery(sp);
  return (
    <div className="flex flex-col gap-6">
      {/* Reports › <name>: the breadcrumb's Reports crumb links back (nav.ts SUB_PAGES reports/trainees/*). */}
      <BreadcrumbLabel label={trainee.name} />
      <div>
        <Link
          href={`/reports${queryString(back)}#${TRAINEES_ANCHOR}`}
          className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeftIcon aria-hidden className="size-4 rtl:rotate-180" />
          {t("back")}
        </Link>
      </div>
      <PageHeader
        title={<bdi>{trainee.name}</bdi>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {trainee.role && <Badge variant="secondary">{roles(trainee.role)}</Badge>}
            {!trainee.isMember && <Badge variant="outline">{t("formerMember")}</Badge>}
            <span>{trainee.departments.length > 0 ? format.list(trainee.departments, { type: "conjunction" }) : t("noDepartment")}</span>
          </span>
        }
      />
      <p className="text-sm text-muted-foreground">{t("scopeNote")}</p>
      <PersonReportBody
        subject={subject}
        summary={summary}
        locale={locale}
        audience="staff"
        rawPage={page}
        pagePath={`/reports/trainees/${userId}`}
        baseQuery={back}
      />
    </div>
  );
}
