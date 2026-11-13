"use client";

import { LockIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { finalizeScanAction, saveStepAction } from "@/lib/scans/actions";
import { callAction, type ReviewErrorKey, reviewErrorKey } from "@/lib/scans/client/review-errors";
import type { ScanDetailStep } from "@/lib/scans/detail";
import { aiNeedsReview, isDecisiveAi } from "@/lib/scans/review-core";
import { canFinalizeScan, type FinalVerdict, scoreScan } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { markJustFinalized } from "./report-focus";
import { type RegisterNotesFlush, ReviewNotesContext } from "./review-notes-context";
import { MobileFinalizeBar, ReviewSummary } from "./review-summary";
import { type SaveState, StepReview } from "./step-review";
import { RiskBadge, ScoreBadge, TONE_TEXT } from "@/components/shared/status-badges";

type Saved = { finalVerdict: FinalVerdict | null; note: string };

/**
 * The examiner's review of one scan (draft / review / failed). Every decision and note is saved at once through a
 * Server Action (optimistic, reverted with a message when the save fails; only the newest request of a step updates
 * it); the live result is lib/scoring's scoreScan on the current answers, and finalising is allowed when
 * canFinalizeScan is ok (the server checks both again). Notes typed but not saved yet are saved first. On success the
 * server re-renders the page as the report.
 */
export function ScanReview({
  scanId,
  steps,
  children,
  after,
}: {
  scanId: string;
  steps: readonly ScanDetailStep[];
  /** Server-rendered parts above the checklist (analysis, photos, AI summary). */
  children?: React.ReactNode;
  /** Server-rendered parts below the checklist (notes). */
  after?: React.ReactNode;
}) {
  const t = useTranslations("scans.detail");
  const ts = useTranslations("scans");
  const actions = useTranslations("common.actions");
  const locale = useLocale();
  const router = useRouter();

  const initial = useMemo(() => Object.fromEntries(steps.map((s) => [s.id, { finalVerdict: s.finalVerdict, note: s.note ?? "" }])), [steps]);
  const [values, setValues] = useState<Record<string, Saved>>(initial);
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  const saved = useRef<Record<string, Saved>>(initial);
  const seq = useRef<Record<string, number>>({});
  /** Per step: the changes the server has not accepted yet (sent again by "Try again"), and why. */
  const failed = useRef<Record<string, { change: { verdict?: FinalVerdict | null; note?: string }; key: ReviewErrorKey }>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalizing, startFinalize] = useTransition();
  const [locked, setLocked] = useState(false);
  const notesFlush = useRef<(() => Promise<boolean>) | null>(null);
  const registerNotesFlush = useCallback<RegisterNotesFlush>((flush) => {
    notesFlush.current = flush;
    return () => {
      if (notesFlush.current === flush) notesFlush.current = null;
    };
  }, []);

  const meta = steps.map((s) => ({ id: s.id, weight: s.weight, isMandatory: s.isMandatory, isCritical: s.isCritical }));
  const results = steps.map((s) => ({ stepId: s.id, aiVerdict: s.aiVerdict, finalVerdict: values[s.id]?.finalVerdict ?? null }));
  const result = scoreScan(meta, results);
  const gate = canFinalizeScan(meta, results);
  const numberOf = new Map(steps.map((s, i) => [s.id, i + 1]));
  const missing = gate.missing.map((id) => ({ id, number: numberOf.get(id) ?? 0, text: steps.find((s) => s.id === id)?.text ?? "" }));
  // Verdicts the AI flagged as unsure that nobody confirmed or changed: they count as they are, so they are listed.
  const unsure = steps
    .filter((s) => !values[s.id]?.finalVerdict && isDecisiveAi(s.aiVerdict) && aiNeedsReview(s.aiVerdict, s.aiConfidence))
    .map((s) => ({ id: s.id, number: numberOf.get(s.id) ?? 0, text: s.text }));
  // Steps with an answer that counts: the examiner's, or a decisive AI verdict. A not-visible AI result is no answer
  // (it is not counted, and the summary lists it on its own line), even though it does not block finalising
  // (canFinalizeScan stays the gate).
  const answered = results.filter((r) => r.finalVerdict || isDecisiveAi(r.aiVerdict)).length;
  const saving = Object.values(saves).some((s) => s.status === "saving");
  const saveError = Object.values(saves).some((s) => s.status === "error");

  const setSave = (stepId: string, state: SaveState) => setSaves((all) => ({ ...all, [stepId]: state }));

  async function save(stepId: string, change: { verdict?: FinalVerdict | null; note?: string }) {
    const mine = (seq.current[stepId] ?? 0) + 1;
    seq.current[stepId] = mine;
    setValues((all) => ({
      ...all,
      [stepId]: {
        finalVerdict: change.verdict !== undefined ? change.verdict : all[stepId].finalVerdict,
        note: change.note !== undefined ? change.note.trim() : all[stepId].note,
      },
    }));
    setSave(stepId, { status: "saving" });
    const res = await callAction(() => saveStepAction(locale, { scanId, stepId, ...change }));
    if (res.ok) {
      saved.current[stepId] = { finalVerdict: res.finalVerdict, note: res.note ?? "" };
      // What this request saved is no longer pending; a field that failed earlier and was not part of it still is.
      const pending = { ...failed.current[stepId]?.change };
      for (const k of Object.keys(change) as Array<keyof typeof change>) delete pending[k];
      if (Object.keys(pending).length > 0) failed.current[stepId] = { change: pending, key: failed.current[stepId]!.key };
      else delete failed.current[stepId];
    } else {
      failed.current[stepId] = { change: { ...failed.current[stepId]?.change, ...change }, key: reviewErrorKey(res.error) };
    }
    if (seq.current[stepId] !== mine) return; // a newer change of this step is on its way
    setValues((all) => ({ ...all, [stepId]: saved.current[stepId] }));
    const stillFailed = failed.current[stepId];
    // The step shows an error itself (role="alert"); a toast would announce it twice.
    setSave(stepId, stillFailed ? { status: "error", key: stillFailed.key } : { status: "saved" });
    if (!res.ok && res.error === "finalized") {
      setLocked(true);
      toast.error(ts(reviewErrorKey(res.error)));
      router.refresh();
    }
  }

  const goToStep = (stepId: string) => {
    const card = document.getElementById(`step-${stepId}`);
    card?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    card?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
  };

  const requestFinalize = () => {
    if (!gate.ok) {
      toast.error(t("errors.incomplete"));
      if (gate.missing[0]) goToStep(gate.missing[0]);
      return;
    }
    setConfirmOpen(true);
  };

  const finalize = () => {
    startFinalize(async () => {
      // Once finalised the scan never changes again: notes typed but not saved go first (the form shows why if not).
      if (notesFlush.current && !(await notesFlush.current())) {
        setConfirmOpen(false);
        toast.error(t("finalize.notesFailed"));
        return;
      }
      markJustFinalized(scanId);
      const res = await callAction(() => finalizeScanAction(locale, { scanId }));
      if (res.ok) {
        setConfirmOpen(false);
        toast.success(t("finalize.done"));
        return;
      }
      markJustFinalized(null);
      setConfirmOpen(false);
      toast.error(ts(reviewErrorKey(res.error)));
      if (res.error === "incomplete" && "missing" in res && res.missing?.[0]) goToStep(res.missing[0]);
      if (res.error === "finalized") router.refresh();
    });
  };

  const disabled = locked || finalizing;
  const notVisible = result.unresolved.length - result.unanswered.length;

  return (
    // A flex column around the grid: the phone's sticky finalise bar needs the whole review as its containing block
    // (a sticky grid item could only move inside its own grid row).
    <ReviewNotesContext value={registerNotesFlush}>
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            {children}
            <section aria-labelledby="checklist-title" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="checklist-title" className="text-lg font-semibold">
                  {t("review.checklist")}
                </h2>
                <span className="text-sm text-muted-foreground">{t("review.checklistCount", { count: steps.length })}</span>
              </div>
              <ol className="flex flex-col gap-3">
                {steps.map((step, i) => (
                  <li key={step.id}>
                    <StepReview
                      step={step}
                      number={i + 1}
                      finalVerdict={values[step.id]?.finalVerdict ?? null}
                      note={values[step.id]?.note ?? ""}
                      save={saves[step.id] ?? { status: "idle" }}
                      disabled={disabled}
                      onDecide={(verdict) => void save(step.id, { verdict })}
                      onNote={(note) => void save(step.id, { note })}
                      onRetry={() => {
                        const pending = failed.current[step.id];
                        if (pending) void save(step.id, pending.change);
                      }}
                    />
                  </li>
                ))}
              </ol>
            </section>
            {after}
          </div>

          <ReviewSummary
            className="lg:sticky lg:top-20"
            result={result}
            answered={answered}
            total={steps.length}
            missing={missing}
            unsure={unsure}
            saving={saving}
            saveError={saveError}
            finalizing={finalizing}
            onFinalize={requestFinalize}
            onGoToStep={goToStep}
          />
        </div>
        <MobileFinalizeBar result={result} answered={answered} saving={saving} finalizing={finalizing} onFinalize={requestFinalize} />

        <AlertDialog open={confirmOpen} onOpenChange={(open) => !finalizing && setConfirmOpen(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <LockIcon aria-hidden />
              </AlertDialogMedia>
              <AlertDialogTitle>{t("finalize.title")}</AlertDialogTitle>
              <AlertDialogDescription>{t("finalize.description")}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-2 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span>{t("report.result")}:</span>
                <ScoreBadge score={result.assessable ? result.score : null} />
                {result.riskLevel && <RiskBadge level={result.riskLevel} />}
              </p>
              {unsure.length > 0 && (
                <p className={cn("font-medium", TONE_TEXT.warning)}>
                  {t("finalize.unsure", { count: unsure.length })}
                </p>
              )}
              {notVisible > 0 && <p className="text-muted-foreground">{t("finalize.unresolved", { count: notVisible })}</p>}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={finalizing}>{actions("cancel")}</AlertDialogCancel>
              <Button onClick={finalize} disabled={finalizing || saving}>
                {finalizing ? <Spinner aria-hidden /> : <LockIcon aria-hidden />}
                {finalizing ? t("finalize.working") : t("finalize.confirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ReviewNotesContext>
  );
}
