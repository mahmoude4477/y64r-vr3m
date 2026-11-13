import { BookOpenIcon, CopyIcon, FilePlus2Icon, LockIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { isOrgManager, scopeOf } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import { listOrgProtocols } from "@/lib/protocols/editor-queries";
import { requireOrgRole } from "@/lib/session";
import { cn } from "@/lib/utils";
import { ProtocolRow } from "./protocol-row";

/**
 * /org/protocols body (Suspense'd). Owners and admins of the active institution manage its own protocols (drafts too);
 * examiners see the published ones, read-only, linking to the library. Everyone else: not found.
 */
export async function OrgProtocols() {
  const ctx = await requireOrgRole(ORG_STAFF_ROLES);
  const scope = scopeOf(ctx);
  const manager = isOrgManager(scope);
  const [locale, t, tm, nav, format] = await Promise.all([
    getLocale(),
    getTranslations("protocols.org"),
    getTranslations("protocols.manage"),
    getTranslations("nav"),
    getFormatter(),
  ]);
  const rows = await listOrgProtocols(scope, locale);
  const drafts = rows.filter((r) => !r.isPublished).length;

  const actions = manager ? (
    <>
      <Link href="/org/protocols/copy" className={cn(buttonVariants(), "h-9")}>
        <CopyIcon aria-hidden />
        {t("copy")}
      </Link>
      <Link href="/org/protocols/new" className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
        <FilePlus2Icon aria-hidden />
        {t("blank")}
      </Link>
    </>
  ) : undefined;

  return (
    <>
      <PageHeader title={nav("sub.orgProtocols")} description={manager ? t("description") : t("descriptionExaminer")} actions={actions} />
      {!manager && (
        <p className="-mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <LockIcon aria-hidden className="size-4 shrink-0" />
          {t("readOnly")}
        </p>
      )}
      {rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>
              <h2>{manager ? t("empty.title") : t("emptyExaminer.title")}</h2>
            </EmptyTitle>
            <EmptyDescription>{manager ? t("empty.description") : t("emptyExaminer.description")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {manager ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/org/protocols/copy" className={buttonVariants()}>
                  <CopyIcon aria-hidden />
                  {t("copy")}
                </Link>
                <Link href="/org/protocols/new" className={buttonVariants({ variant: "outline" })}>
                  <FilePlus2Icon aria-hidden />
                  {t("blank")}
                </Link>
              </div>
            ) : (
              <Link href="/protocols" className={buttonVariants({ variant: "outline" })}>
                {t("emptyExaminer.library")}
              </Link>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <section aria-labelledby="org-list-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="org-list-title" className="text-base font-semibold">
              {t("listTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{manager ? tm("summary", { total: rows.length, drafts }) : tm("count", { count: rows.length })}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <ProtocolRow
                key={row.id}
                href={manager ? `/org/protocols/${row.id}` : `/protocols/${row.slug}`}
                icon={row.icon}
                title={pick(row, "title", locale)}
                category={row.category}
                published={row.isPublished}
                meta={[
                  tm("steps", { count: row.steps }),
                  ...(row.scans > 0 ? [tm("scans", { count: row.scans })] : []),
                  tm("updated", { date: format.dateTime(row.updatedAt, "date") }),
                ]}
                note={row.source ? tm("basedOn", { title: pick(row.source, "title", locale) }) : tm("ownProtocol")}
                notice={row.newerSource ? tm("newerSource") : undefined}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function OrgProtocolsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
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
