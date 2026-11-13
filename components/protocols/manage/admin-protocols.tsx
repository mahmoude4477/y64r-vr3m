import { BookPlusIcon, Building2Icon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon, SearchXIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/i18n-content";
import {
  countInstitutionProtocols,
  type InstitutionProtocolPage,
  listGlobalProtocols,
  listInstitutionProtocols,
  type ProtocolRow as Row,
} from "@/lib/protocols/editor-queries";
import { requireContentEditor } from "@/lib/session";
import { cn } from "@/lib/utils";
import { ProtocolRow } from "./protocol-row";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type View = "global" | "institutions";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** URL state of /admin/protocols: ?view=institutions&q=…&page=2 (anything unknown falls back to the defaults). */
export function parseAdminListParams(params: Record<string, string | string[] | undefined>): { view: View; q: string; page: number } {
  const view: View = first(params.view) === "institutions" ? "institutions" : "global";
  const q = first(params.q).trim().slice(0, 100);
  const page = Number.parseInt(first(params.page), 10);
  return { view, q, page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1 };
}

function listHref(input: { view: View; q?: string; page?: number }) {
  const sp = new URLSearchParams();
  if (input.view === "institutions") sp.set("view", "institutions");
  if (input.q) sp.set("q", input.q);
  if (input.page && input.page > 1) sp.set("page", String(input.page));
  const qs = sp.toString();
  return qs ? `/admin/protocols?${qs}` : "/admin/protocols";
}

/** /admin/protocols body (Suspense'd): the global protocols, or the institutions' ones (read-only). */
export async function AdminProtocols({ searchParams }: { searchParams: SearchParams }) {
  await requireContentEditor();
  const [params, locale, t] = await Promise.all([searchParams, getLocale(), getTranslations("protocols.admin")]);
  const { view, q, page } = parseAdminListParams(params);
  const [globals, institutionTotal] = await Promise.all([listGlobalProtocols(locale), countInstitutionProtocols()]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={t("views.label")}>
          <ul className="flex flex-wrap gap-2">
            {(
              [
                { key: "global", label: t("views.global"), count: globals.length },
                { key: "institutions", label: t("views.institutions"), count: institutionTotal },
              ] as const
            ).map((tab) => {
              const current = tab.key === view;
              return (
                <li key={tab.key}>
                  <Link
                    href={listHref({ view: tab.key })}
                    scroll={false}
                    aria-current={current ? "page" : undefined}
                    className={cn(buttonVariants({ variant: current ? "default" : "outline" }), "h-9 rounded-full px-3.5", current && "hover:bg-primary")}
                  >
                    {tab.label}
                    <span
                      className={cn(
                        "min-w-5 rounded-full px-1.5 text-xs tabular-nums",
                        current ? "bg-primary-foreground text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {tab.count}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {view === "global" && (
          <Link href="/admin/protocols/new" className={cn(buttonVariants(), "h-9 w-fit")}>
            <PlusIcon aria-hidden />
            {t("new")}
          </Link>
        )}
      </div>
      {view === "global" ? (
        <GlobalList rows={globals} />
      ) : (
        <InstitutionList data={await listInstitutionProtocols({ q, page })} q={q} total={institutionTotal} />
      )}
    </div>
  );
}

async function GlobalList({ rows }: { rows: Row[] }) {
  const [t, tm, format, locale] = await Promise.all([
    getTranslations("protocols.admin"),
    getTranslations("protocols.manage"),
    getFormatter(),
    getLocale(),
  ]);
  if (rows.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookPlusIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>
            <h2>{t("global.empty.title")}</h2>
          </EmptyTitle>
          <EmptyDescription>{t("global.empty.description")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/admin/protocols/new" className={buttonVariants()}>
            <PlusIcon aria-hidden />
            {t("new")}
          </Link>
        </EmptyContent>
      </Empty>
    );
  }
  const drafts = rows.filter((r) => !r.isPublished).length;
  return (
    <section aria-labelledby="global-list-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="global-list-title" className="text-base font-semibold">
          {t("views.global")}
        </h2>
        <p className="text-sm text-muted-foreground">{tm("summary", { total: rows.length, drafts })}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <ProtocolRow
            key={row.id}
            href={`/admin/protocols/${row.id}`}
            icon={row.icon}
            title={pick(row, "title", locale)}
            category={row.category}
            published={row.isPublished}
            meta={[
              tm("steps", { count: row.steps }),
              ...(row.scans > 0 ? [tm("scans", { count: row.scans })] : []),
              ...(row.copies > 0 ? [tm("copies", { count: row.copies })] : []),
              tm("updated", { date: format.dateTime(row.updatedAt, "date") }),
            ]}
            note={
              <bdi dir="ltr" className="font-mono">
                /protocols/{row.slug}
              </bdi>
            }
          />
        ))}
      </ul>
    </section>
  );
}

async function InstitutionList({ data, q, total }: { data: InstitutionProtocolPage; q: string; total: number }) {
  const [t, tm, tc, format, locale] = await Promise.all([
    getTranslations("protocols.admin.institutions"),
    getTranslations("protocols.manage"),
    getTranslations("common.actions"),
    getFormatter(),
    getLocale(),
  ]);
  if (total === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2Icon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>
            <h2>{t("empty.title")}</h2>
          </EmptyTitle>
          <EmptyDescription>{t("empty.description")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const orgName = (o: { name: string; nameEn: string | null }) => (locale === "en" && o.nameEn ? o.nameEn : o.name);
  return (
    <section aria-labelledby="institution-list-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="institution-list-title" className="text-base font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("note")}</p>
      </div>
      <form role="search" action="" method="get" className="flex w-full gap-2 sm:max-w-md">
        <input type="hidden" name="view" value="institutions" />
        <label htmlFor="institution-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <Input id="institution-search" type="search" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="h-9" />
        <button type="submit" className={cn(buttonVariants({ variant: "outline" }), "h-9 shrink-0")}>
          <SearchIcon aria-hidden />
          {tc("search")}
        </button>
      </form>
      <p role="status" className="text-sm text-muted-foreground">
        {q ? t("results", { count: data.total }) : tm("count", { count: data.total })}
      </p>
      {data.rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>
              <h3>{t("noResults", { q })}</h3>
            </EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Link href={listHref({ view: "institutions" })} className={buttonVariants({ variant: "outline" })}>
              {t("clear")}
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.rows.map((row) => (
            <ProtocolRow
              key={row.id}
              href={`/admin/protocols/${row.id}`}
              icon={row.icon}
              title={pick(row, "title", locale)}
              category={row.category}
              published={row.isPublished}
              meta={[
                tm("steps", { count: row.steps }),
                ...(row.scans > 0 ? [tm("scans", { count: row.scans })] : []),
                tm("updated", { date: format.dateTime(row.updatedAt, "date") }),
              ]}
              note={
                <>
                  {tm("institution", { name: orgName(row.organization) })}
                  {row.source && (
                    <>
                      {" · "}
                      {tm("basedOn", { title: pick(row.source, "title", locale) })}
                    </>
                  )}
                </>
              }
            />
          ))}
        </ul>
      )}
      {data.pages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
          {data.page > 1 ? (
            <Link href={listHref({ view: "institutions", q, page: data.page - 1 })} className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
              <ChevronLeftIcon aria-hidden className="rtl:rotate-180" />
              {tc("previous")}
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm text-muted-foreground tabular-nums">{t("page", { page: String(data.page), pages: String(data.pages) })}</p>
          {data.page < data.pages ? (
            <Link href={listHref({ view: "institutions", q, page: data.page + 1 })} className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
              {tc("next")}
              <ChevronRightIcon aria-hidden className="rtl:rotate-180" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}

export function ManageListSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-9 w-40 rounded-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-5 w-48" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
