import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { PageInfo } from "@/lib/reports/aggregate";
import { cn } from "@/lib/utils";

/** Previous / next links for a server-paged list (the page number lives in the URL). Hidden when there is one page. */
export function Pager({ info, href, label }: { info: PageInfo; href: (page: number) => string; label: string }) {
  const t = useTranslations("reports.pager");
  const format = useFormatter();
  if (info.pageCount <= 1) return null;
  const prev = info.page > 1 ? info.page - 1 : null;
  const next = info.page < info.pageCount ? info.page + 1 : null;
  const linkClass = cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-8");
  return (
    <nav aria-label={label} className="mt-4 flex items-center justify-between gap-2 print:hidden">
      {prev ? (
        <Link href={href(prev)} className={linkClass} scroll={false}>
          <ChevronLeftIcon aria-hidden className="rtl:rotate-180" />
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted-foreground tabular-nums">
        {t("status", { page: format.number(info.page, "integer"), pages: format.number(info.pageCount, "integer") })}
      </p>
      {next ? (
        <Link href={href(next)} className={linkClass} scroll={false}>
          {t("next")}
          <ChevronRightIcon aria-hidden className="rtl:rotate-180" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
