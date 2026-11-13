import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listHref, PAGE_SIZE, pageCount, pageWindow } from "@/lib/admin/params";
import { cn } from "@/lib/utils";

/** "Showing 21–40 of 312" + page links for an admin list. The other params of the list stay in every link. */
export function ListPagination({
  path,
  params,
  defaults,
  page,
  total,
  pageSize = PAGE_SIZE,
}: {
  path: `/${string}`;
  params: Record<string, string>;
  defaults: Record<string, string>;
  page: number;
  total: number;
  pageSize?: number;
}) {
  const t = useTranslations("admin.list");
  const format = useFormatter();
  const pages = pageCount(total, pageSize);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (p: number) => listHref(path, { ...params, page: p }, defaults);
  const n = (value: number) => format.number(value, "integer");

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-muted-foreground tabular-nums">
        {t("summary", { from: n(from), to: n(to), total: n(total) })}
      </p>
      {pages > 1 && (
        <nav aria-label={t("paginationLabel")}>
          <ul className="flex items-center gap-1">
            <li>
              {page > 1 ? (
                <Link href={href(page - 1)} className={buttonVariants({ variant: "ghost" })} aria-label={t("previousPage")}>
                  <ChevronLeftIcon aria-hidden className="rtl:rotate-180" />
                  <span className="hidden sm:inline">{t("previous")}</span>
                </Link>
              ) : (
                <span className={cn(buttonVariants({ variant: "ghost" }), "pointer-events-none text-muted-foreground")} aria-hidden>
                  <ChevronLeftIcon className="rtl:rotate-180" />
                  <span className="hidden sm:inline">{t("previous")}</span>
                </span>
              )}
            </li>
            {pageWindow(page, pages).map((item) =>
              item.kind === "gap" ? (
                <li key={item.key} aria-hidden className="hidden px-1 text-muted-foreground sm:block">
                  …
                </li>
              ) : (
                <li key={item.page} className={item.page === page ? undefined : "hidden sm:block"}>
                  <Link
                    href={href(item.page)}
                    aria-current={item.page === page ? "page" : undefined}
                    aria-label={t("page", { page: n(item.page) })}
                    className={cn(buttonVariants({ variant: item.page === page ? "outline" : "ghost", size: "icon" }), "tabular-nums")}
                  >
                    {n(item.page)}
                  </Link>
                </li>
              ),
            )}
            <li>
              {page < pages ? (
                <Link href={href(page + 1)} className={buttonVariants({ variant: "ghost" })} aria-label={t("nextPage")}>
                  <span className="hidden sm:inline">{t("next")}</span>
                  <ChevronRightIcon aria-hidden className="rtl:rotate-180" />
                </Link>
              ) : (
                <span className={cn(buttonVariants({ variant: "ghost" }), "pointer-events-none text-muted-foreground")} aria-hidden>
                  <span className="hidden sm:inline">{t("next")}</span>
                  <ChevronRightIcon className="rtl:rotate-180" />
                </span>
              )}
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}

/**
 * The one live region of an admin list (WCAG 4.1.3): "Showing 1–20 of 317", or the empty / no-results title. Render
 * it right after the filters in BOTH branches of the list (results and empty state), so it stays the same element
 * when a filter changes and screen readers hear the new count, also when nothing matches (the visible summary under
 * the table is not live: it is not there when the list is empty).
 */
export function ListStatus({
  page,
  total,
  shown,
  empty,
  pageSize = PAGE_SIZE,
}: {
  page: number;
  total: number;
  /** Rows on this page (0 shows `empty`). */
  shown: number;
  empty: string;
  pageSize?: number;
}) {
  const t = useTranslations("admin.list");
  const format = useFormatter();
  const n = (value: number) => format.number(value, "integer");
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <p role="status" className="sr-only">
      {shown === 0 ? empty : t("summary", { from: n(from), to: n(to), total: n(total) })}
    </p>
  );
}
