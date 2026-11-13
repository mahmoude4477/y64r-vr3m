import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallbacks built on the same grids, paddings and control heights as the final layouts, at every width (no
 * layout shift when the data streams in, CONVENTIONS 9 / 11): a filter is a 14 px label over a 32 px select, a card
 * footer is a border and a 28 px button, the result header wraps its buttons on phones like the real one.
 */

function FilterSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex w-full flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-5 w-4/5" />
        </div>
      </div>
      {/* Three lines of intro (line-clamp-3, 14 px, relaxed). */}
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <div className="mt-auto flex border-t pt-3">
        <Skeleton className="h-7 w-24" />
      </div>
    </div>
  );
}

export function CatalogueSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <FilterSkeleton />
        <FilterSkeleton />
        <Skeleton className="h-8 w-32 justify-self-start" />
      </div>
      <Skeleton className="h-5 w-28" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex">
            <CardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayerSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-5 w-56" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
      <Skeleton className="h-9 w-44" />
    </div>
  );
}

export function ResultSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-5 w-56" />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-36" />
        </div>
      </div>
      {/* The risk tile carries a two- to four-line hint: taller on phones. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl sm:h-32 lg:h-36" />
        ))}
      </div>
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <Skeleton key={i} className="h-72 w-full rounded-xl" />
      ))}
    </div>
  );
}
