import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Placeholders shaped like the dashboard's final cards, so nothing jumps when the data streams in. */

export function WelcomeSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  );
}

/**
 * A tile row: `count` tiles. `wideFirst` is the personal row: the first tile spans the row on phones and two of five
 * columns on a large screen (PersonalStats).
 */
export function TilesSkeleton({ count = 4, wideFirst = false }: { count?: number; wideFirst?: boolean }) {
  return (
    <div aria-hidden className={cn("grid gap-3", wideFirst ? "grid-cols-3 lg:grid-cols-5" : "grid-cols-2 lg:grid-cols-4")}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} size="sm" className={cn(wideFirst && i === 0 && "col-span-3 lg:col-span-2")}>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-3 w-24 max-w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** "This month" on the institution dashboard: a heading row and four tiles. */
export function MonthSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-4 w-24" />
      </div>
      <TilesSkeleton />
    </div>
  );
}

/** A card with a title, a description and `rows` list rows (two text lines and a badge each). */
export function ListCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card aria-hidden>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-60 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** A featured card (the recommended scenario, the top gap): a title, two text lines and a button. */
export function FeatureCardSkeleton() {
  return (
    <Card aria-hidden>
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-8 w-40" />
      </CardContent>
    </Card>
  );
}

/** The whole dashboard while the session and the first numbers load (shared by every role). */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <WelcomeSkeleton />
      <TilesSkeleton />
      <div className="grid gap-6 xl:grid-cols-2">
        <ListCardSkeleton />
        <FeatureCardSkeleton />
      </div>
    </div>
  );
}
