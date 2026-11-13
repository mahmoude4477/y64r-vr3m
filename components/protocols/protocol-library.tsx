import { BookOpenIcon, SearchXIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { scopeOf } from "@/lib/authz";
import { getProtocolLibrary } from "@/lib/protocols/queries";
import { parseLibraryFilters } from "@/lib/protocols/search";
import { requireUser } from "@/lib/session";
import { CategoryFilter } from "./category-filter";
import { LibrarySearch } from "./library-search";
import { ProtocolCard } from "./protocol-card";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The library body (Suspense'd): session, URL filters, one query, then filters in memory (lib/protocols/search). */
export async function ProtocolLibrary({ searchParams }: { searchParams: SearchParams }) {
  const [ctx, params, locale] = await Promise.all([requireUser(), searchParams, getLocale()]);
  const filters = parseLibraryFilters(params);
  const library = await getProtocolLibrary(scopeOf(ctx), filters, locale);
  const t = await getTranslations("protocols.library");
  const tStates = await getTranslations("common.states");

  if (library.total === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>
            <h2>{t("empty.title")}</h2>
          </EmptyTitle>
          <EmptyDescription>{t("empty.description")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const filtered = filters.q !== "" || filters.category !== null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 print:hidden">
        <LibrarySearch q={filters.q} category={filters.category} />
        <CategoryFilter filters={filters} counts={library.categoryCounts} searchTotal={library.searchTotal} />
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {filtered ? t("filteredCount", { shown: String(library.items.length), total: library.total }) : t("count", { total: library.total })}
      </p>
      {library.items.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>
              <h2>{tStates("noResults")}</h2>
            </EmptyTitle>
            <EmptyDescription>
              {filters.q ? t("noResults.description", { q: filters.q }) : t("noResults.descriptionCategory")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/protocols" scroll={false} className={buttonVariants({ variant: "outline" })}>
              {t("noResults.clear")}
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {library.items.map((card) => (
            <li key={card.id} className="min-w-0">
              <ProtocolCard card={card} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProtocolLibrarySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full sm:max-w-md" />
        <div className="flex flex-wrap gap-2">
          {[16, 20, 18, 22].map((w) => (
            <Skeleton key={w} className="h-9 rounded-full" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
      </div>
      <Skeleton className="h-5 w-28" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
            <div className="flex items-start gap-3">
              <Skeleton className="size-11 rounded-lg" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <Skeleton className="mt-2 h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
