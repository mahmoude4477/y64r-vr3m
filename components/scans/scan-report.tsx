import { ArrowUpRightIcon, CircleCheckIcon, GraduationCapIcon, LockIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { RecommendedScenario } from "@/lib/recommendations";
import type { ScanDetail, ScanDetailStep } from "@/lib/scans/detail";
import { confidenceLevel, reportDecision, type RiskReason } from "@/lib/scans/review-core";
import type { ScoreResult } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { ScanMeta } from "./scan-meta";
import { UserText } from "./user-text";
import { RiskBadge, ScoreBadge, TONE_TEXT, VerdictBadge } from "@/components/shared/status-badges";

export type ReportRecommendation = { step: ScanDetailStep; number: number; critical: boolean; scenario: RecommendedScenario | null; scenarioTitle: string | null };

/**
 * The read-only report of a finalised scan: the result (stored score and risk, with the reason), who / what / where /
 * when (the institution too: the printed report must stand on its own), what to improve (lib/recommendations order,
 * with a training scenario where one exists), every step with the AI assessment, the final result and the note, the
 * photos (slot) and the notes. Printable: the app chrome and the actions hide themselves, sections avoid page breaks
 * inside, and the steps table is not a scroll box in print (a scroll box cannot split across pages, so rows were cut).
 */
export function ScanReport({
  scan,
  result,
  reason,
  recommendations,
  photos,
}: {
  scan: ScanDetail;
  result: ScoreResult;
  reason: RiskReason;
  recommendations: readonly ReportRecommendation[];
  photos: React.ReactNode;
}) {
  const t = useTranslations("scans.detail.report");
  const format = useFormatter();
  const tc = useTranslations("scans.detail.report.counts");
  const assessable = scan.score !== null && scan.riskLevel !== null;
  const tp = useTranslations("scans.detail.photos");
  const notVisible = result.unresolved.length - result.unanswered.length;
  const notApplicable = result.notApplicable.length - result.unresolved.length;

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      {scan.finalizedAt && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LockIcon aria-hidden className="size-4 shrink-0" />
          {t("finalizedOn", { date: format.dateTime(scan.finalizedAt, "dateTime") })}
        </p>
      )}

      <section aria-labelledby="report-result" className="grid gap-5 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 break-inside-avoid md:grid-cols-[16rem_minmax(0,1fr)] md:p-6">
        <div className="flex flex-col gap-3">
          <h2 id="report-result" className="text-sm font-medium text-muted-foreground">
            {t("result")}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {scan.score === null ? (
              <ScoreBadge score={null} />
            ) : (
              <ScoreRing score={scan.score} />
            )}
            {scan.riskLevel && <RiskBadge level={scan.riskLevel} className="h-6 px-2.5 text-sm" />}
          </div>
          <p className="text-sm">{t.rich(`riskReason.${reason}`, { pct: (c) => <bdi>{c}</bdi> })}</p>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Count label={tc("compliant")} value={result.compliant.length} />
            <Count label={tc("violated")} value={result.violated.length} strong={result.violated.length > 0} />
            {notApplicable > 0 && <Count label={tc("notApplicable")} value={notApplicable} />}
            {notVisible > 0 && <Count label={tc("notVisible")} value={notVisible} />}
            {result.unanswered.length > 0 && <Count label={tc("unanswered")} value={result.unanswered.length} />}
          </dl>
        </div>
        <ScanMeta scan={scan} variant="report" className="content-start" />
      </section>

      <Recommendations items={recommendations} assessable={assessable} />

      <ReportSteps steps={scan.steps} />

      <section aria-labelledby="report-photos" className="flex flex-col gap-3 break-inside-avoid">
        <h2 id="report-photos" className="text-lg font-semibold">
          {tp("title")}
        </h2>
        {photos}
      </section>

      <ReportNotes notes={scan.notes} aiNotes={scan.overallNotes} />

      <p className="hidden text-xs text-muted-foreground print:block">
        {t("printedOn", { date: format.dateTime(new Date(), "dateTime") })}
      </p>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const s = useTranslations("common.score");
  const tone = score >= 80 ? "text-risk-low" : score >= 50 ? "text-risk-medium" : "text-risk-high";
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} className="fill-none stroke-muted" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className={cn("fill-none stroke-current", tone)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(c * score) / 100} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold tabular-nums">
        <span className="sr-only">{s("label")}: </span>
        <bdi>{s("value", { score: String(score) })}</bdi>
      </span>
    </div>
  );
}

function Count({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-semibold tabular-nums", strong && "text-destructive")}>{value}</dd>
    </div>
  );
}

function Recommendations({ items, assessable }: { items: readonly ReportRecommendation[]; assessable: boolean }) {
  const t = useTranslations("scans.detail.report.recommendations");
  const step = useTranslations("scans.detail.step");
  const difficulty = useTranslations("common.difficulty");
  return (
    <section aria-labelledby="report-recommendations" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="report-recommendations" className="text-lg font-semibold">
          {t("title")}
        </h2>
        {items.length > 0 && <p className="text-sm text-muted-foreground">{t("description")}</p>}
      </div>
      {items.length === 0 && !assessable ? (
        // Nothing was counted, so there is nothing to praise either.
        <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">{t("notAssessable")}</p>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-success/10 p-4 text-sm ring-1 ring-success/25">
          <CircleCheckIcon aria-hidden className="size-5 shrink-0 text-success" />
          {t("none")}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((r) => (
            <li key={r.step.id} data-step-key={r.step.key} className="flex flex-col gap-2 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 break-inside-avoid">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 flex-1 font-medium">
                  <span className="text-muted-foreground tabular-nums">{r.number}. </span>
                  {r.step.text}
                </h3>
                {r.critical && (
                  <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive">
                    <TriangleAlertIcon aria-hidden />
                    {step("critical")}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{t("why")}: </span>
                {r.step.rationale}
              </p>
              {r.step.referenceLabel && (
                <p className="text-xs text-muted-foreground">
                  {r.step.referenceUrl ? (
                    <a href={r.step.referenceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">
                      {step("source", { label: r.step.referenceLabel })}
                    </a>
                  ) : (
                    step("source", { label: r.step.referenceLabel })
                  )}
                </p>
              )}
              {r.scenario && r.scenarioTitle ? (
                <Link
                  href={`/simulations/${r.scenario.slug}`}
                  className="flex items-center gap-3 self-start rounded-lg bg-primary/8 px-3 py-2 text-sm ring-1 ring-primary/20 outline-none hover:bg-primary/12 focus-visible:ring-3 focus-visible:ring-ring/50 print:ring-0"
                >
                  <GraduationCapIcon aria-hidden className="size-4 shrink-0 text-primary" />
                  <span className="flex flex-col">
                    <span className="font-medium">{t("train", { title: r.scenarioTitle })}</span>
                    <span className="text-xs text-muted-foreground">
                      {difficulty(r.scenario.difficulty)} · {t("minutes", { count: r.scenario.estimatedMinutes })}
                    </span>
                  </span>
                  <ArrowUpRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100 print:hidden" />
                </Link>
              ) : (
                <p className="text-xs text-muted-foreground">{t("noScenario")}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Every step: a table when the report is at least 42rem wide (a container query: with the sidebar open, a 768-820 px
 * tablet leaves about 30rem, too narrow for four columns) and always in print; cards otherwise.
 */
function ReportSteps({ steps }: { steps: readonly ScanDetailStep[] }) {
  const t = useTranslations("scans.detail.report.steps");
  return (
    <section aria-labelledby="report-steps" className="@container flex flex-col gap-3">
      <h2 id="report-steps" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <div className="hidden overflow-hidden rounded-xl ring-1 ring-foreground/10 @min-[42rem]:block print:block print:overflow-visible print:[&_[data-slot=table-container]]:overflow-visible">
        <Table>
          <TableCaption className="sr-only">{t("caption")}</TableCaption>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="w-[45%] ps-4">{t("step")}</TableHead>
              <TableHead>{t("ai")}</TableHead>
              <TableHead>{t("result")}</TableHead>
              <TableHead className="pe-4">{t("note")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {steps.map((s, i) => (
              <TableRow key={s.id} data-step-key={s.key} className="break-inside-avoid align-top">
                <TableCell className="ps-4 whitespace-normal">
                  <span className="flex gap-2">
                    <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                    <span className="flex flex-col gap-1">
                      <span>{s.text}</span>
                      <StepFlags step={s} />
                    </span>
                  </span>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <AiCell step={s} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <ResultCell step={s} />
                </TableCell>
                <TableCell className="max-w-56 pe-4 text-sm whitespace-normal text-muted-foreground">
                  {s.note ? <UserText>{s.note}</UserText> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ol className="flex flex-col gap-3 @min-[42rem]:hidden print:hidden">
        {steps.map((s, i) => (
          <li key={s.id} data-step-key={s.key} className="flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
            <p className="flex gap-2 font-medium">
              <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
              <span className="flex flex-col gap-1">
                <span>{s.text}</span>
                <StepFlags step={s} />
              </span>
            </p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{t("ai")}</dt>
                <dd>
                  <AiCell step={s} />
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{t("result")}</dt>
                <dd>
                  <ResultCell step={s} />
                </dd>
              </div>
              {s.note && (
                <div className="col-span-2 flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">{t("note")}</dt>
                  <dd className="text-muted-foreground">
                    <UserText>{s.note}</UserText>
                  </dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepFlags({ step }: { step: ScanDetailStep }) {
  const t = useTranslations("scans.detail.step");
  if (!step.isCritical && step.isMandatory) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {step.isCritical && (
        <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive">
          <TriangleAlertIcon aria-hidden />
          {t("critical")}
        </Badge>
      )}
      {!step.isMandatory && <Badge variant="secondary">{t("optional")}</Badge>}
    </span>
  );
}

/** The AI's verdict with its confidence; a confidence under the review threshold is named, as on the review screen. */
function AiCell({ step }: { step: ScanDetailStep }) {
  const t = useTranslations("scans.detail.report.steps");
  const score = useTranslations("common.score");
  if (!step.aiVerdict) return <span className="text-sm text-muted-foreground">{t("noAi")}</span>;
  // A not-visible result has no confidence worth showing.
  const confidence = step.aiVerdict === "not_visible" ? null : step.aiConfidence;
  const percent = confidence === null ? null : score("value", { score: String(Math.round(confidence * 100)) });
  const low = confidence !== null && confidenceLevel(confidence) === "low";
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-1.5">
        <SparklesIcon aria-hidden className="size-3.5 text-muted-foreground" />
        <VerdictBadge verdict={step.aiVerdict} />
        {percent && (
          <span className={cn("text-xs tabular-nums", low ? "font-medium" : "text-muted-foreground")}>
            {low ? t.rich("lowConfidence", { value: percent, pct: (c) => <bdi>{c}</bdi> }) : <bdi>{percent}</bdi>}
          </span>
        )}
      </span>
      {step.evidence && <span className="text-xs text-muted-foreground">{step.evidence}</span>}
    </span>
  );
}

function ResultCell({ step }: { step: ScanDetailStep }) {
  const t = useTranslations("scans.detail.report.steps");
  const { aiVerdict, finalVerdict } = step;
  if (!finalVerdict) {
    // Finalising writes every decided step, so only not-visible and unanswered optional steps get here.
    return (
      <span className="flex flex-col items-start gap-1">
        <VerdictBadge verdict={aiVerdict === "not_visible" ? "not_visible" : "not_applicable"} />
        <span className="text-xs text-muted-foreground">{aiVerdict === "not_visible" ? t("notVisible") : t("unanswered")}</span>
      </span>
    );
  }
  const decision = reportDecision(step);
  const by = step.decidedBy;
  const person = () => (by ? <UserText>{by}</UserText> : null);
  const line =
    decision === "changed"
      ? by
        ? t.rich("changedBy", { name: by, person })
        : t("changed")
      : decision === "confirmed" && by
        ? t.rich("confirmedBy", { name: by, person })
        : decision === "acceptedUnsure"
          ? t("acceptedUnsure")
          : decision === "accepted"
            ? t("accepted")
            : decision === "decided" && by
              ? t.rich("decidedBy", { name: by, person })
              : null;
  return (
    <span className="flex flex-col items-start gap-1" data-decision={decision}>
      <VerdictBadge verdict={finalVerdict} />
      {line && (
        <span className={cn("flex items-start gap-1 text-xs", decision === "acceptedUnsure" ? cn("font-medium", TONE_TEXT.warning) : "text-muted-foreground")}>
          {decision === "acceptedUnsure" && <TriangleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />}
          {line}
        </span>
      )}
    </span>
  );
}

function ReportNotes({ notes, aiNotes }: { notes: string | null; aiNotes: string | null }) {
  const t = useTranslations("scans.detail.report.notes");
  return (
    <section aria-labelledby="report-notes" className="flex flex-col gap-3 break-inside-avoid">
      <h2 id="report-notes" className="text-lg font-semibold">
        {t("title")}
      </h2>
      {!notes && !aiNotes ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {notes && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
              <h3 className="font-medium">{t("examiner")}</h3>
              <p className="whitespace-pre-line text-muted-foreground">
                <UserText>{notes}</UserText>
              </p>
            </div>
          )}
          {aiNotes && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
              <h3 className="flex items-center gap-1.5 font-medium">
                <SparklesIcon aria-hidden className="size-4 text-primary" />
                {t("ai")}
              </h3>
              <p className="text-muted-foreground">{aiNotes}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
