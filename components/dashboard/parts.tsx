import { ArrowRightIcon, MinusIcon, ShieldCheckIcon, TrendingDownIcon, TrendingUpIcon, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { directionOf } from "@/lib/dashboard/periods";
import { sparklineGeometry } from "@/lib/dashboard/sparkline";
import { cn } from "@/lib/utils";
import { CardBoundary } from "./card-boundary";

/** Building blocks shared by the personal and the institution dashboards. */

/**
 * One dashboard card: its own error boundary (a failing query breaks only this card) and its own Suspense boundary
 * with a skeleton of the final card, so the cards stream in independently and in parallel.
 */
export function DashboardSection({
  id,
  title,
  fallback,
  children,
}: {
  id: string;
  title: string;
  fallback: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <CardBoundary id={id} title={title}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </CardBoundary>
  );
}

export type QuickAction = { href: string; label: string; icon: LucideIcon; primary?: boolean };

/** The greeting line and the shortcuts a role uses most (the first one is the primary action). */
export async function WelcomeBar({ name, context, actions }: { name: string; context: string; actions: readonly QuickAction[] }) {
  const t = await getTranslations("dashboard");
  const trimmed = name.trim();
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-lg font-medium text-pretty">
          {trimmed
            ? t.rich("welcome.greeting", { name: trimmed, who: (chunks) => <bdi>{chunks}</bdi> })
            : t("welcome.greetingNoName")}
        </p>
        {context && <p className="text-sm text-muted-foreground text-pretty">{context}</p>}
      </div>
      {actions.length > 0 && (
        <nav aria-label={t("quick.label")} className="print:hidden">
          <ul className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <li key={action.href}>
                {/* cn() merges the variant's classes: without it the outline border lost to border-transparent. */}
                <Link href={action.href} className={cn(buttonVariants({ variant: action.primary ? "default" : "outline" }))}>
                  <action.icon aria-hidden />
                  {action.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/**
 * A headline number: label, value, then up to two short lines under it. `aside` (a sparkline, a link) sits beside
 * that text on a wide tile and wraps under it when the tile is narrow.
 */
export function KpiTile({
  label,
  value,
  badge,
  hint,
  note,
  aside,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  badge?: React.ReactNode;
  hint?: React.ReactNode;
  note?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  const main = (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>
        {badge}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  );
  return (
    <Card size="sm" className={cn("min-w-0", className)}>
      <CardContent className="h-full">
        {aside ? (
          <div className="flex h-full flex-wrap items-end justify-between gap-x-4 gap-y-2">
            {main}
            <div className="flex flex-col items-start gap-1 sm:items-end">{aside}</div>
          </div>
        ) : (
          main
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A change in points as an arrow icon plus words (never color alone). The text stays in the muted color for
 * contrast; only the icon carries the tone.
 */
export function ChangeNote({ change, up, down, same }: { change: number; up: string; down: string; same: string }) {
  const direction = directionOf(change);
  const Icon = direction === "up" ? TrendingUpIcon : direction === "down" ? TrendingDownIcon : MinusIcon;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon
        aria-hidden
        className={cn(
          "size-3.5 shrink-0 rtl:-scale-x-100",
          direction === "up" && "text-success",
          direction === "down" && "text-destructive",
        )}
      />
      {direction === "up" ? up : direction === "down" ? down : same}
    </span>
  );
}

const SPARK = { width: 120, height: 32, padding: 3 } as const;

/** The last scores as a small line (decoration: the caller gives the values in words too). */
export function Sparkline({ scores, rtl }: { scores: readonly number[]; rtl: boolean }) {
  const geometry = sparklineGeometry(scores, SPARK, { rtl });
  if (!geometry) return null;
  return (
    <svg
      aria-hidden
      focusable="false"
      width={SPARK.width}
      height={SPARK.height}
      viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}
      className="overflow-visible print:hidden"
    >
      <path d={geometry.area} className="fill-primary/10" />
      <path d={geometry.line} className="fill-none stroke-primary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={geometry.last.x} cy={geometry.last.y} r={3} className="fill-primary" />
    </svg>
  );
}

/** Platform admins: a way into /admin (shown above their own dashboard). */
export async function AdminCard() {
  const t = await getTranslations("dashboard.admin");
  return (
    <section
      aria-labelledby="dash-admin-title"
      className="flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 sm:flex-row sm:items-center"
    >
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <ShieldCheckIcon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id="dash-admin-title" className="font-heading text-base font-medium">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">{t("description")}</p>
      </div>
      <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }), "self-start sm:self-center")}>
        {t("open")}
        <ArrowRightIcon aria-hidden className="rtl:rotate-180" />
      </Link>
    </section>
  );
}

/** A small text link with an arrow (card footers and "view all" actions). */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ArrowRightIcon aria-hidden className="size-4 rtl:rotate-180" />
    </Link>
  );
}
