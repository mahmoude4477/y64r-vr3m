import { Skeleton } from "@/components/ui/skeleton";

/** The new-scan form's final layout while it streams: the details card, the photos card, the actions. */
export function NewScanSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-5 rounded-xl p-4 ring-1 ring-foreground/10">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-full sm:h-9" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-5 rounded-xl p-4 ring-1 ring-foreground/10">
        <Skeleton className="h-5 w-24" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Skeleton className="h-11 sm:h-9 sm:w-32" />
          <Skeleton className="h-11 sm:h-9 sm:w-28" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="flex gap-2 md:justify-end">
        <Skeleton className="h-11 flex-1 md:h-9 md:w-24 md:flex-none" />
        <Skeleton className="h-11 flex-[2] md:h-9 md:w-40 md:flex-none" />
      </div>
    </div>
  );
}
