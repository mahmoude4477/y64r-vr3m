import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholders shaped like the final report sections (no layout shift when the data streams in). */

export function CardSkeleton({ rows = 3, chart = false }: { rows?: number; chart?: boolean }) {
  return (
    <Card aria-hidden>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {chart ? (
          <Skeleton className="h-64 w-full sm:h-72" />
        ) : (
          Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)
        )}
      </CardContent>
    </Card>
  );
}

export function StatGridSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Card key={i} size="sm">
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function FiltersSkeleton() {
  return <Skeleton aria-hidden className="h-36 w-full rounded-xl sm:h-28" />;
}

/**
 * /reports while the session is read (a moment): only what every view starts with, the summary tiles and a chart
 * card. The view's own skeleton follows (InstitutionReportSkeleton or PersonalReportSkeleton).
 */
export function ReportsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <StatGridSkeleton />
      <CardSkeleton chart />
    </div>
  );
}

/** The view switch with the institution's name, and the export and print actions beside it. */
function ViewNavSkeleton({ actions }: { actions: boolean }) {
  return (
    <div aria-hidden className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="h-10 w-64 max-w-full rounded-lg" />
      {actions && (
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-32" />
        </div>
      )}
    </div>
  );
}

/** The institution report: view switch and actions, filters, the period line, tiles, trend, risk and gaps. */
export function InstitutionReportSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <ViewNavSkeleton actions />
      <FiltersSkeleton />
      <Skeleton aria-hidden className="h-4 w-72 max-w-full" />
      <StatGridSkeleton />
      <CardSkeleton chart />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <CardSkeleton rows={3} />
        <CardSkeleton rows={5} />
      </div>
    </div>
  );
}

/** "My results": the view switch only for institution staff, then tiles, trend beside the steps, the history. */
export function PersonalReportSkeleton({ withViewNav = false }: { withViewNav?: boolean }) {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      {withViewNav && <ViewNavSkeleton actions={false} />}
      <PersonalBodySkeleton />
    </div>
  );
}

function PersonalBodySkeleton() {
  return (
    <>
      <StatGridSkeleton />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <CardSkeleton chart />
        <CardSkeleton rows={4} />
      </div>
      <CardSkeleton rows={5} />
    </>
  );
}

/** One trainee's page (/reports/trainees/<id>): back link, name, badges and departments, the scope note, results. */
export function TraineeReportSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div aria-hidden className="flex flex-col gap-6">
        <Skeleton className="h-8 w-40" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-5 w-48 max-w-full" />
        </div>
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <PersonalBodySkeleton />
    </div>
  );
}

/** The print view: its buttons, the report details box, the tiles and the first sections. */
export function PrintReportSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div aria-hidden className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton aria-hidden className="h-40 w-full rounded-xl sm:h-28" />
      <StatGridSkeleton />
      <CardSkeleton rows={5} />
    </div>
  );
}
