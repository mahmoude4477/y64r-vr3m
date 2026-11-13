import { ArrowRightIcon, Building2Icon, GraduationCapIcon, ScanLineIcon, SparklesIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { cache, Suspense } from "react";
import { ActivityList } from "@/components/admin/activity-list";
import { RiskDistribution } from "@/components/admin/risk-distribution";
import { StatCard, StatCardSkeleton, StatCardUnavailable } from "@/components/admin/stat-card";
import { Usd } from "@/components/admin/usd";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { latestActivity, membershipCount, overviewTotals, riskDistribution } from "@/lib/admin/queries";
import { log } from "@/lib/log";
import { adminMetadata } from "@/lib/admin/metadata";
import { requirePlatformAdmin } from "@/lib/session";

// /admin: the platform at a glance. Each card is its own Suspense boundary and checks requirePlatformAdmin() itself
// (deduplicated per request); only generic message strings sit outside them (CONVENTIONS 4). The five number cards
// share one query per request (overviewTotals, React cache); the activity list and the risk chart load beside them.
// A card whose data fails shows "could not load" instead of taking the whole page to the error screen.

/** The overview numbers once per request, or null when the query failed (logged). */
const loadTotals = cache(async () => {
  try {
    return await overviewTotals();
  } catch (err) {
    log.error("admin.overview.totals_failed", { err });
    return null;
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return adminMetadata(t("title"));
}

async function UsersCard() {
  await requirePlatformAdmin();
  const [t, format, all] = await Promise.all([getTranslations("admin.overview.users"), getFormatter(), loadTotals()]);
  if (!all) return <StatCardUnavailable title={t("title")} icon={UsersIcon} />;
  const totals = all.users;
  const n = (v: number) => format.number(v, "integer");
  return (
    <StatCard
      title={t("title")}
      icon={UsersIcon}
      value={n(totals.total)}
      rows={[
        { label: t("newThisMonth"), value: n(totals.newThisMonth) },
        { label: t("admins"), value: n(totals.admins) },
        { label: t("banned"), value: n(totals.banned), tone: totals.banned > 0 ? "danger" : undefined },
        { label: t("unverified"), value: n(totals.unverified) },
      ]}
      link={{ href: "/admin/users", label: t("manage") }}
    />
  );
}

async function OrganizationsCard() {
  const ctx = await requirePlatformAdmin();
  const [t, format, all] = await Promise.all([getTranslations("admin.overview.organizations"), getFormatter(), loadTotals()]);
  if (!all) return <StatCardUnavailable title={t("title")} icon={Building2Icon} />;
  // The admin's own memberships (e.g. institutions they created): owner access that a demotion would not take away.
  let own: number | null = null;
  try {
    own = await membershipCount(ctx.user.id);
  } catch (err) {
    log.error("admin.overview.memberships_failed", { err });
  }
  const totals = all.organizations;
  const n = (v: number) => format.number(v, "integer");
  // A figure above zero opens the institutions behind it (the list's status filter).
  const show = (count: number, status: "suspended" | "no_owner" | "mine", label: string) =>
    count > 0 ? { href: `/admin/organizations?status=${status}` as const, label } : undefined;
  return (
    <StatCard
      title={t("title")}
      icon={Building2Icon}
      value={n(totals.total)}
      rows={[
        {
          label: t("suspended"),
          value: n(totals.suspended),
          tone: totals.suspended > 0 ? "danger" : undefined,
          link: show(totals.suspended, "suspended", t("showSuspended", { n: n(totals.suspended) })),
        },
        {
          label: t("withoutOwner"),
          value: n(totals.withoutOwner),
          tone: totals.withoutOwner > 0 ? "warning" : undefined,
          link: show(totals.withoutOwner, "no_owner", t("showWithoutOwner", { n: n(totals.withoutOwner) })),
        },
        ...(own === null
          ? []
          : [{ label: t("yourMemberships"), value: n(own), link: show(own, "mine", t("showYourMemberships", { n: n(own) })) }]),
      ]}
      link={{ href: "/admin/organizations", label: t("manage") }}
    />
  );
}

async function AttemptsCard() {
  await requirePlatformAdmin();
  const [t, format, all] = await Promise.all([getTranslations("admin.overview.attempts"), getFormatter(), loadTotals()]);
  if (!all) return <StatCardUnavailable title={t("title")} icon={GraduationCapIcon} />;
  const totals = all.attempts;
  const n = (v: number) => format.number(v, "integer");
  return (
    <StatCard
      title={t("title")}
      icon={GraduationCapIcon}
      value={n(totals.completed)}
      rows={[
        { label: t("thisMonth"), value: n(totals.thisMonth) },
        { label: t("inProgress"), value: n(totals.inProgress) },
      ]}
      link={{ href: "/admin/assessments?kind=attempts", label: t("manage") }}
    />
  );
}

async function ScansCard() {
  await requirePlatformAdmin();
  const [t, format, all] = await Promise.all([getTranslations("admin.overview.scans"), getFormatter(), loadTotals()]);
  if (!all) return <StatCardUnavailable title={t("title")} icon={ScanLineIcon} />;
  const totals = all.scans;
  const n = (v: number) => format.number(v, "integer");
  return (
    <StatCard
      title={t("title")}
      icon={ScanLineIcon}
      value={n(totals.finalized)}
      rows={[
        { label: t("thisMonth"), value: n(totals.thisMonth) },
        { label: t("inReview"), value: n(totals.inReview), tone: totals.inReview > 0 ? "warning" : undefined },
      ]}
      link={{ href: "/admin/assessments", label: t("manage") }}
    />
  );
}

async function AiCard() {
  await requirePlatformAdmin();
  const [t, format, all] = await Promise.all([getTranslations("admin.overview.ai"), getFormatter(), loadTotals()]);
  if (!all) return <StatCardUnavailable title={t("title")} icon={SparklesIcon} />;
  const totals = all.ai;
  const periods = [
    { key: "today", label: t("today"), data: totals.today },
    { key: "month", label: t("month"), data: totals.month },
  ] as const;
  return (
    <Card className="gap-3">
      <CardHeader className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SparklesIcon aria-hidden className="size-4" />
        </span>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          <h3>{t("title")}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {periods.map(({ key, label, data }) => (
            <section key={key} aria-labelledby={`ai-${key}`} className="flex min-w-0 flex-col gap-2 rounded-lg bg-muted/50 p-3">
              <h4 id={`ai-${key}`} className="text-xs font-medium text-muted-foreground">
                {label}
              </h4>
              <dl className="grid gap-1 text-sm">
                <div>
                  <dt className="sr-only">{t("calls")}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{format.number(data.calls, "integer")}</dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <dt className="text-xs text-muted-foreground">{t("cost")}</dt>
                  <dd className="font-medium">
                    <Usd value={data.costUsd} />
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <dt className="text-xs text-muted-foreground">{t("failed")}</dt>
                  <dd className={data.failed > 0 ? "font-medium text-destructive tabular-nums" : "font-medium tabular-nums"}>
                    {format.number(data.failed, "integer")}
                  </dd>
                </div>
              </dl>
            </section>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </CardContent>
      <CardFooter className="py-2">
        <Link href="/admin/ai" className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-primary hover:underline">
          {t("manage")}
          <ArrowRightIcon aria-hidden className="size-4 rtl:rotate-180" />
        </Link>
      </CardFooter>
    </Card>
  );
}

async function Unavailable() {
  const t = await getTranslations("common.states");
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("errorDescription")}</p>;
}

async function ActivityCardBody() {
  await requirePlatformAdmin();
  let rows;
  try {
    rows = await latestActivity(8);
  } catch (err) {
    log.error("admin.overview.activity_failed", { err });
    return <Unavailable />;
  }
  return <ActivityList rows={rows} />;
}

async function RiskCardBody() {
  await requirePlatformAdmin();
  let risk;
  try {
    risk = await riskDistribution();
  } catch (err) {
    log.error("admin.overview.risk_failed", { err });
    return <Unavailable />;
  }
  return <RiskDistribution attempts={risk.attempts} scans={risk.scans} />;
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export default async function AdminOverviewPage() {
  const [t, overview, activity, risk] = await Promise.all([
    getTranslations("admin"),
    getTranslations("admin.overview"),
    getTranslations("admin.activity"),
    getTranslations("admin.overview.risk"),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <section aria-labelledby="admin-totals">
        <h2 id="admin-totals" className="sr-only">
          {overview("totalsHeading")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Suspense fallback={<StatCardSkeleton rows={4} footer />}>
            <UsersCard />
          </Suspense>
          <Suspense fallback={<StatCardSkeleton rows={3} footer />}>
            <OrganizationsCard />
          </Suspense>
          <Suspense fallback={<StatCardSkeleton rows={3} footer />}>
            <AiCard />
          </Suspense>
          <Suspense fallback={<StatCardSkeleton rows={2} footer />}>
            <AttemptsCard />
          </Suspense>
          <Suspense fallback={<StatCardSkeleton rows={2} footer />}>
            <ScansCard />
          </Suspense>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{activity("title")}</h2>
            </CardTitle>
            <CardDescription>{activity("description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Suspense fallback={<ListSkeleton rows={5} />}>
              <ActivityCardBody />
            </Suspense>
            <Link href="/admin/audit" className="inline-flex min-h-8 items-center gap-1 self-start text-sm font-medium text-primary hover:underline">
              {activity("viewAll")}
              <ArrowRightIcon aria-hidden className="size-4 rtl:rotate-180" />
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{risk("title")}</h2>
            </CardTitle>
            <CardDescription>{risk("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ListSkeleton rows={4} />}>
              <RiskCardBody />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
