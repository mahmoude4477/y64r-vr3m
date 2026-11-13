import { CameraIcon, CircleCheckIcon, GraduationCapIcon, InfoIcon, ListChecksIcon, OctagonAlertIcon, ScanLineIcon } from "lucide-react";
import { notFound } from "next/navigation";
import type { Locale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { isOrgStaff, scopeOf } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { getProtocolDetail, getReadableSource, getTrainingScenarios, type ProtocolSource } from "@/lib/protocols/queries";
import { summarizeSteps } from "@/lib/protocols/steps";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { PrintButton } from "./print-button";
import { CategoryBadge, CriticalBadge, MandatoryBadge, OwnProtocolBadge, VisualCheckBadge, WeightBadge } from "./protocol-badges";
import { StepList } from "./step-list";
import { TrainingScenarios } from "./training-scenarios";

/**
 * Protocol detail body (Suspense'd). Not found -- also for unpublished protocols and other institutions' ones --
 * renders the localized not-found page. The scan action is for staff of the active institution only.
 */
export async function ProtocolDetailView({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, ctx, locale] = await Promise.all([params, requireUser(), getLocale()]);
  const scope = scopeOf(ctx);
  const protocol = await getProtocolDetail(scope, slug);
  if (!protocol) notFound();

  const [source, training, t, tc] = await Promise.all([
    getReadableSource(scope, protocol.sourceProtocolId),
    getTrainingScenarios(scope, protocol.id, protocol.sourceProtocolId),
    getTranslations("protocols"),
    getTranslations("common"),
  ]);
  const title = pick(protocol, "title", locale);
  const own = protocol.organizationId !== null && protocol.organizationId === scope.organizationId;
  const summary = summarizeSteps(protocol.steps);
  const canScan = isOrgStaff(scope);
  const canTrain = training.scenarios.length > 0;

  return (
    <article className="flex flex-col gap-6" aria-labelledby="protocol-title">
      <BreadcrumbLabel label={title} />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary print:hidden">
            <ProtocolIcon name={protocol.icon} className="size-6" />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryBadge category={protocol.category} />
              {own && <OwnProtocolBadge />}
            </div>
            <h1 id="protocol-title" className="text-2xl font-semibold tracking-tight text-balance">
              {title}
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{pick(protocol, "summary", locale)}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">
          {canScan && (
            <Link href={`/scans/new?protocol=${encodeURIComponent(protocol.id)}`} className={cn(buttonVariants(), "h-9")}>
              <ScanLineIcon aria-hidden />
              {t("detail.scan")}
            </Link>
          )}
          {canTrain && (
            <a href="#training" className={cn(buttonVariants({ variant: canScan ? "outline" : "default" }), "h-9")}>
              <GraduationCapIcon aria-hidden />
              {t("detail.train")}
            </a>
          )}
          <PrintButton />
        </div>
      </header>

      <section aria-labelledby="protocol-summary">
        <h2 id="protocol-summary" className="sr-only">
          {t("detail.summaryLabel")}
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={ListChecksIcon} label={t("detail.stats.steps")} value={summary.total} />
          <Stat icon={CircleCheckIcon} label={t("detail.stats.mandatory")} value={summary.mandatory} tone="primary" />
          <Stat icon={OctagonAlertIcon} label={t("detail.stats.critical")} value={summary.critical} tone="critical" />
          <Stat icon={CameraIcon} label={t("detail.stats.visual")} value={summary.visual} />
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] print:block">
        <div className="flex min-w-0 flex-col gap-6">
          {own && <CustomNote sourceProtocolId={protocol.sourceProtocolId} source={source} locale={locale} />}

          <section aria-labelledby="protocol-about" className="flex flex-col gap-2">
            <h2 id="protocol-about" className="text-lg font-semibold">
              {t("detail.about")}
            </h2>
            <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line text-foreground/90">
              {pick(protocol, "description", locale)}
            </p>
          </section>

          <section aria-labelledby="protocol-steps" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="protocol-steps" className="text-lg font-semibold">
                {t("detail.steps")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("detail.stepsHint")}</p>
            </div>
            <StepList steps={protocol.steps} locale={locale} />
          </section>
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start print:mt-6">
          <TrainingScenarios data={training} locale={locale} />
          <BadgeLegend />
        </div>
      </div>

      {/* At the very end on every screen size (on phones the side column comes after the steps). */}
      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{tc("marketing.disclaimer")}</p>
    </article>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ListChecksIcon;
  label: string;
  value: number;
  tone?: "primary" | "critical";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:p-4">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon
          aria-hidden
          className={cn("size-3.5", tone === "primary" && "text-primary", tone === "critical" && value > 0 && "text-destructive")}
        />
        {label}
      </dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

async function CustomNote({
  sourceProtocolId,
  source,
  locale,
}: {
  sourceProtocolId: string | null;
  source: ProtocolSource | null;
  locale: Locale;
}) {
  const t = await getTranslations("protocols.custom");
  return (
    <div role="note" className="flex items-start gap-3 rounded-xl bg-secondary/60 p-4 text-sm ring-1 ring-border">
      <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
      <p className="leading-relaxed">
        {source
          ? t.rich("basedOn", {
              title: pick(source, "title", locale),
              link: (chunks) => (
                <Link href={`/protocols/${source.slug}`} className="font-medium text-primary underline underline-offset-4">
                  {chunks}
                </Link>
              ),
            })
          : sourceProtocolId
            ? t("basedOnHidden")
            : t("own")}
      </p>
    </div>
  );
}

async function BadgeLegend() {
  const t = await getTranslations("protocols.legend");
  const items = [
    { badge: <MandatoryBadge mandatory />, text: t("mandatory") },
    { badge: <MandatoryBadge mandatory={false} />, text: t("recommended") },
    { badge: <CriticalBadge />, text: t("critical") },
    { badge: <VisualCheckBadge />, text: t("visual") },
    { badge: <WeightBadge weight={3} />, text: t("weight") },
  ];
  return (
    <section aria-labelledby="legend-title" className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5 break-inside-avoid">
      <h2 id="legend-title" className="text-base font-semibold">
        {t("title")}
      </h2>
      <dl className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col items-start gap-1">
            <dt>{item.badge}</dt>
            <dd className="text-xs leading-relaxed text-muted-foreground">{item.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ProtocolDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex items-start gap-4">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-8 w-2/3 max-w-md" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-16 w-full" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
