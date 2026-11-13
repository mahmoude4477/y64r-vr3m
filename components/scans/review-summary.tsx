"use client";

import { CircleAlertIcon, CircleCheckIcon, LockIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ScoreResult } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { RiskBadge, ScoreBadge, TONE_TEXT } from "@/components/shared/status-badges";

export type MissingStep = { id: string; number: number; text: string };

/**
 * The live result while the examiner reviews: score and risk from lib/scoring (the same function finalising uses), the
 * answered / compliant / violated / not counted counts, what still blocks finalising and the AI verdicts flagged as
 * unsure that nobody checked yet (links to those steps), and the finalise button. A visually hidden live region
 * announces the new score after each answer. Before any answer the result is a neutral "no answers yet".
 */
export function ReviewSummary({
  result,
  answered,
  total,
  missing,
  unsure,
  saving,
  saveError,
  finalizing,
  onFinalize,
  onGoToStep,
  className,
}: {
  result: ScoreResult;
  answered: number;
  total: number;
  missing: readonly MissingStep[];
  unsure: readonly MissingStep[];
  saving: boolean;
  saveError: boolean;
  finalizing: boolean;
  onFinalize: () => void;
  onGoToStep: (stepId: string) => void;
  className?: string;
}) {
  const t = useTranslations("scans.detail.summary");
  const risk = useTranslations("common.risk");
  const score = useTranslations("common.score");
  const notVisible = result.unresolved.length - result.unanswered.length;
  const notCounted = result.notApplicable.length;
  const live =
    answered === 0
      ? t("noAnswers")
      : result.assessable
        ? t("live", { score: score("value", { score: String(result.score) }), risk: result.riskLevel ? risk(result.riskLevel) : "" })
        : t("liveNotAssessable");

  return (
    <section aria-labelledby="review-summary-title" className={cn("flex flex-col gap-4 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10", className)}>
      <div className="flex flex-col gap-1">
        <h2 id="review-summary-title" className="font-semibold">
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {answered === 0 ? (
          <span className="flex items-baseline gap-2 text-muted-foreground">
            <span aria-hidden className="text-3xl font-semibold">
              —
            </span>
            <span className="text-sm">{t("noAnswers")}</span>
          </span>
        ) : result.assessable ? (
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            <span className="sr-only">{score("label")}: </span>
            <bdi>{score("value", { score: String(result.score) })}</bdi>
          </span>
        ) : (
          <ScoreBadge score={null} />
        )}
        {answered > 0 && result.riskLevel && <RiskBadge level={result.riskLevel} />}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic>
        {live}
      </p>

      <dl className="grid grid-cols-3 gap-2 text-center text-xs">
        <Count label={t("compliant")} value={result.compliant.length} tone={TONE_TEXT.success} />
        <Count label={t("violated")} value={result.violated.length} tone="text-destructive" />
        <Count label={t("notCounted")} value={notCounted} tone="text-muted-foreground" />
      </dl>
      <p className="text-sm text-muted-foreground tabular-nums">{t("answered", { answered: String(answered), total: String(total) })}</p>
      {notVisible > 0 && <p className="text-xs text-muted-foreground">{t("unresolved", { count: notVisible })}</p>}

      {missing.length > 0 ? (
        <StepLinks icon={CircleAlertIcon} title={t("missing", { count: missing.length })} steps={missing} onGoToStep={onGoToStep} />
      ) : (
        <p className="flex items-start gap-2 text-sm">
          <CircleCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          {t("ready")}
        </p>
      )}
      {unsure.length > 0 && (
        <StepLinks icon={TriangleAlertIcon} title={t("unsure", { count: unsure.length })} steps={unsure} onGoToStep={onGoToStep} />
      )}

      {saveError && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {t("saveError")}
        </p>
      )}

      <div className="hidden flex-col gap-2 lg:flex">
        <FinalizeButton saving={saving} finalizing={finalizing} onFinalize={onFinalize} />
      </div>
    </section>
  );
}

/** Steps to look at, each a link that scrolls to the step and focuses its title. */
function StepLinks({
  icon: Icon,
  title,
  steps,
  onGoToStep,
}: {
  icon: typeof CircleAlertIcon;
  title: string;
  steps: readonly MissingStep[];
  onGoToStep: (stepId: string) => void;
}) {
  const t = useTranslations("scans.detail.summary");
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-warning/10 p-3 text-sm ring-1 ring-warning/30">
      <p className="flex items-start gap-2 font-medium">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {title}
      </p>
      <ul className="flex flex-col gap-1 ps-6">
        {steps.map((m) => (
          <li key={m.id}>
            <a
              href={`#step-${m.id}`}
              onClick={(e) => {
                e.preventDefault();
                onGoToStep(m.id);
              }}
              className="line-clamp-2 underline underline-offset-4 hover:no-underline"
            >
              {t("goToStep", { number: String(m.number), text: m.text })}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Phones: the live score and the finalise button stay at the bottom of the screen while the examiner scrolls. */
export function MobileFinalizeBar({
  result,
  answered,
  saving,
  finalizing,
  onFinalize,
}: {
  result: ScoreResult;
  answered: number;
  saving: boolean;
  finalizing: boolean;
  onFinalize: () => void;
}) {
  const t = useTranslations("scans.detail.summary");
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-backdrop-filter:bg-background/80 md:-mx-6 md:px-6 lg:hidden print:hidden">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t("title")}</span>
        <span className="flex items-center gap-1.5">
          {answered === 0 ? (
            <span className="text-sm text-muted-foreground">{t("noAnswers")}</span>
          ) : (
            <>
              <ScoreBadge score={result.assessable ? result.score : null} />
              {result.riskLevel && <RiskBadge level={result.riskLevel} />}
            </>
          )}
        </span>
      </div>
      <div className="ms-auto flex flex-col items-end gap-1">
        <FinalizeButton saving={saving} finalizing={finalizing} onFinalize={onFinalize} compact />
      </div>
    </div>
  );
}

function FinalizeButton({
  saving,
  finalizing,
  onFinalize,
  compact,
}: {
  saving: boolean;
  finalizing: boolean;
  onFinalize: () => void;
  compact?: boolean;
}) {
  const tf = useTranslations("scans.detail.finalize");
  return (
    <>
      <Button size="lg" className={cn("h-11", compact ? "px-4" : "w-full")} onClick={onFinalize} disabled={finalizing || saving}>
        {finalizing || saving ? <Spinner aria-hidden /> : <LockIcon aria-hidden />}
        {finalizing ? tf("working") : tf("button")}
      </Button>
      {saving && !compact && <p className="text-center text-xs text-muted-foreground">{tf("waitSaving")}</p>}
    </>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex flex-col-reverse gap-0.5 rounded-lg bg-muted/50 px-2 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</dd>
    </div>
  );
}
