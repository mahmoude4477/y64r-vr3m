import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { libraryHref, type LibraryFilters, type ProtocolCategoryValue } from "@/lib/protocols/search";
import { cn } from "@/lib/utils";
import { PROTOCOL_CATEGORIES } from "@/lib/validation/protocol";

/**
 * Category chips: plain links that keep the search text, so filtering works without JavaScript and every
 * state has a URL. Categories with no matching protocol are left out (the selected one always shows).
 */
export function CategoryFilter({
  filters,
  counts,
  searchTotal,
}: {
  filters: LibraryFilters;
  counts: Record<ProtocolCategoryValue, number>;
  searchTotal: number;
}) {
  const t = useTranslations("protocols.library");
  const tc = useTranslations("common.category");
  const chips: Array<{ key: string; label: string; count: number; category: ProtocolCategoryValue | null }> = [
    { key: "all", label: t("allCategories"), count: searchTotal, category: null },
    ...PROTOCOL_CATEGORIES.filter((c) => counts[c] > 0 || filters.category === c).map((c) => ({
      key: c,
      label: tc(c),
      count: counts[c],
      category: c,
    })),
  ];
  return (
    <ul aria-label={t("categoriesLabel")} className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const selected = filters.category === chip.category;
        return (
          <li key={chip.key}>
            <Link
              href={libraryHref({ category: chip.category, q: filters.q })}
              scroll={false}
              aria-current={selected ? "true" : undefined}
              className={cn(
                buttonVariants({ variant: selected ? "default" : "outline", size: "default" }),
                "h-9 rounded-full px-3.5",
                selected && "hover:bg-primary",
              )}
            >
              {chip.label}
              {/* Selected: the button's own colour pair reversed (teal on near-white, the same contrast as the label),
                  not a translucent overlay, which left the small count below 4.5:1 in the light theme. */}
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-xs tabular-nums",
                  selected ? "bg-primary-foreground text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {chip.count}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
