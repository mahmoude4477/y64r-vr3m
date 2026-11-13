import { ClipboardListIcon, SearchXIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AttemptsTable, ScansTable } from "@/components/admin/assessment-tables";
import { ListEmpty } from "@/components/admin/list-empty";
import { ListFilters } from "@/components/admin/list-filters";
import { ListPagination, ListStatus } from "@/components/admin/list-pagination";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import {
  ASSESSMENT_DEFAULTS,
  ATTEMPT_STATUS_FILTERS,
  assessmentParams,
  isFiltered,
  NO_ORGANIZATION,
  parseAssessmentFilters,
  RISK_FILTERS,
  SCAN_STATUS_FILTERS,
  type AssessmentFilters,
  type AssessmentKind,
} from "@/lib/admin/assessment-filters";
import { listAttempts, listScans, organizationOptions, protocolOptions } from "@/lib/admin/assessment-queries";
import { orgNames } from "@/lib/admin/display";
import { listHref, type RawSearchParams } from "@/lib/admin/params";
import { pick } from "@/lib/i18n-content";
import { adminMetadata } from "@/lib/admin/metadata";
import { requirePlatformAdmin } from "@/lib/session";
import { cn } from "@/lib/utils";

// /admin/assessments: every smart scan and every simulation attempt on the platform (PRODUCT 6a), filtered by
// institution, protocol, risk, status and day; each opens a read-only detail where abusive content can be deleted.

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations("nav");
  return adminMetadata(nav("sub.adminAssessments"));
}

const PATH = "/admin/assessments";
/** The "no filter" value of the institution and protocol selects (a select item needs a non-empty value). */
const ALL = "all";
const DEFAULTS = { ...ASSESSMENT_DEFAULTS, org: ALL, protocol: ALL };

async function KindTabs({ filters }: { filters: AssessmentFilters }) {
  const t = await getTranslations("admin.assessments");
  // Switching the tab keeps the filters both lists share (search, institution, protocol, risk, days).
  const href = (kind: AssessmentKind) =>
    listHref(
      PATH,
      {
        ...assessmentParams(filters),
        kind,
        status: null,
        org: kind === "scans" && filters.org === NO_ORGANIZATION ? null : filters.org,
      },
      DEFAULTS,
    );
  return (
    <nav aria-label={t("kindsLabel")}>
      <ul className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {(["scans", "attempts"] as const).map((kind) => (
          <li key={kind}>
            <Link
              href={href(kind)}
              aria-current={filters.kind === kind ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-8 px-3",
                filters.kind === kind ? "bg-background text-foreground shadow-sm hover:bg-background" : "text-muted-foreground",
              )}
            >
              {t(`kinds.${kind}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

async function AssessmentsList({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  await requirePlatformAdmin();
  const filters = parseAssessmentFilters(await searchParams);
  const [t, risk, scanStatus, attemptStatus, locale] = await Promise.all([
    getTranslations("admin.assessments"),
    getTranslations("common.risk"),
    getTranslations("common.scanStatus"),
    getTranslations("common.attemptStatus"),
    getLocale(),
  ]);
  const organizations = await organizationOptions();
  const protocols = await protocolOptions(filters.org);
  const isScans = filters.kind === "scans";
  const scansPage = isScans ? await listScans(filters) : null;
  const attemptsPage = isScans ? null : await listAttempts(filters);
  const total = scansPage?.total ?? attemptsPage?.total ?? 0;
  const page = scansPage?.page ?? attemptsPage?.page ?? 1;
  const count = scansPage ? scansPage.scans.length : (attemptsPage?.attempts.length ?? 0);

  const orgOptions = [
    { value: ALL, label: t("allInstitutions") },
    ...(isScans ? [] : [{ value: NO_ORGANIZATION, label: t("individual") }]),
    ...organizations.map((o) => ({ value: o.id, label: orgNames(o, locale).primary })),
  ];
  // A link can name an institution beyond the first FILTER_ORGANIZATIONS_MAX: keep the select's value valid.
  if (filters.org && !orgOptions.some((o) => o.value === filters.org)) orgOptions.push({ value: filters.org, label: t("selectedInstitution") });
  const protocolList = [
    { value: ALL, label: t("allProtocols") },
    ...protocols.map((p) => ({
      value: p.id,
      label: p.organizationId ? t("customProtocol", { title: pick(p, "title", locale) }) : pick(p, "title", locale),
    })),
  ];
  if (filters.protocol && !protocolList.some((p) => p.value === filters.protocol)) {
    protocolList.push({ value: filters.protocol, label: t("selectedProtocol") });
  }
  const statusOptions = isScans
    ? SCAN_STATUS_FILTERS.map((v) => ({ value: v, label: v === "all" ? t("allStatuses") : scanStatus(v) }))
    : ATTEMPT_STATUS_FILTERS.map((v) => ({ value: v, label: v === "all" ? t("allStatuses") : attemptStatus(v) }));

  return (
    <div className="flex flex-col gap-4">
      <KindTabs filters={filters} />
      <ListFilters
        key={filters.kind}
        path={PATH}
        label={t("filtersLabel")}
        searchLabel={t("search")}
        searchPlaceholder={isScans ? t("searchScans") : t("searchAttempts")}
        query={filters.q}
        dates={{ from: filters.from, to: filters.to }}
        keep={{ kind: isScans ? "" : filters.kind }}
        selects={[
          { name: "org", label: t("institution"), value: filters.org || ALL, defaultValue: ALL, options: orgOptions },
          { name: "protocol", label: t("protocol"), value: filters.protocol || ALL, defaultValue: ALL, options: protocolList },
          {
            name: "risk",
            label: risk("label"),
            value: filters.risk,
            defaultValue: "all",
            options: RISK_FILTERS.map((v) => ({
              value: v,
              label: v === "all" ? t("allRisks") : v === "not_assessable" ? t("notAssessable") : risk(v),
            })),
          },
          { name: "status", label: t("status"), value: filters.status, defaultValue: "all", options: statusOptions },
        ]}
      />
      <ListStatus page={page} total={total} shown={count} empty={isFiltered(filters) ? t("noResults.title") : isScans ? t("emptyScans.title") : t("emptyAttempts.title")} />
      {count === 0 ? (
        isFiltered(filters) ? (
          <ListEmpty icon={SearchXIcon} title={t("noResults.title")} description={t("noResults.description")} />
        ) : (
          <ListEmpty
            icon={ClipboardListIcon}
            title={isScans ? t("emptyScans.title") : t("emptyAttempts.title")}
            description={isScans ? t("emptyScans.description") : t("emptyAttempts.description")}
          />
        )
      ) : (
        <>
          {scansPage ? <ScansTable scans={scansPage.scans} /> : <AttemptsTable attempts={attemptsPage?.attempts ?? []} />}
          <ListPagination path={PATH} params={assessmentParams(filters)} defaults={DEFAULTS} page={page} total={total} />
        </>
      )}
    </div>
  );
}

function AssessmentsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-56 rounded-lg" />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Skeleton className="h-14 w-full sm:max-w-md" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 sm:w-44" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default async function AdminAssessmentsPage({ searchParams }: PageProps<"/[locale]/admin/assessments">) {
  const [nav, t] = await Promise.all([getTranslations("nav"), getTranslations("admin.assessments")]);
  return (
    <>
      <PageHeader title={nav("sub.adminAssessments")} description={t("description")} />
      <Suspense fallback={<AssessmentsSkeleton />}>
        <AssessmentsList searchParams={searchParams} />
      </Suspense>
    </>
  );
}
