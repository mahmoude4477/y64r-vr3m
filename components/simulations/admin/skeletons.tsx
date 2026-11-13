import { Skeleton } from "@/components/ui/skeleton";

/** Suspense fallbacks of the admin scenario pages, shaped like the final layouts (no layout shift). */

export function AdminListSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex justify-end">
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-full" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[3.25rem] w-full" />
          ))}
        </div>
      </div>
      <Skeleton className="h-5 w-40" />
      <div className="flex flex-col divide-y rounded-xl border bg-card">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-start gap-3 p-4">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminFormSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-5 w-56" />
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
          <Skeleton className="h-5 w-36" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, j) => (
              <div key={j} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
