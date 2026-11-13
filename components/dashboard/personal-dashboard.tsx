import {
  BookOpenCheckIcon,
  ChartColumnIcon,
  CirclePlayIcon,
  ClipboardCheckIcon,
  GraduationCapIcon,
  ListChecksIcon,
  MousePointerClickIcon,
  SparklesIcon,
} from "lucide-react";
import type { Locale } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { CriticalViolationBadge } from "@/components/reports/badges";
import { ReportCard } from "@/components/reports/report-card";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Scope } from "@/lib/authz";
import { pointsChange } from "@/lib/dashboard/periods";
import { pick } from "@/lib/i18n-content";
import { activeInstitutionName, latestUnfinishedAttempt, type ScenarioSuggestion, untriedScenario } from "@/lib/reports/activity";
import {
  type AttemptSubject,
  type AttemptSummary,
  attemptScoreHistory,
  attemptSummary,
  ownAttempts,
  type ScorePoint,
  weakSteps,
  type WeakStep,
} from "@/lib/reports/personal";
import { cn } from "@/lib/utils";
import { ChangeNote, DashboardSection, KpiTile, MoreLink, type QuickAction, Sparkline, WelcomeBar } from "./parts";
import { FeatureCardSkeleton, ListCardSkeleton } from "./skeletons";
import { RiskBadge, ScoreBadge } from "@/components/shared/status-badges";

/**
 * The training dashboard of a trainee (an institution's trainee, or an individual user): the latest result, counts,
 * the next scenario to play and the steps to review, all from the queries behind "my results" on /reports
 * (lib/reports/personal.ts). A first-time user gets an onboarding card instead. No scan links here: scans are for
 * institution staff only.
 */

type Props = { scope: Scope; locale: Locale; name: string; platformAdmin?: boolean };

/** "My results": /reports shows a trainee (anyone who is not institution staff) their own results. */
const MY_RESULTS = "/reports";

export async function PersonalDashboard({ scope, locale, name, platformAdmin = false }: Props) {
  const t = await getTranslations("dashboard");
  const subject = ownAttempts(scope);
  // All in parallel: the first-run card and the "recommended next" card both may need the untried scenario.
  const [summary, unfinished, history, untried, org] = await Promise.all([
    attemptSummary(subject),
    latestUnfinishedAttempt(subject),
    attemptScoreHistory(subject, 10),
    untriedScenario(scope),
    activeInstitutionName(scope),
  ]);
  const institutionName = org ? (locale === "en" && org.nameEn ? org.nameEn : org.name) : null;
  const firstRun = summary.completed === 0;
  // One filled button per view. An attempt in progress: its "continue" is the primary action and every other start is
  // outline. First run: the onboarding card (or that banner) holds it, so the greeting has no shortcuts; afterwards
  // they come back, "start a simulation" filled unless there is something to continue. The cards below only ever
  // have outline buttons.
  const resuming = unfinished !== null;
  const actions: QuickAction[] = firstRun
    ? []
    : [
        { href: "/simulations", label: t("quick.startSimulation"), icon: GraduationCapIcon, primary: !resuming },
        { href: MY_RESULTS, label: t("quick.myResults"), icon: ChartColumnIcon },
        { href: "/protocols", label: t("quick.protocols"), icon: BookOpenCheckIcon },
      ];
  const context = institutionName ? t("welcome.personalMember", { institution: institutionName }) : t("welcome.personal");

  return (
    <>
      <WelcomeBar name={name} context={context} actions={actions} />
      {unfinished && <ContinueBanner attempt={unfinished} locale={locale} />}
      {!firstRun ? (
        <TrainingOverview subject={subject} summary={summary} history={history} untried={untried} locale={locale} />
      ) : platformAdmin ? (
        // A platform admin is here to run the platform: a short way into training, not the full trainee welcome.
        <TryTrainingCard />
      ) : (
        <Onboarding scenario={untried} locale={locale} secondary={unfinished !== null} />
      )}
    </>
  );
}

/** A platform admin without results of their own: one line and a link to the simulations. */
async function TryTrainingCard() {
  const t = await getTranslations("dashboard.tryTraining");
  return (
    <section
      aria-labelledby="dash-try-title"
      className="flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 sm:flex-row sm:items-center"
    >
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <GraduationCapIcon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id="dash-try-title" className="font-heading text-base font-medium">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">{t("description")}</p>
      </div>
      {/* Outline: the admin card above holds this page's main action. */}
      <Link href="/simulations" className={cn(buttonVariants({ variant: "outline" }), "self-start sm:self-center")}>
        {t("action")}
      </Link>
    </section>
  );
}

async function ContinueBanner({
  attempt,
  locale,
}: {
  attempt: NonNullable<Awaited<ReturnType<typeof latestUnfinishedAttempt>>>;
  locale: Locale;
}) {
  const t = await getTranslations("dashboard.continue");
  const format = await getFormatter();
  return (
    <section
      aria-labelledby="dash-continue-title"
      className="flex flex-col gap-3 rounded-xl bg-info/8 p-4 ring-1 ring-info/25 sm:flex-row sm:items-center"
    >
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-info ring-1 ring-info/25">
        <CirclePlayIcon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id="dash-continue-title" className="font-heading text-base font-medium">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          {t("description", { title: pick(attempt.scenario, "title", locale), date: format.dateTime(attempt.startedAt, "date") })}
        </p>
      </div>
      <Link href={`/simulations/${attempt.scenario.slug}`} className={cn(buttonVariants(), "self-start sm:self-center")}>
        <CirclePlayIcon aria-hidden />
        {t("action")}
      </Link>
    </section>
  );
}

async function TrainingOverview({
  subject,
  summary,
  history,
  untried,
  locale,
}: {
  subject: AttemptSubject;
  summary: AttemptSummary;
  history: ScorePoint[];
  untried: ScenarioSuggestion | null;
  locale: Locale;
}) {
  const t = await getTranslations("dashboard.personal");
  // Both cards below need the weak steps: one query, shared. The no-op catch only marks the promise as handled until
  // the cards await it; a failure still reaches each card's error boundary.
  const weak = weakSteps(subject, 3);
  weak.catch(() => {});
  return (
    <>
      <PersonalStats summary={summary} history={history} locale={locale} />
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardSection id="dash-next" title={t("next.title")} fallback={<FeatureCardSkeleton />}>
          <NextScenarioCard weak={weak} untried={untried} locale={locale} />
        </DashboardSection>
        <DashboardSection id="dash-weak" title={t("weak.title")} fallback={<ListCardSkeleton rows={3} />}>
          <WeakStepsCard weak={weak} locale={locale} />
        </DashboardSection>
      </div>
    </>
  );
}

async function PersonalStats({ summary, history, locale }: { summary: AttemptSummary; history: ScorePoint[]; locale: Locale }) {
  const t = await getTranslations("dashboard.personal");
  const score = await getTranslations("common.score");
  const common = await getTranslations("reports.common");
  const format = await getFormatter();
  const pct = (v: number) => score("value", { score: format.number(v, "integer") });
  const noScore = (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">{common("noScore")}</span>
    </>
  );
  const latest = summary.latest;
  // The change is shown only when the latest completed attempt is the latest scored one (a not-assessable attempt has
  // no score to compare).
  const lastTwo = history.slice(-2);
  const change =
    latest && latest.score !== null && lastTwo.length === 2 && lastTwo[1].id === latest.id
      ? pointsChange(lastTwo[1].score, lastTwo[0].score)
      : null;
  const scores = history.map((p) => p.score);
  return (
    // The latest result is the wide tile (two of five columns on a large screen) with its sparkline and link beside the
    // text, not under it: as a narrow tile it stood far taller than the three short ones next to it.
    <section aria-label={t("statsLabel")} className="grid grid-cols-3 gap-3 lg:grid-cols-5">
      <KpiTile
        className="col-span-3 lg:col-span-2"
        label={t("latest")}
        value={latest ? (latest.score === null ? <ScoreBadge score={null} /> : pct(latest.score)) : noScore}
        badge={latest?.riskLevel ? <RiskBadge level={latest.riskLevel} /> : undefined}
        hint={latest ? `${pick(latest.scenario, "title", locale)} · ${format.dateTime(latest.completedAt, "date")}` : undefined}
        note={
          change !== null ? (
            <ChangeNote
              change={change}
              up={t("changeUp", { points: Math.abs(change) })}
              down={t("changeDown", { points: Math.abs(change) })}
              same={t("changeSame")}
            />
          ) : undefined
        }
        aside={
          <>
            {scores.length >= 2 && (
              <figure className="m-0">
                <Sparkline scores={scores} rtl={locale === "ar"} />
                <figcaption className="sr-only">
                  {t("recentScores", { count: scores.length, scores: format.list(scores.map(pct)) })}
                </figcaption>
              </figure>
            )}
            {latest && <MoreLink href={`/simulations/attempts/${latest.id}`}>{t("latestOpen")}</MoreLink>}
          </>
        }
      />
      <KpiTile
        label={t("completed")}
        value={format.number(summary.completed, "integer")}
        hint={summary.inProgress > 0 ? t("inProgress", { count: summary.inProgress }) : undefined}
      />
      <KpiTile label={t("average")} value={summary.average === null ? noScore : pct(summary.average)} />
      <KpiTile label={t("best")} value={summary.best === null ? noScore : pct(summary.best)} />
    </section>
  );
}

async function ScenarioMeta({ scenario }: { scenario: Pick<ScenarioSuggestion, "difficulty" | "estimatedMinutes"> }) {
  const t = await getTranslations("dashboard.scenario");
  const difficulty = await getTranslations("common.difficulty");
  return (
    <span>
      {t("meta", {
        difficulty: difficulty(scenario.difficulty),
        minutes: t("minutes", { count: Math.max(1, scenario.estimatedMinutes) }),
      })}
    </span>
  );
}

/** The scenario to play next: the one that trains the most-missed step, else one not completed yet. */
async function NextScenarioCard({
  weak,
  untried,
  locale,
}: {
  weak: Promise<WeakStep[]>;
  untried: ScenarioSuggestion | null;
  locale: Locale;
}) {
  const t = await getTranslations("dashboard.personal.next");
  const format = await getFormatter();
  const steps = await weak;
  const fromGap = steps.find((s) => s.scenario);
  const scenario = fromGap?.scenario ?? untried;
  return (
    <ReportCard
      id="dash-next"
      title={t("title")}
      description={fromGap ? t("fromGap") : scenario ? t("untried") : undefined}
      className="h-full"
    >
      {scenario ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SparklesIcon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-base font-medium text-pretty">{pick(scenario, "title", locale)}</p>
              <p className="text-xs text-muted-foreground">
                <ScenarioMeta scenario={scenario} />
              </p>
            </div>
          </div>
          {fromGap && (
            <p className="text-sm text-pretty">
              {t("missed", {
                step: pick(fromGap.step, "text", locale),
                violated: format.number(fromGap.violated, "integer"),
                assessed: fromGap.assessed,
              })}
            </p>
          )}
          {/* Outline: the greeting's shortcut (or the "continue" banner) is the page's one primary action. */}
          <Link href={`/simulations/${scenario.slug}`} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
            <CirclePlayIcon aria-hidden />
            {t("start")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground text-pretty">{t("allDone")}</p>
          <Link href="/simulations" className={cn(buttonVariants({ variant: "outline" }))}>
            <GraduationCapIcon aria-hidden />
            {t("browse")}
          </Link>
        </div>
      )}
    </ReportCard>
  );
}

async function WeakStepsCard({ weak, locale }: { weak: Promise<WeakStep[]>; locale: Locale }) {
  const t = await getTranslations("dashboard.personal.weak");
  const format = await getFormatter();
  const steps = await weak;
  return (
    <ReportCard
      id="dash-weak"
      title={t("title")}
      description={t("description")}
      action={<MoreLink href={MY_RESULTS}>{t("all")}</MoreLink>}
      className="h-full"
    >
      {steps.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardCheckIcon aria-hidden className="size-4 shrink-0" />
          {t("none")}
        </p>
      ) : (
        <ol className="flex flex-col divide-y">
          {steps.map((s) => (
            <li key={s.step.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <p className="font-medium text-pretty">{pick(s.step, "text", locale)}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ProtocolIcon name={s.step.protocol.icon} className="size-3.5" />
                  {pick(s.step.protocol, "title", locale)}
                </span>
                <span aria-hidden>·</span>
                <span>{t("rate", { violated: format.number(s.violated, "integer"), assessed: s.assessed })}</span>
                {s.critical && <CriticalViolationBadge />}
              </p>
              {s.scenario && (
                <Link
                  href={`/simulations/${s.scenario.slug}`}
                  className="inline-flex min-h-8 items-center gap-1.5 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  <GraduationCapIcon aria-hidden className="size-4" />
                  {t("practise", { title: pick(s.scenario, "title", locale) })}
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </ReportCard>
  );
}

/** A first-time user: what Waqaya does in three steps, a suggested first scenario and where to start. */
async function Onboarding({ scenario, locale, secondary }: { scenario: ScenarioSuggestion | null; locale: Locale; secondary: boolean }) {
  const t = await getTranslations("dashboard.onboarding");
  const steps = [
    { icon: ListChecksIcon, title: t("step1Title"), text: t("step1") },
    { icon: MousePointerClickIcon, title: t("step2Title"), text: t("step2") },
    { icon: ChartColumnIcon, title: t("step3Title"), text: t("step3") },
  ];
  return (
    <section
      aria-labelledby="dash-onboarding-title"
      className="flex flex-col gap-6 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <GraduationCapIcon className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="dash-onboarding-title" className="font-heading text-lg font-semibold text-balance">
            {t("title")}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground text-pretty">{t("description")}</p>
        </div>
      </div>
      <ol aria-label={t("stepsLabel")} className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3 rounded-lg bg-muted/50 p-3">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold tabular-nums ring-1 ring-border"
            >
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <step.icon aria-hidden className="size-4 shrink-0 text-primary" />
                {step.title}
              </p>
              <p className="text-xs text-muted-foreground text-pretty">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <OnboardingActions scenario={scenario} locale={locale} secondary={secondary} />
    </section>
  );
}

/** `secondary`: the "continue" banner above already holds the primary action (an attempt in progress). */
async function OnboardingActions({
  scenario,
  locale,
  secondary,
}: {
  scenario: ScenarioSuggestion | null;
  locale: Locale;
  secondary: boolean;
}) {
  const t = await getTranslations("dashboard.onboarding");
  return (
    <div className="flex flex-col gap-4">
      {scenario && (
        <div className="flex items-start gap-3 rounded-lg p-3 ring-1 ring-primary/25">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ProtocolIcon name={scenario.protocol.icon} className="size-4.5" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-xs font-medium text-muted-foreground">{t("suggested")}</p>
            <p className="font-medium text-pretty">{pick(scenario, "title", locale)}</p>
            <p className="text-xs text-muted-foreground">
              {pick(scenario.protocol, "title", locale)} · <ScenarioMeta scenario={scenario} />
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={scenario ? `/simulations/${scenario.slug}` : "/simulations"} className={cn(buttonVariants({ variant: secondary ? "outline" : "default" }))}>
          <CirclePlayIcon aria-hidden />
          {t("start")}
        </Link>
        {scenario && (
          <Link href="/simulations" className={cn(buttonVariants({ variant: "outline" }))}>
            <GraduationCapIcon aria-hidden />
            {t("browse")}
          </Link>
        )}
        <Link href="/protocols" className={cn(buttonVariants({ variant: "ghost" }))}>
          <BookOpenCheckIcon aria-hidden />
          {t("protocols")}
        </Link>
      </div>
    </div>
  );
}
