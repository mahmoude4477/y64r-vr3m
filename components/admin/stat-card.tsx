import { ArrowRightIcon, CircleAlertIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * One supporting figure. With `link` the label opens the records behind the figure (`link.label` is its accessible
 * name: it must contain the visible label, WCAG 2.5.3).
 */
export type StatRow = { label: string; value: string; tone?: "warning" | "danger"; link?: { href: `/${string}`; label: string } };

/** A headline number with a few supporting figures (overview of the admin panel). */
export function StatCard({
  title,
  icon: Icon,
  value,
  rows,
  link,
}: {
  title: string;
  icon: LucideIcon;
  value: string;
  rows: StatRow[];
  link?: { href: `/${string}`; label: string };
}) {
  return (
    <Card className="gap-3">
      <CardHeader className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon aria-hidden className="size-4" />
        </span>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          <h3>{title}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
        {/* Two columns sized to their content: each figure sits next to its label, not at the far edge of the card. */}
        <dl className="grid grid-cols-[minmax(0,max-content)_auto] gap-x-6 gap-y-1.5 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="col-span-2 grid grid-cols-subgrid items-baseline">
              <dt className="text-muted-foreground">
                {row.link ? (
                  <Link
                    href={row.link.href}
                    aria-label={row.link.label}
                    className="inline-flex min-h-6 items-center rounded-sm text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {row.label}
                  </Link>
                ) : (
                  row.label
                )}
              </dt>
              <dd
                className={cn(
                  "font-medium tabular-nums",
                  row.tone === "warning" && "text-[color-mix(in_oklab,var(--warning),var(--foreground)_40%)] dark:text-warning",
                  row.tone === "danger" && "text-destructive",
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
      {link && (
        <CardFooter className="py-2">
          <Link href={link.href} className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-primary hover:underline">
            {link.label}
            <ArrowRightIcon aria-hidden className="size-4 rtl:rotate-180" />
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}

export function StatCardSkeleton({ rows = 2, footer = false }: { rows?: number; footer?: boolean }) {
  return (
    <Card className="gap-3">
      <CardHeader className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-9 w-20" />
        <div className="grid gap-2">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </CardContent>
      {footer && (
        <CardFooter className="py-2">
          <Skeleton className="h-5 w-28" />
        </CardFooter>
      )}
    </Card>
  );
}

/** A card whose numbers could not be loaded (the rest of the overview still renders). */
export function StatCardUnavailable({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  const t = useTranslations("common.states");
  return (
    <Card className="gap-3">
      <CardHeader className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon aria-hidden className="size-4" />
        </span>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          <h3>{title}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-start gap-2 text-sm text-muted-foreground">
        <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>{t("errorDescription")}</p>
      </CardContent>
    </Card>
  );
}
