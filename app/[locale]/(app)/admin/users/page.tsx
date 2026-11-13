import { SearchXIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ListEmpty } from "@/components/admin/list-empty";
import { ListFilters } from "@/components/admin/list-filters";
import { ListPagination, ListStatus } from "@/components/admin/list-pagination";
import { UsersTable } from "@/components/admin/users-table";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { parseChoice, parsePage, parseQuery, type RawSearchParams } from "@/lib/admin/params";
import { listUsers, USER_ROLE_FILTERS, USER_STATUS_FILTERS } from "@/lib/admin/queries";
import { adminMetadata } from "@/lib/admin/metadata";
import { requirePlatformAdmin } from "@/lib/session";

// /admin/users: every account on the platform, searchable by name or e-mail, filtered by platform role and status,
// 20 per page. The URL holds the filters (?q=&role=&status=&page=).

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations("nav");
  return adminMetadata(nav("sub.adminUsers"));
}

const DEFAULTS = { role: "all", status: "all" };

async function UsersList({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const ctx = await requirePlatformAdmin();
  const raw = await searchParams;
  const filters = {
    q: parseQuery(raw.q),
    role: parseChoice(raw.role, USER_ROLE_FILTERS, "all"),
    status: parseChoice(raw.status, USER_STATUS_FILTERS, "all"),
    page: parsePage(raw.page),
  };
  const [t, { users, total, page }] = await Promise.all([getTranslations("admin.users"), listUsers(filters)]);
  const filtered = filters.q !== "" || filters.role !== "all" || filters.status !== "all";

  return (
    <div className="flex flex-col gap-4">
      <ListFilters
        path="/admin/users"
        label={t("filtersLabel")}
        searchLabel={t("search")}
        searchPlaceholder={t("searchPlaceholder")}
        query={filters.q}
        selects={[
          {
            name: "role",
            label: t("role"),
            value: filters.role,
            defaultValue: "all",
            options: USER_ROLE_FILTERS.map((v) => ({ value: v, label: t(`roleOptions.${v}`) })),
          },
          {
            name: "status",
            label: t("status"),
            value: filters.status,
            defaultValue: "all",
            options: USER_STATUS_FILTERS.map((v) => ({ value: v, label: t(`statusOptions.${v}`) })),
          },
        ]}
      />
      <ListStatus page={page} total={total} shown={users.length} empty={filtered ? t("noResults.title") : t("empty.title")} />
      {users.length === 0 ? (
        filtered ? (
          <ListEmpty icon={SearchXIcon} title={t("noResults.title")} description={t("noResults.description")} />
        ) : (
          <ListEmpty icon={UsersIcon} title={t("empty.title")} description={t("empty.description")} />
        )
      ) : (
        <>
          <UsersTable users={users} viewerId={ctx.user.id} />
          <ListPagination
            path="/admin/users"
            params={{ q: filters.q, role: filters.role, status: filters.status }}
            defaults={DEFAULTS}
            page={page}
            total={total}
          />
        </>
      )}
    </div>
  );
}

function UsersListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Skeleton className="h-14 w-full sm:max-w-md" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Skeleton className="h-14 sm:w-44" />
          <Skeleton className="h-14 sm:w-44" />
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

export default async function AdminUsersPage({ searchParams }: PageProps<"/[locale]/admin/users">) {
  const [nav, t] = await Promise.all([getTranslations("nav"), getTranslations("admin.users")]);
  return (
    <>
      <PageHeader title={nav("sub.adminUsers")} description={t("description")} />
      <Suspense fallback={<UsersListSkeleton />}>
        <UsersList searchParams={searchParams} />
      </Suspense>
    </>
  );
}
