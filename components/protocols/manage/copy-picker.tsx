import { ArrowLeftIcon, BookOpenIcon, CircleCheckIcon, FilePlus2Icon, FolderOpenIcon, GitBranchIcon, ListChecksIcon, OctagonAlertIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { scopeOf } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { ORG_MANAGER_ROLES } from "@/lib/permissions";
import { listCopyableProtocols } from "@/lib/protocols/editor-queries";
import { requireOrgRole } from "@/lib/session";
import { cn } from "@/lib/utils";
import { CategoryBadge } from "../protocol-badges";
import { CopyProtocolButton } from "./copy-button";

/** /org/protocols/copy body (Suspense'd, managers only): the published global protocols, each with a Copy button. */
export async function CopyPicker() {
  const ctx = await requireOrgRole(ORG_MANAGER_ROLES);
  const [locale, t, tp] = await Promise.all([getLocale(), getTranslations("protocols.org"), getTranslations("protocols.card")]);
  const rows = await listCopyableProtocols(scopeOf(ctx), locale);

  return (
    <>
      <BreadcrumbLabel label={t("copyPage.title")} />
      <div className="flex flex-col gap-3">
        <Link
          href="/org/protocols"
          className="inline-flex min-h-8 w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeftIcon aria-hidden className="size-4 rtl:rotate-180" />
          {t("back")}
        </Link>
        <PageHeader
          title={t("copyPage.title")}
          description={t("copyPage.description")}
          actions={
            <Link href="/org/protocols/new" className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
              <FilePlus2Icon aria-hidden />
              {t("blank")}
            </Link>
          }
        />
      </div>
      {rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>
              <h2>{t("copyPage.empty.title")}</h2>
            </EmptyTitle>
            <EmptyDescription>{t("copyPage.empty.description")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/org/protocols/new" className={buttonVariants({ variant: "outline" })}>
              <FilePlus2Icon aria-hidden />
              {t("blank")}
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <section aria-labelledby="copy-list-title" className="flex flex-col gap-3">
          <h2 id="copy-list-title" className="sr-only">
            {t("copyPage.listTitle")}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => {
              const title = pick(row, "title", locale);
              return (
                <li key={row.id} className="min-w-0">
                  <Card className="h-full gap-4 p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <ProtocolIcon name={row.icon} className="size-5" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <CategoryBadge category={row.category} />
                        <h3 className="text-base leading-snug font-semibold text-pretty">{title}</h3>
                      </div>
                    </div>
                    <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{pick(row, "summary", locale)}</p>
                    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <li className="flex items-center gap-1.5">
                        <ListChecksIcon aria-hidden className="size-3.5" />
                        {tp("steps", { count: row.steps.total })}
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CircleCheckIcon aria-hidden className="size-3.5 text-primary" />
                        {tp("mandatory", { count: row.steps.mandatory })}
                      </li>
                      {row.steps.critical > 0 && (
                        <li className="flex items-center gap-1.5">
                          <OctagonAlertIcon aria-hidden className="size-3.5 text-destructive" />
                          {tp("critical", { count: row.steps.critical })}
                        </li>
                      )}
                    </ul>
                    {row.copies > 0 && <p className="text-xs font-medium text-primary">{t("copyPage.copies", { count: row.copies })}</p>}
                    {/* Versions: an old version still published points at the newer one; a newer version says the
                        institution copied an older one (two cards with the same title are not left unexplained). */}
                    {row.newerVersion && (
                      <VersionLine>
                        {t.rich("copyPage.newerVersion", {
                          link: (chunks) => (
                            <Link
                              href={`/protocols/${row.newerVersion!.slug}`}
                              aria-label={t("copyPage.newerVersionLabel", { title: pick(row.newerVersion!, "title", locale) })}
                              className="font-medium text-primary underline underline-offset-4"
                            >
                              {chunks}
                            </Link>
                          ),
                        })}
                      </VersionLine>
                    )}
                    {row.olderVersionCopyId && (
                      <VersionLine>
                        {t.rich("copyPage.olderVersionCopy", {
                          link: (chunks) => (
                            <Link
                              href={`/org/protocols/${row.olderVersionCopyId}`}
                              aria-label={t("copyPage.olderVersionCopyLabel", { title })}
                              className="font-medium text-primary underline underline-offset-4"
                            >
                              {chunks}
                            </Link>
                          ),
                        })}
                      </VersionLine>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
                      {/* Already copied: open that copy; another one is a deliberate, confirmed second action. */}
                      {row.latestCopyId ? (
                        <>
                          <Link
                            href={`/org/protocols/${row.latestCopyId}`}
                            className={cn(buttonVariants(), "h-9")}
                            aria-label={t("copyPage.openCopyLabel", { title })}
                          >
                            <FolderOpenIcon aria-hidden />
                            {t("copyPage.openCopy")}
                          </Link>
                          <CopyProtocolButton sourceProtocolId={row.id} title={title} again />
                        </>
                      ) : (
                        <CopyProtocolButton sourceProtocolId={row.id} title={title} />
                      )}
                      <Link
                        href={`/protocols/${row.slug}`}
                        className={cn(buttonVariants({ variant: "ghost" }), "h-9")}
                        aria-label={t("copyPage.previewLabel", { title })}
                      >
                        {t("copyPage.preview")}
                      </Link>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function VersionLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-lg bg-secondary/60 p-2.5 text-xs leading-relaxed">
      <GitBranchIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <span>{children}</span>
    </p>
  );
}

export function CopyPickerSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
