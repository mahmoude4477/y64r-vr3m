import { Building2Icon, UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { queryString, type ReportView, reportViewQuery } from "@/lib/reports/filters";
import { cn } from "@/lib/utils";

/**
 * Switches between the institution report and "my results" (institution staff only). Links, not ARIA tabs: each
 * view is its own URL (?view=personal), rendered on the server; the current one carries aria-current. `filterQuery`
 * (filtersToQuery of the current filters) goes into both links, so a staff member who looks at "my results" comes
 * back to the same filtered report.
 */
export function ReportViewNav({
  view,
  institutionName,
  filterQuery,
}: {
  view: ReportView;
  institutionName: string;
  filterQuery: Record<string, string>;
}) {
  const t = useTranslations("reports.views");
  const items = [
    { key: "institution" as const, label: t("institution"), icon: Building2Icon },
    { key: "personal" as const, label: t("personal"), icon: UserIcon },
  ];
  return (
    <nav aria-label={t("label")} className="flex flex-wrap items-center gap-3 print:hidden">
      <div className="inline-flex rounded-lg bg-muted p-1">
        {items.map((item) => {
          const active = item.key === view;
          return (
            <Link
              key={item.key}
              href={`/reports${queryString(reportViewQuery(item.key, filterQuery))}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon aria-hidden className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
      {view === "institution" && institutionName && (
        <p className="min-w-0 truncate text-sm text-muted-foreground">
          <bdi>{institutionName}</bdi>
        </p>
      )}
    </nav>
  );
}
