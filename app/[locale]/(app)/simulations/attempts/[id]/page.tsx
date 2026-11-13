import { CirclePlayIcon, HourglassIcon, RotateCcwIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { ServiceOffAlert } from "@/components/shared/service-off-alert";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { DebriefPanel } from "@/components/simulations/debrief-panel";
import { PrintButton } from "@/components/simulations/print-button";
import {
  CriticalAlert,
  DebriefSection,
  RESULT_HEADING_ID,
  Recommendations,
  ResultHeading,
  type ResultViewer,
  ResultSummary,
  StageReview,
  StoredDebrief,
  Strengths,
} from "@/components/simulations/result";
import { ResultFocus } from "@/components/simulations/result-focus";
import { ResultSkeleton } from "@/components/simulations/skeletons";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Link } from "@/i18n/navigation";
import { isAppLocale, routing } from "@/i18n/routing";
import { isAiConfigured } from "@/lib/ai/model";
import { checkAiQuota } from "@/lib/ai/limits";
import { scopeOf } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { log } from "@/lib/log";
import { recommendationsFor } from "@/lib/recommendations";
import { getAuthContext, requireUser } from "@/lib/session";
import { canContinueIn } from "@/lib/simulations/attempt-scope";
import { attemptForResult, attemptTitle, playableSlug, resumableAttemptId } from "@/lib/simulations/queries";
import { buildResultModel } from "@/lib/simulations/result-model";
import { AttemptStatusBadge } from "@/components/shared/status-badges";

/** "Result: <scenario>" for a reader who may see the attempt (same visibility as the page), else the generic title. */
export async function generateMetadata({ params }: PageProps<"/[locale]/simulations/attempts/[id]">): Promise<Metadata> {
  const nav = await getTranslations("nav");
  const fallback = { title: nav("sub.simulationAttempt") };
  try {
    const [{ id, locale: raw }, ctx] = await Promise.all([params, getAuthContext()]);
    if (!ctx || ctx.user.mustChangePassword || id.length > 64) return fallback;
    const locale = isAppLocale(raw) ? raw : routing.defaultLocale;
    const title = await attemptTitle(scopeOf(ctx), id, locale);
    if (!title) return fallback;
    const t = await getTranslations("simulations.meta");
    return { title: t("resultTitle", { title }) };
  } catch (err) {
    unstable_rethrow(err); // prerendering postpones on params / the session: not a failure
    log.warn("simulations.metadata.failed", { page: "attempt", err });
    return fallback;
  }
}

export default function SimulationAttemptPage({ params }: PageProps<"/[locale]/simulations/attempts/[id]">) {
  return (
    <Suspense fallback={<ResultSkeleton />}>
      <AttemptResult params={params} />
    </Suspense>
  );
}

/** The result page's column: wide enough for the summary tiles, narrow enough to read (UX-9). */
const COLUMN = "mx-auto flex w-full max-w-5xl flex-col gap-6";

async function AttemptResult({ params }: { params: PageProps<"/[locale]/simulations/attempts/[id]">["params"] }) {
  const ctx = await requireUser();
  const { id } = await params;
  const raw = await getLocale();
  const locale = isAppLocale(raw) ? raw : routing.defaultLocale;
  const scope = scopeOf(ctx);
  // Only the owner or staff of the attempt's institution (attemptsReadable); anybody else gets the not-found page.
  const attempt = id.length <= 64 ? await attemptForResult(scope, id) : null;
  if (!attempt) notFound();
  const isOwner = attempt.userId === scope.userId;
  const viewer: ResultViewer = isOwner ? "owner" : "staff";
  const t = await getTranslations("simulations.result");
  const scenarioTitle = pick(attempt.scenario, "title", locale);
  // Where "Try again" / "Continue" lead: this scenario while the owner may play it, else the version published now,
  // else nowhere (no button rather than a link to the not-found page: SPEC-3).
  const playable = isOwner ? await playableSlug(scope, attempt.scenario) : null;

  if (attempt.status !== "completed") {
    const inProgress = attempt.status === "in_progress";
    // An open attempt continues only on the same scenario, in the institution it counts for (attempt-scope.ts).
    const continuableHere = inProgress && playable === attempt.scenario.slug && canContinueIn(attempt.organizationId, scope);
    // ...and only when it is the one the player resumes: an individual attempt waits behind an open attempt of the
    // active institution (resumableAttempt). "Continue" then leads to that other attempt, and the text says so.
    const resumed = continuableHere ? (await resumableAttemptId(scope, attempt.scenario.id)) === attempt.id : false;
    const description = !inProgress
      ? t("status.abandonedDescription")
      : !isOwner
        ? t("status.inProgressDescriptionStaff")
        : continuableHere
          ? resumed
            ? t("status.inProgressDescription")
            : t("status.otherOpenDescription")
          : playable === attempt.scenario.slug
            ? t("status.otherInstitutionDescription")
            : t("status.unavailableDescription");
    return (
      <div className={COLUMN}>
        <BreadcrumbLabel label={scenarioTitle} />
        {isOwner && <ResultFocus attemptId={attempt.id} targetId={RESULT_HEADING_ID} />}
        <h1 id={RESULT_HEADING_ID} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-balance outline-none">
          {scenarioTitle}
        </h1>
        {/* flex-none: the Empty block would otherwise grow to fill a phone screen (UX-18). */}
        <Empty className="flex-none border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HourglassIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{inProgress ? t("status.inProgressTitle") : t("status.abandonedTitle")}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <AttemptStatusBadge status={attempt.status} />
            {continuableHere ? (
              <Link href={`/simulations/${attempt.scenario.slug}`} className={buttonVariants()}>
                <CirclePlayIcon aria-hidden />
                {t("status.continue")}
              </Link>
            ) : (
              playable && (
                <Link href={`/simulations/${playable}`} className={buttonVariants()}>
                  <RotateCcwIcon aria-hidden />
                  {t("status.start")}
                </Link>
              )
            )}
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const model = buildResultModel(attempt, locale);
  const recommendations = await recommendationsFor(scope, model.violated, model.criticalIds);
  const criticalSteps = model.violated.filter((s) => model.criticalIds.includes(s.id));

  // The personal debrief: shown when stored; only the owner can ask for one (it counts against their AI limit).
  // Without a stored text the card is left out of the printed report (a notice or a button is no use on paper).
  let debrief: React.ReactNode;
  let debriefPrintable = false;
  if (model.score === null) {
    debrief = <p className="text-sm text-muted-foreground">{t("debrief.notAssessable")}</p>;
  } else if (model.debrief && (model.debrief.forReader || !isOwner)) {
    debrief = <StoredDebrief text={model.debrief.text} locale={model.debrief.locale} />;
    debriefPrintable = true;
  } else if (!isOwner) {
    debrief = <p className="text-sm text-muted-foreground">{t("debrief.notRequested")}</p>;
  } else if (!canContinueIn(attempt.organizationId, scope)) {
    // Made in an institution that is not the active one: a new summary is not written there (lib/simulations/debrief).
    debrief = <p className="text-sm text-muted-foreground">{t("debrief.otherInstitution")}</p>;
  } else if (!isAiConfigured()) {
    debrief = <ServiceOffAlert service="ai" />;
  } else if (!(await checkAiQuota(scope.userId)).allowed) {
    debrief = <ServiceOffAlert service="aiLimit" />;
  } else {
    debrief = <DebriefPanel attemptId={attempt.id} locale={locale} />;
  }

  return (
    <div className={COLUMN}>
      <BreadcrumbLabel label={model.scenario.title} />
      {isOwner && <ResultFocus attemptId={attempt.id} targetId={RESULT_HEADING_ID} />}
      <ResultHeading
        model={model}
        trainee={attempt.user.name ? { name: attempt.user.name, printOnly: isOwner } : null}
        actions={
          <>
            {playable && (
              <Link href={`/simulations/${playable}`} className={buttonVariants()}>
                <RotateCcwIcon aria-hidden />
                {t("actions.tryAgain")}
              </Link>
            )}
            <PrintButton />
            <Link href="/simulations" className={buttonVariants({ variant: "ghost" })}>
              {t("actions.back")}
            </Link>
          </>
        }
      />
      <ResultSummary model={model} />
      <CriticalAlert steps={criticalSteps} />
      <DebriefSection printable={debriefPrintable}>{debrief}</DebriefSection>
      {/* items-start: each card keeps its own height instead of stretching to the taller one (UX-9). */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Recommendations
          currentSlug={playable ?? model.scenario.slug}
          practice={isOwner}
          items={recommendations.map((r) => ({
            ...r,
            scenario: r.scenario ? { slug: r.scenario.slug, title: pick(r.scenario, "title", locale) } : null,
          }))}
        />
        <Strengths steps={model.strengths} viewer={viewer} />
      </div>
      <StageReview stages={model.stages} viewer={viewer} />
      <Disclaimer />
    </div>
  );
}

async function Disclaimer() {
  const t = await getTranslations("common.marketing");
  return <p className="text-xs leading-relaxed text-muted-foreground">{t("disclaimer")}</p>;
}
