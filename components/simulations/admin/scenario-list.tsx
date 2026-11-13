import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, FilterXIcon, GraduationCapIcon, PencilLineIcon, PlusIcon, SearchXIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Link } from "@/i18n/navigation";
import { type AdminListFilters, adminListQuery, DEFAULT_FILTERS, hasActiveFilters } from "@/lib/simulations/admin/list-filters";
import type { AdminScenarioList, AdminScenarioRow } from "@/lib/simulations/admin/queries";
import { cn } from "@/lib/utils";
import { DifficultyBadge } from "../scenario-meta";
import { OwnerLabel, PublishBadge, VersionBadge } from "./badges";
import { ScenarioListFilters } from "./list-filters";

/** The admin scenario list (server-rendered page of rows + client filters). One list for phones and desktops. */
export function AdminScenarioListView({ data, filters }: { data: AdminScenarioList; filters: AdminListFilters }) {
  const t = useTranslations("simulations.admin.list");
  const format = useFormatter();
  const filtered = hasActiveFilters(filters);

  if (data.total === 0 && !filtered) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GraduationCapIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t("empty.title")}</EmptyTitle>
          <EmptyDescription>{t("empty.description")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <NewButton />
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <NewButton />
      </div>
      <ScenarioListFilters filters={filters} protocols={data.protocols} />
      <section aria-labelledby="admin-scenarios-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="admin-scenarios-heading" className="text-base font-semibold">
            {t("heading")}
          </h2>
          <p className="text-sm text-muted-foreground" role="status">
            {t("filters.results", { count: data.total, n: format.number(data.total, "integer") })}
          </p>
        </div>
        {data.rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("noResults.title")}</EmptyTitle>
              <EmptyDescription>{t("noResults.description")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link href={`/admin/scenarios${adminListQuery(DEFAULT_FILTERS)}`} className={buttonVariants({ variant: "outline" })}>
                <FilterXIcon aria-hidden />
                {t("filters.clear")}
              </Link>
            </EmptyContent>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {data.rows.map((row) => (
              <li key={row.id}>
                <ScenarioRow row={row} />
              </li>
            ))}
          </ul>
        )}
        {data.pages > 1 && <Pager filters={filters} page={data.page} pages={data.pages} />}
      </section>
    </div>
  );
}

function NewButton() {
  const t = useTranslations("simulations.admin.list");
  return (
    <Link href="/admin/scenarios/new" className={buttonVariants()}>
      <PlusIcon aria-hidden />
      {t("new")}
    </Link>
  );
}

function ScenarioRow({ row }: { row: AdminScenarioRow }) {
  const t = useTranslations("simulations.admin.list.row");
  const format = useFormatter();
  const n = (value: number) => format.number(value, "integer");
  return (
    <article className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ProtocolIcon name={row.protocol.icon} className="size-4.5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{row.protocol.title}</span>
            <span aria-hidden>·</span>
            <OwnerLabel owner={row.owner} />
          </p>
          <h3 className="text-base leading-snug font-semibold text-balance">
            <Link
              href={`/admin/scenarios/${row.id}`}
              className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {row.title}
            </Link>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <PublishBadge published={row.isPublished} played={row.attempts > 0} />
            {row.version > 1 && <VersionBadge version={row.version} />}
            <DifficultyBadge level={row.difficulty} />
            {!row.protocol.isPublished && (
              <span className="text-xs text-[color-mix(in_oklab,var(--warning),var(--warning-foreground)_50%)] dark:text-warning">{t("protocolDraft")}</span>
            )}
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{t("stages", { count: row.stages, n: n(row.stages) })}</span>
            <span>{t("attempts", { count: row.attempts, n: n(row.attempts) })}</span>
            <span>{t("updated", { date: format.dateTime(row.updatedAt, "dateShort") })}</span>
            <bdi dir="ltr" className="font-mono">
              {row.slug}
            </bdi>
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 ps-12 sm:ps-0">
        <Link href={`/admin/scenarios/${row.id}`} className={buttonVariants({ variant: "outline" })}>
          <PencilLineIcon aria-hidden />
          {t("open")}
          <span className="sr-only">: {row.title}</span>
        </Link>
        <Link href={`/admin/scenarios/${row.id}/preview`} className={buttonVariants({ variant: "ghost" })}>
          <EyeIcon aria-hidden />
          {t("preview")}
          <span className="sr-only">: {row.title}</span>
        </Link>
      </div>
    </article>
  );
}

function Pager({ filters, page, pages }: { filters: AdminListFilters; page: number; pages: number }) {
  const t = useTranslations("simulations.admin.list.pagination");
  const format = useFormatter();
  const href = (p: number) => `/admin/scenarios${adminListQuery({ ...filters, page: p })}`;
  const link = buttonVariants({ variant: "outline" });
  return (
    <nav aria-label={t("label")} className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={link} rel="prev">
          <ChevronLeftIcon aria-hidden className="rtl:rotate-180" />
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted-foreground">
        {t("page", { page: format.number(page, "integer"), pages: format.number(pages, "integer") })}
      </p>
      {page < pages ? (
        <Link href={href(page + 1)} className={cn(link)} rel="next">
          {t("next")}
          <ChevronRightIcon aria-hidden className="rtl:rotate-180" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
