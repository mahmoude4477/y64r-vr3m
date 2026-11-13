import {
  ChartColumnIcon,
  ClipboardCheckIcon,
  GraduationCapIcon,
  ScanLineIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import type { Locale } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { GapCriticalBadge } from "@/components/reports/badges";
import { dayDate } from "@/components/reports/format";
import { TRAINEES_ANCHOR } from "@/components/reports/institution-report";
import { ReportCard } from "@/components/reports/report-card";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { isOrgManager } from "@/lib/authz";
import { monthToDate, pointsChange, previousMonth, rangeFilters } from "@/lib/dashboard/periods";
import { suggestInvites } from "@/lib/dashboard/plan";
import { pick } from "@/lib/i18n-content";
import { institutionHeadcount, latestCompletedAttempts, latestFinalizedScans, OPEN_SCAN_STATUSES, openScans } from "@/lib/reports/activity";
import { riskPercents } from "@/lib/reports/aggregate";
import { filtersToQuery, parseReportFilters, queryString, todayInRiyadh } from "@/lib/reports/filters";
import { institutionHasResults, institutionSummary, organizationLabel, topGaps } from "@/lib/reports/institution";
import type { InstitutionScope } from "@/lib/reports/scope";
import { cn } from "@/lib/utils";
import { ChangeNote, DashboardSection, KpiTile, MoreLink, type QuickAction, WelcomeBar } from "./parts";
import { FeatureCardSkeleton, ListCardSkeleton, MonthSkeleton } from "./skeletons";
import { RiskBadge, ScanStatusBadge, ScoreBadge } from "@/components/shared/status-badges";

/**
 * The dashboard of institution staff (owner / admin / examiner of the ACTIVE institution): this month's numbers, the
 * scans that still need an examiner, the top gap with its training, and the latest finalised scans and simulation
 * results. Every number comes from lib/reports (the same queries as /reports); each card streams on its own.
 */

type Props = { inst: InstitutionScope; locale: Locale; name: string };

/** The main link of a list row: a tap target of at least 32 px (CONVENTIONS 9), the text still wraps. */
const ROW_LINK = "inline-flex min-h-8 items-center self-start font-medium text-pretty underline-offset-4 hover:underline";

type OpenScans = Awaited<ReturnType<typeof openScans>>;

export async function InstitutionDashboard({ inst, locale, name }: Props) {
  const t = await getTranslations("dashboard");
  const roles = await getTranslations("common.roles");
  const manager = isOrgManager(inst.scope);
  // Started with the others: the first run needs the count to decide whether the card shows at all, and the card
  // reads the same promise (one query). The no-op catch only marks it handled; the card's boundary still shows a
  // failure.
  const open = openScans(inst, 5);
  open.catch(() => {});
  const [hasResults, org, headcount] = await Promise.all([
    institutionHasResults(inst),
    organizationLabel(inst),
    manager ? institutionHeadcount(inst) : Promise.resolve(null),
  ]);
  const today = todayInRiyadh();
  const institutionName = locale === "en" && org.nameEn ? org.nameEn : org.name;
  const role = inst.scope.orgRole;
  const actions: QuickAction[] = [
    { href: "/scans/new", label: t("quick.newScan"), icon: ScanLineIcon, primary: true },
    { href: "/reports", label: t("quick.reports"), icon: ChartColumnIcon },
    { href: "/simulations", label: t("quick.simulations"), icon: GraduationCapIcon },
    ...(manager ? [{ href: "/org/members", label: t("quick.members"), icon: UsersIcon }] : []),
  ];
  const context = role ? t("welcome.staff", { role: roles(role), institution: institutionName }) : institutionName;
  const openCard = (
    <DashboardSection id="dash-open-scans" title={t("institution.open.title")} fallback={<ListCardSkeleton rows={3} />}>
      <OpenScansCard data={open} inst={inst} locale={locale} />
    </DashboardSection>
  );

  if (!hasResults) {
    // First run: the onboarding holds the actions (and the only primary button), so the greeting has none; the
    // "waiting to be finalised" card appears only when a scan is already open.
    const openNow = await open.catch(() => null);
    return (
      <>
        <WelcomeBar name={name} context={context} actions={[]} />
        <InstitutionOnboarding manager={manager} />
        {(openNow === null || openNow.counts.total > 0) && openCard}
      </>
    );
  }

  return (
    <>
      <WelcomeBar name={name} context={context} actions={actions} />
      {headcount && suggestInvites({ manager }, headcount.members) && (
        <InviteHint members={headcount.members} pending={headcount.pendingInvitations} />
      )}
      <DashboardSection id="dash-month" title={t("institution.month.title")} fallback={<MonthSkeleton />}>
        <MonthSummary inst={inst} today={today} />
      </DashboardSection>
      <div className="grid gap-6 xl:grid-cols-2">
        {openCard}
        <DashboardSection id="dash-gap" title={t("institution.gap.title")} fallback={<FeatureCardSkeleton />}>
          <TopGapCard inst={inst} today={today} locale={locale} />
        </DashboardSection>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardSection id="dash-scans" title={t("institution.scans.title")} fallback={<ListCardSkeleton rows={4} />}>
          <LatestScansCard inst={inst} locale={locale} />
        </DashboardSection>
        <DashboardSection id="dash-attempts" title={t("institution.attempts.title")} fallback={<ListCardSkeleton rows={4} />}>
          <LatestAttemptsCard inst={inst} locale={locale} />
        </DashboardSection>
      </div>
    </>
  );
}

/** Managers of an institution with only a few members: invite people (members page of the org feature). */
async function InviteHint({ members, pending }: { members: number; pending: number }) {
  const t = await getTranslations("dashboard.institution.invite");
  return (
    <section
      aria-labelledby="dash-invite-title"
      className="flex flex-col gap-3 rounded-xl bg-primary/5 p-4 ring-1 ring-primary/20 sm:flex-row sm:items-center"
    >
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-primary/20">
        <UserPlusIcon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id="dash-invite-title" className="font-heading text-base font-medium">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          {t("description", { count: members })}
          {pending > 0 && <> {t("pending", { count: pending })}</>}
        </p>
      </div>
      {/* Outline: the greeting's "new scan" stays the page's one primary action. */}
      <Link href="/org/members" className={cn(buttonVariants({ variant: "outline" }), "self-start sm:self-center")}>
        <UserPlusIcon aria-hidden />
        {t("action")}
      </Link>
    </section>
  );
}

/** This month so far (Riyadh calendar month), compared with the whole of last month. */
async function MonthSummary({ inst, today }: { inst: InstitutionScope; today: string }) {
  const t = await getTranslations("dashboard.institution.month");
  const score = await getTranslations("common.score");
  const common = await getTranslations("reports.common");
  const format = await getFormatter();
  const month = rangeFilters(monthToDate(today));
  const [current, previous] = await Promise.all([
    institutionSummary(inst, month),
    institutionSummary(inst, rangeFilters(previousMonth(today))),
  ]);
  const pct = (v: number) => score("value", { score: format.number(v, "integer") });
  const noScore = (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">{common("noScore")}</span>
    </>
  );
  const change = pointsChange(current.combined.average, previous.combined.average);
  const highShare = current.combined.n > 0 ? riskPercents(current.combined.risk).high : 0;
  return (
    <section aria-labelledby="dash-month-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="dash-month-title" className="font-heading text-base font-medium">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("description", { from: format.dateTime(dayDate(month.from), "date"), to: format.dateTime(dayDate(month.to), "date") })}
          </p>
        </div>
        <MoreLink href={`/reports${queryString(filtersToQuery(month))}`}>{t("report")}</MoreLink>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label={t("compliance")}
          value={current.combined.average === null ? noScore : pct(current.combined.average)}
          hint={t("results", { count: current.combined.n })}
          note={
            change !== null ? (
              <ChangeNote
                change={change}
                up={t("changeUp", { points: Math.abs(change) })}
                down={t("changeDown", { points: Math.abs(change) })}
                same={t("changeSame")}
              />
            ) : previous.combined.average !== null ? (
              t("lastMonth", { score: pct(previous.combined.average) })
            ) : undefined
          }
        />
        <KpiTile
          label={t("highRisk")}
          value={format.number(current.combined.risk.high, "integer")}
          hint={
            current.combined.n > 0
              ? t("highRiskShare", { share: common("percent", { value: format.number(highShare, "integer") }) })
              : undefined
          }
        />
        <KpiTile
          label={t("scans")}
          value={format.number(current.scans.n, "integer")}
          hint={current.scans.average === null ? t("noAverage") : t("average", { score: pct(current.scans.average) })}
        />
        <KpiTile
          label={t("simulations")}
          value={format.number(current.simulations.n, "integer")}
          hint={
            current.simulations.average === null
              ? t("noAverage")
              : t("averageAndTrainees", { score: pct(current.simulations.average), count: current.simulations.people })
          }
        />
      </div>
    </section>
  );
}

/** Scans that are not finalised yet: counts per status (links to the filtered scan list) and the latest ones. */
async function OpenScansCard({ data, inst, locale }: { data: Promise<OpenScans>; inst: InstitutionScope; locale: Locale }) {
  const t = await getTranslations("dashboard.institution.open");
  const format = await getFormatter();
  const { counts, rows } = await data;
  return (
    <ReportCard
      id="dash-open-scans"
      title={t("title")}
      description={t("description")}
      action={<MoreLink href="/scans">{t("all")}</MoreLink>}
      className="h-full"
    >
      {counts.total === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheckIcon aria-hidden className="size-4 shrink-0" />
            {t("none")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ul aria-label={t("statusLabel")} className="flex flex-wrap gap-2">
            {OPEN_SCAN_STATUSES.filter((s) => counts[s] > 0).map((status) => (
              <li key={status}>
                <Link
                  href={`/scans?status=${status}`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 ring-1 ring-border transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ScanStatusBadge status={status} />
                  <span className="sr-only">: </span>
                  <span className="text-sm font-semibold tabular-nums">{format.number(counts[status], "integer")}</span>
                </Link>
              </li>
            ))}
          </ul>
          <ol className="flex flex-col divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={`/scans/${row.id}`} className={ROW_LINK}>
                    <bdi>{row.areaLabel}</bdi>
                  </Link>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <ProtocolIcon name={row.protocol.icon} className="size-3.5" />
                      {pick(row.protocol, "title", locale)}
                    </span>
                    <span aria-hidden>·</span>
                    <ExaminerLabel examinerId={row.examinerId} name={row.examiner?.name ?? null} userId={inst.scope.userId} />
                    <span aria-hidden>·</span>
                    <span>{t("updated", { date: format.dateTime(row.updatedAt, "date") })}</span>
                  </p>
                </div>
                <ScanStatusBadge status={row.status} className="self-start" />
              </li>
            ))}
          </ol>
          {counts.total > rows.length && (
            <p className="text-xs text-muted-foreground">{t("more", { count: counts.total - rows.length })}</p>
          )}
        </div>
      )}
    </ReportCard>
  );
}

async function ExaminerLabel({ examinerId, name, userId }: { examinerId: string | null; name: string | null; userId: string }) {
  const t = await getTranslations("dashboard.institution.open");
  const common = await getTranslations("common");
  if (examinerId === userId) return <span>{t("byYou")}</span>;
  // examinerId is null once the examiner's account was deleted (the scan stays with the institution).
  return <span>{t("by", { name: examinerId && name ? name : common("deletedUser") })}</span>;
}

/** The most violated step of the last 90 days (the /reports default period, so both pages agree). */
async function TopGapCard({ inst, today, locale }: { inst: InstitutionScope; today: string; locale: Locale }) {
  const t = await getTranslations("dashboard.institution.gap");
  const common = await getTranslations("reports.common");
  const format = await getFormatter();
  const gaps = await topGaps(inst, parseReportFilters({}, today), 3);
  const [top, ...others] = gaps;
  const rate = (r: number) => common("percent", { value: format.number(Math.round(r * 100), "integer") });
  return (
    <ReportCard
      id="dash-gap"
      title={t("title")}
      description={t("description")}
      action={<MoreLink href="/reports">{t("all")}</MoreLink>}
      className="h-full"
    >
      {!top ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardCheckIcon aria-hidden className="size-4 shrink-0" />
          {t("none")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-base font-medium text-pretty">{pick(top.step, "text", locale)}</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ProtocolIcon name={top.step.protocol.icon} className="size-3.5" />
                {pick(top.step.protocol, "title", locale)}
              </span>
              <GapCriticalBadge criticalStep={top.step.isCritical} criticalViolations={top.criticalChoices} />
            </p>
            <p className="text-sm">
              {t("rate", {
                rate: rate(top.rate),
                violated: format.number(top.violated, "integer"),
                assessed: format.number(top.assessed, "integer"),
              })}
            </p>
            <p className="text-sm text-muted-foreground text-pretty">
              <span className="font-medium text-foreground">{t("why")} </span>
              {pick(top.step, "rationale", locale)}
            </p>
          </div>
          {top.scenario ? (
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t("train")}</p>
              <Link href={`/simulations/${top.scenario.slug}`} className={cn(buttonVariants({ variant: "outline" }), "h-auto min-h-8 py-1.5 text-start whitespace-normal")}>
                <GraduationCapIcon aria-hidden />
                {pick(top.scenario, "title", locale)}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noScenario")}</p>
          )}
          {others.length > 0 && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">{t("also")}</p>
              <ol className="flex flex-col gap-2">
                {others.map((gap) => (
                  <li key={gap.stepId} className="flex flex-col gap-0.5 text-sm">
                    <span className="text-pretty">{pick(gap.step, "text", locale)}</span>
                    <span className="text-xs text-muted-foreground">{t("alsoRate", { rate: rate(gap.rate) })}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </ReportCard>
  );
}

async function LatestScansCard({ inst, locale }: { inst: InstitutionScope; locale: Locale }) {
  const t = await getTranslations("dashboard.institution.scans");
  const format = await getFormatter();
  const rows = await latestFinalizedScans(inst, 5);
  return (
    <ReportCard
      id="dash-scans"
      title={t("title")}
      action={rows.length > 0 ? <MoreLink href="/scans?status=finalized">{t("all")}</MoreLink> : undefined}
      className="h-full"
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <Link href={`/scans/${row.id}`} className={ROW_LINK}>
                  <bdi>{row.areaLabel}</bdi>
                </Link>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ProtocolIcon name={row.protocol.icon} className="size-3.5" />
                    {pick(row.protocol, "title", locale)}
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    <bdi>{row.team?.name ?? t("noDepartment")}</bdi>
                  </span>
                  {row.finalizedAt && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{format.dateTime(row.finalizedAt, "date")}</span>
                    </>
                  )}
                </p>
              </div>
              <span className="inline-flex shrink-0 flex-wrap items-center gap-1.5">
                <ScoreBadge score={row.score} />
                {row.riskLevel && <RiskBadge level={row.riskLevel} />}
              </span>
            </li>
          ))}
        </ol>
      )}
    </ReportCard>
  );
}

async function LatestAttemptsCard({ inst, locale }: { inst: InstitutionScope; locale: Locale }) {
  const t = await getTranslations("dashboard.institution.attempts");
  const format = await getFormatter();
  const rows = await latestCompletedAttempts(inst, 5);
  return (
    <ReportCard
      id="dash-attempts"
      title={t("title")}
      // The trainee-progress section of /reports (it is the last card there: the hash opens it).
      action={rows.length > 0 ? <MoreLink href={`/reports#${TRAINEES_ANCHOR}`}>{t("all")}</MoreLink> : undefined}
      className="h-full"
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link href={`/simulations/attempts/${row.id}`} className={ROW_LINK}>
                  {pick(row.scenario, "title", locale)}
                </Link>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <Link
                    href={`/reports/trainees/${row.userId}`}
                    className="inline-flex min-h-8 items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
                  >
                    <UserIcon aria-hidden className="size-3.5" />
                    <bdi>{row.user.name}</bdi>
                  </Link>
                  {row.completedAt && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{format.dateTime(row.completedAt, "date")}</span>
                    </>
                  )}
                </p>
              </div>
              <span className="inline-flex shrink-0 flex-wrap items-center gap-1.5">
                <ScoreBadge score={row.score} />
                {row.riskLevel && <RiskBadge level={row.riskLevel} />}
              </span>
            </li>
          ))}
        </ol>
      )}
    </ReportCard>
  );
}

/** A new institution (no finalised scan, no completed attempt): the first steps, the invitation one for managers. */
async function InstitutionOnboarding({ manager }: { manager: boolean }) {
  const t = await getTranslations("dashboard.institution.onboarding");
  const steps = [
    ...(manager ? [{ icon: UserPlusIcon, title: t("inviteTitle"), text: t("invite"), href: "/org/members", action: t("members") }] : []),
    { icon: ScanLineIcon, title: t("scanTitle"), text: t("scan"), href: "/scans/new", action: t("startScan") },
    { icon: GraduationCapIcon, title: t("trainTitle"), text: t("train"), href: "/simulations", action: t("simulations") },
  ];
  return (
    <section
      aria-labelledby="dash-org-onboarding-title"
      className="flex flex-col gap-5 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="dash-org-onboarding-title" className="font-heading text-lg font-semibold text-balance">
          {t("title")}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground text-pretty">{t("description")}</p>
      </div>
      <ol aria-label={t("stepsLabel")} className={cn("grid gap-3", steps.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {steps.map((step, i) => (
          <li key={step.href} className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold tabular-nums ring-1 ring-border"
              >
                {i + 1}
              </span>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <step.icon aria-hidden className="size-4 shrink-0 text-primary" />
                {step.title}
              </p>
            </div>
            <p className="flex-1 text-xs text-muted-foreground text-pretty">{step.text}</p>
            <Link href={step.href} className={cn(buttonVariants({ variant: i === 0 ? "default" : "outline" }), "self-start")}>
              {step.action}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
