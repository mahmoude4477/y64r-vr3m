import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ScanFiltersBar } from "@/components/scans/scan-filters";
import { ScanList } from "@/components/scans/scan-list";
import { ScanListSkeleton } from "@/components/scans/scan-list-skeleton";
import { ScanPageFrame } from "@/components/scans/scan-page";
import { ScansEmpty, ScansNoMatch } from "@/components/scans/scans-empty";
import { PageHeader } from "@/components/shared/page-header";
import { Link } from "@/i18n/navigation";
import { scopeOf } from "@/lib/authz";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import { parseScanFilters } from "@/lib/scans/filters";
import { listScans, scanFilterOptions } from "@/lib/scans/queries";
import { requireOrgRole } from "@/lib/session";
import { buttonVariants } from "@/components/ui/button";

// The institution's scans (staff only: owner / admin / examiner of the ACTIVE institution). Filters live in the URL.
// Static part: generic strings only; everything else streams from the guarded data component (CONVENTIONS 4).
// The header is the same in the fallback and in the data, except that an institution without any scan gets its
// "new scan" action once, inside the empty state, not twice.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("scans");
  return { title: t("title") };
}

export default function ScansPage({ searchParams }: PageProps<"/[locale]/scans">) {
  return (
    <ScanPageFrame>
      <Suspense
        fallback={
          <>
            <ScansHeader action />
            <ScanListSkeleton />
          </>
        }
      >
        <ScansData searchParams={searchParams} />
      </Suspense>
    </ScanPageFrame>
  );
}

async function ScansHeader({ action }: { action: boolean }) {
  const t = await getTranslations("scans");
  return (
    <PageHeader
      title={t("title")}
      description={t("description")}
      actions={
        action && (
          <Link href="/scans/new" className={buttonVariants({ size: "lg" })}>
            <PlusIcon aria-hidden />
            {t("list.newScan")}
          </Link>
        )
      }
    />
  );
}

async function ScansData({ searchParams }: { searchParams: PageProps<"/[locale]/scans">["searchParams"] }) {
  const ctx = await requireOrgRole(ORG_STAFF_ROLES);
  const scope = scopeOf(ctx);
  const locale = await getLocale();
  const filters = parseScanFilters(await searchParams);
  const [data, options] = await Promise.all([listScans(scope, filters, locale), scanFilterOptions(scope, locale)]);

  if (data.total === 0 && !data.institutionHasScans) {
    return (
      <>
        <ScansHeader action={false} />
        <ScansEmpty />
      </>
    );
  }
  return (
    <>
      <ScansHeader action />
      <ScanFiltersBar filters={filters} protocols={options.protocols} departments={options.departments} />
      {data.total === 0 ? <ScansNoMatch /> : <ScanList data={data} filters={filters} />}
    </>
  );
}
