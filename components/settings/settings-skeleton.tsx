import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function SectionSkeleton({ rows, footer = false }: { rows: number; footer?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </CardContent>
      {footer && (
        <div className="flex justify-end border-t p-4">
          <Skeleton className="h-8 w-full sm:w-32" />
        </div>
      )}
    </Card>
  );
}

/** Suspense fallback of /settings: the five cards in their final order and roughly their final height. */
export function SettingsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </CardContent>
        <div className="flex justify-end border-t p-4">
          <Skeleton className="h-8 w-full sm:w-32" />
        </div>
      </Card>
      <SectionSkeleton rows={1} />
      <SectionSkeleton rows={1} />
      <SectionSkeleton rows={3} footer />
      <SectionSkeleton rows={2} />
    </div>
  );
}
