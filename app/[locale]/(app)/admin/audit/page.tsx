import { ScrollTextIcon, SearchXIcon, UserRoundIcon, XIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuditList } from "@/components/admin/audit-list";
import { ListEmpty } from "@/components/admin/list-empty";
import { ListFilters } from "@/components/admin/list-filters";
import { ListPagination, ListStatus } from "@/components/admin/list-pagination";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { organizationOptions } from "@/lib/admin/assessment-queries";
import { auditActionKey } from "@/lib/admin/audit-display";
import { AUDIT_PAGE_SIZE, auditParams, isAuditFiltered, parseAuditFilters } from "@/lib/admin/audit-filters";
import { auditActions, auditActorName, listAudit } from "@/lib/admin/audit-queries";
import { orgNames } from "@/lib/admin/display";
import { listHref, type RawSearchParams } from "@/lib/admin/params";
import { adminMetadata } from "@/lib/admin/metadata";
import { requirePlatformAdmin } from "@/lib/session";

// /admin/audit (PRODUCT 6a): who did what, newest first: the admin panel's own writes, Better Auth's admin and
// institution endpoints (audited by lib/auth.ts) and the other features' audited actions. Filters: action, actor (name
// or a link from a user's page), institution and day range; 25 per page. Deleted actors follow the CONVENTIONS 6
// display rule; meta is shown as text.

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations("nav");
  return adminMetadata(nav("sub.adminAudit"));
}

const PATH = "/admin/audit";
const ALL = "all";
const DEFAULTS = { action: ALL, org: ALL };

async function AuditLog({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  await requirePlatformAdmin();
  const filters = parseAuditFilters(await searchParams);
  const [t, activity, locale] = await Promise.all([getTranslations("admin.audit"), getTranslations("admin.activity"), getLocale()]);
  const actions = await auditActions();
  const organizations = await organizationOptions();
  const actorName = filters.actor ? await auditActorName(filters.actor) : null;
  const { entries, total, page } = await listAudit(filters);

  const actionLabel = (code: string) => {
    const key = auditActionKey(code);
    return key ? activity(`actions.${key}`) : code;
  };
  const actionOptions = [
    { value: ALL, label: t("allActions") },
    ...actions
      .map((a) => ({ value: a.action, label: actionLabel(a.action) }))
      .sort((a, b) => a.label.localeCompare(b.label, locale)),
  ];
  // Two codes can share a label ("auth.organization.update" and "organization.update"): add the code to tell them apart.
  const seen = new Map<string, number>();
  for (const o of actionOptions) seen.set(o.label, (seen.get(o.label) ?? 0) + 1);
  for (const o of actionOptions) if (o.value !== ALL && (seen.get(o.label) ?? 0) > 1) o.label = `${o.label} (${o.value})`;
  if (filters.action && !actionOptions.some((o) => o.value === filters.action)) {
    actionOptions.push({ value: filters.action, label: actionLabel(filters.action) });
  }
  const orgOptions = [
    { value: ALL, label: t("allInstitutions") },
    ...organizations.map((o) => ({ value: o.id, label: orgNames(o, locale).primary })),
  ];
  if (filters.org && !orgOptions.some((o) => o.value === filters.org)) orgOptions.push({ value: filters.org, label: t("selectedInstitution") });

  return (
    <div className="flex flex-col gap-4">
      {filters.actor && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-1 ps-3 pe-1 text-primary ring-1 ring-primary/20">
            <UserRoundIcon aria-hidden className="size-4" />
            {actorName ? t("actorChip", { name: actorName }) : t("actorChipDeleted")}
            <Link
              href={listHref(PATH, { ...auditParams(filters), actor: null }, DEFAULTS)}
              aria-label={t("actorChipClear")}
              className="inline-flex size-7 items-center justify-center rounded-full hover:bg-primary/15"
            >
              <XIcon aria-hidden className="size-4" />
            </Link>
          </span>
        </div>
      )}
      <ListFilters
        path={PATH}
        label={t("filtersLabel")}
        searchLabel={t("search")}
        searchPlaceholder={t("searchPlaceholder")}
        query={filters.q}
        dates={{ from: filters.from, to: filters.to }}
        keep={{ actor: filters.actor }}
        selects={[
          { name: "action", label: t("action"), value: filters.action || ALL, defaultValue: ALL, options: actionOptions },
          { name: "org", label: t("institution"), value: filters.org || ALL, defaultValue: ALL, options: orgOptions },
        ]}
      />
      <ListStatus page={page} total={total} shown={entries.length} empty={isAuditFiltered(filters) ? t("noResults.title") : t("empty.title")} pageSize={AUDIT_PAGE_SIZE} />
      {entries.length === 0 ? (
        isAuditFiltered(filters) ? (
          <ListEmpty icon={SearchXIcon} title={t("noResults.title")} description={t("noResults.description")} />
        ) : (
          <ListEmpty icon={ScrollTextIcon} title={t("empty.title")} description={t("empty.description")} />
        )
      ) : (
        <>
          <AuditList rows={entries} />
          <ListPagination path={PATH} params={auditParams(filters)} defaults={DEFAULTS} page={page} total={total} pageSize={AUDIT_PAGE_SIZE} />
        </>
      )}
    </div>
  );
}

function AuditSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Skeleton className="h-14 w-full sm:max-w-md" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Skeleton className="h-14 sm:w-44" />
          <Skeleton className="h-14 sm:w-44" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/[locale]/admin/audit">) {
  const [nav, t] = await Promise.all([getTranslations("nav"), getTranslations("admin.audit")]);
  return (
    <>
      <PageHeader title={nav("sub.adminAudit")} description={t("description")} />
      <Suspense fallback={<AuditSkeleton />}>
        <AuditLog searchParams={searchParams} />
      </Suspense>
    </>
  );
}
