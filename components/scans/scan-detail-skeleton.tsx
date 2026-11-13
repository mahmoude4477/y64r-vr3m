import { Skeleton } from "@/components/ui/skeleton";

/** /scans/[id] while it streams: the title, the photos, the checklist and the side summary of the final layout. */
export function ScanDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-20 max-w-full" />
                <Skeleton className="h-4 w-40 max-w-full" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 2 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-6 w-32" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
              <div className="flex gap-3">
                <Skeleton className="size-7 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
              <Skeleton className="h-16 w-full rounded-lg" />
              <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
                {Array.from({ length: 3 }, (_, j) => (
                  <Skeleton key={j} className="h-11 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-24" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
          <Skeleton className="hidden h-11 w-full lg:block" />
        </div>
      </div>
    </div>
  );
}
