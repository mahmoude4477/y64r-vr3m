import { Building2Icon, PlusIcon, SearchXIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ListEmpty } from "@/components/admin/list-empty";
import { ListFilters } from "@/components/admin/list-filters";
import { ListPagination, ListStatus } from "@/components/admin/list-pagination";
import { OrganizationsTable } from "@/components/admin/organizations-table";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { parseChoice, parsePage, parseQuery, type RawSearchParams } from "@/lib/admin/params";
import { listOrganizations, ORG_STATUS_FILTERS } from "@/lib/admin/queries";
import { adminMetadata } from "@/lib/admin/metadata";
import { requirePlatformAdmin } from "@/lib/session";

// /admin/organizations: every institution, searchable by name, filtered by status (active, suspended, without an
// owner), 20 per page. "New institution" is a plain link (its page checks the platform admin itself).

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations("nav");
  return adminMetadata(nav("sub.adminOrganizations"));
}

async function OrganizationsList({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const ctx = await requirePlatformAdmin();
  const raw = await searchParams;
  const filters = { q: parseQuery(raw.q), status: parseChoice(raw.status, ORG_STATUS_FILTERS, "all"), page: parsePage(raw.page) };
  const [t, { organizations, total, page }] = await Promise.all([
    getTranslations("admin.organizations"),
    listOrganizations(filters, ctx.user.id),
  ]);
  const filtered = filters.q !== "" || filters.status !== "all";
  // "Institutions I belong to" with none (and no search): say that plainly, not "no results".
  const noneOfMine = filters.status === "mine" && filters.q === "";
  const noResults = noneOfMine ? t("noneOfMine.title") : t("noResults.title");

  return (
    <div className="flex flex-col gap-4">
      <ListFilters
        path="/admin/organizations"
        label={t("filtersLabel")}
        searchLabel={t("search")}
        searchPlaceholder={t("searchPlaceholder")}
        query={filters.q}
        selects={[
          {
            name: "status",
            label: t("status"),
            value: filters.status,
            defaultValue: "all",
            options: ORG_STATUS_FILTERS.map((v) => ({ value: v, label: t(`statusOptions.${v}`) })),
          },
        ]}
      />
      <ListStatus page={page} total={total} shown={organizations.length} empty={filtered ? noResults : t("empty.title")} />
      {organizations.length === 0 ? (
        noneOfMine ? (
          <ListEmpty icon={Building2Icon} title={noResults} description={t("noneOfMine.description")} />
        ) : filtered ? (
          <ListEmpty icon={SearchXIcon} title={noResults} description={t("noResults.description")} />
        ) : (
          <ListEmpty icon={Building2Icon} title={t("empty.title")} description={t("empty.description")}>
            <Link href="/admin/organizations/new" className={buttonVariants()}>
              <PlusIcon aria-hidden />
              {t("new")}
            </Link>
          </ListEmpty>
        )
      ) : (
        <>
          <OrganizationsTable organizations={organizations} />
          <ListPagination
            path="/admin/organizations"
            params={{ q: filters.q, status: filters.status }}
            defaults={{ status: "all" }}
            page={page}
            total={total}
          />
        </>
      )}
    </div>
  );
}

function OrganizationsListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Skeleton className="h-14 w-full sm:max-w-md" />
        <Skeleton className="h-14 sm:w-44" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default async function AdminOrganizationsPage({ searchParams }: PageProps<"/[locale]/admin/organizations">) {
  const [nav, t] = await Promise.all([getTranslations("nav"), getTranslations("admin.organizations")]);
  return (
    <>
      <PageHeader
        title={nav("sub.adminOrganizations")}
        description={t("description")}
        actions={
          <Link href="/admin/organizations/new" className={buttonVariants()}>
            <PlusIcon aria-hidden />
            {t("new")}
          </Link>
        }
      />
      <Suspense fallback={<OrganizationsListSkeleton />}>
        <OrganizationsList searchParams={searchParams} />
      </Suspense>
    </>
  );
}
