import { Skeleton } from "@/components/ui/skeleton";

/** The list's final layout while it streams: search + filters, then table rows or cards (the same 44rem container query as ScanList). */
export function ScanListSkeleton() {
  return (
    <div className="@container flex flex-col gap-4" aria-hidden>
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-24 md:hidden" />
      </div>
      <div className="hidden gap-3 md:flex">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex w-44 flex-col gap-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-4 w-20" />
      <div className="hidden flex-col gap-px overflow-hidden rounded-xl ring-1 ring-foreground/10 @min-[44rem]:flex">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-none" />
        ))}
      </div>
      <div className="flex flex-col gap-3 @min-[44rem]:hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
