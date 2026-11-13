"use client";

import {
  BookOpenIcon,
  CheckIcon,
  CameraIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CircleMinusIcon,
  CircleXIcon,
  ClipboardCheckIcon,
  ExternalLinkIcon,
  PencilLineIcon,
  RotateCcwIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldContent, FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewErrorKey } from "@/lib/scans/client/review-errors";
import { STEP_NOTE_MAX } from "@/lib/scans/constants";
import type { ScanDetailStep } from "@/lib/scans/detail";
import { aiNeedsReview, confidenceLevel, isDecisiveAi, selectedVerdict, stepReviewState } from "@/lib/scans/review-core";
import { FINAL_VERDICTS } from "@/lib/scans/schemas";
import type { FinalVerdict } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { TONE_TEXT, VerdictBadge } from "@/components/shared/status-badges";

export type SaveState = { status: "idle" | "saving" | "saved" } | { status: "error"; key: ReviewErrorKey };

const OPTION_ICON = { compliant: CircleCheckIcon, non_compliant: CircleXIcon, not_applicable: CircleMinusIcon } as const;
const OPTION_TONE = {
  compliant: "text-success",
  non_compliant: "text-destructive",
  not_applicable: "text-muted-foreground",
} as const;

/**
 * One checklist step on the review screen: what to check, the AI's verdict with its confidence and evidence (visual
 * steps), and the examiner's decision as a radio group (the AI's verdict preselected and marked), with "back to the AI
 * verdict" / "clear", an optional note, and the save state of this step (a polite live region).
 */
export function StepReview({
  step,
  number,
  finalVerdict,
  note,
  save,
  disabled,
  onDecide,
  onNote,
  onRetry,
}: {
  step: ScanDetailStep;
  number: number;
  finalVerdict: FinalVerdict | null;
  note: string;
  save: SaveState;
  disabled: boolean;
  onDecide: (verdict: FinalVerdict | null) => void;
  onNote: (note: string) => void;
  /** Sends the change that failed again. */
  onRetry: () => void;
}) {
  const t = useTranslations("scans.detail.step");
  const ts = useTranslations("scans");
  const verdicts = useTranslations("common.verdict");
  const id = useId();
  const [noteOpen, setNoteOpen] = useState(note !== "");
  const [draft, setDraft] = useState(note);
  const [focusedDraft, setFocusedDraft] = useState(false);
  const articleRef = useRef<HTMLElement>(null);

  const result = { aiVerdict: step.aiVerdict, finalVerdict };
  const selected = selectedVerdict(result);
  const state = stepReviewState(result);
  const decisiveAi = isDecisiveAi(step.aiVerdict) ? step.aiVerdict : null;
  const required = step.isMandatory || step.isCritical;
  const blocking = state === "unanswered" && required;
  // A verdict the AI itself is unsure about counts as it is unless the examiner looks: mark it like a missing answer.
  const flagged = state === "ai_accepted" && aiNeedsReview(step.aiVerdict, step.aiConfidence);
  const titleId = `${id}-title`;
  const legendId = `${id}-legend`;
  const stateText =
    state === "unanswered"
      ? required
        ? t("state.unanswered")
        : t("state.unansweredOptional")
      : flagged
        ? t("state.ai_flagged")
        : t(`state.${state}`);
  // Keep the text being typed while the box has focus; otherwise show what was saved.
  // A note that could not be saved stays in the box (the step shows the error and a retry).
  const noteValue = focusedDraft || (save.status === "error" && draft.trim() !== note.trim()) ? draft : note;

  /**
   * "Confirm the AI verdict", "Use the AI verdict" and "Clear the answer" exist only in the state they change, so the
   * button just pressed is gone after the update and focus would fall back to <body> (WCAG 2.4.3). Focus stays in this
   * step instead: on its decision, the checked option (or the first one when the answer was cleared), which also reads
   * out the new state (the radio group is described by it).
   */
  const decideFromButton = (verdict: FinalVerdict | null) => {
    onDecide(verdict);
    requestAnimationFrame(() => {
      const card = articleRef.current;
      if (!card || card.contains(document.activeElement)) return;
      const option =
        card.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? card.querySelector<HTMLElement>('[role="radio"]');
      option?.focus();
    });
  };

  return (
    <article
      ref={articleRef}
      id={`step-${step.id}`}
      data-step-key={step.key}
      data-state={state}
      data-flagged={flagged || undefined}
      aria-labelledby={titleId}
      className={cn(
        "flex scroll-mt-20 flex-col gap-4 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10",
        (blocking || flagged) && "ring-2 ring-warning/60",
        save.status === "error" && "ring-destructive/60",
      )}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary tabular-nums"
        >
          {number}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3 id={titleId} tabIndex={-1} className="font-medium leading-snug outline-none">
            <span className="sr-only">{t("number", { number: String(number) })}: </span>
            {step.text}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {step.isCritical && (
              <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive" title={t("criticalHint")}>
                <TriangleAlertIcon aria-hidden />
                {t("critical")}
              </Badge>
            )}
            {!step.isMandatory && <Badge variant="secondary">{t("optional")}</Badge>}
            <Badge variant="outline" className="text-muted-foreground">
              {step.visualCheck ? <CameraIcon aria-hidden /> : <ClipboardCheckIcon aria-hidden />}
              {step.visualCheck ? t("photoCheck") : t("manualCheck")}
            </Badge>
          </div>
        </div>
      </header>

      <Collapsible className="-mt-1">
        <CollapsibleTrigger className="group/why flex min-h-8 items-center gap-1 rounded-md py-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
          <BookOpenIcon aria-hidden className="size-4" />
          {step.criteria && step.visualCheck ? t("criteria") : t("why")}
          <ChevronDownIcon aria-hidden className="size-4 transition-transform group-data-[panel-open]/why:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          {step.criteria && step.visualCheck && <p>{step.criteria}</p>}
          <p className="text-muted-foreground">{step.rationale}</p>
          {step.referenceLabel && (
            <p className="text-xs text-muted-foreground">
              {step.referenceUrl ? (
                <a href={step.referenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground">
                  {t("source", { label: step.referenceLabel })}
                  <ExternalLinkIcon aria-hidden className="size-3" />
                </a>
              ) : (
                t("source", { label: step.referenceLabel })
              )}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      <AiBox step={step} labelledBy={titleId} />

      <div className="flex flex-col gap-2">
        <p id={legendId} className="text-sm font-medium">
          {t("decision")}
        </p>
        <RadioGroup
          aria-labelledby={`${legendId} ${titleId}`}
          aria-describedby={`${id}-state`}
          value={selected ?? ""}
          onValueChange={(v) => onDecide(v as FinalVerdict)}
          disabled={disabled}
          className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3"
        >
          {FINAL_VERDICTS.map((v) => {
            const Icon = OPTION_ICON[v];
            const optionId = `${id}-${v}`;
            return (
              <FieldLabel key={v} htmlFor={optionId} className="w-full">
                <Field orientation="horizontal" className="min-h-11 items-center">
                  <RadioGroupItem value={v} id={optionId} />
                  <FieldContent>
                    <FieldTitle>
                      <Icon aria-hidden className={cn("size-4", OPTION_TONE[v])} />
                      {verdicts(v)}
                    </FieldTitle>
                    {decisiveAi === v && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <SparklesIcon aria-hidden className="size-3" />
                        {t("aiMark")}
                      </span>
                    )}
                  </FieldContent>
                </Field>
              </FieldLabel>
            );
          })}
        </RadioGroup>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p
            id={`${id}-state`}
            className={cn(
              "text-xs",
              blocking || flagged ? cn("font-medium", TONE_TEXT.warning) : "text-muted-foreground",
            )}
          >
            {stateText}
          </p>
          {flagged && decisiveAi && (
            // The preselected radio cannot be "chosen again": confirming an unsure verdict needs its own control.
            <Button type="button" variant="outline" size="sm" className="h-8" disabled={disabled} onClick={() => decideFromButton(decisiveAi)}>
              <CheckIcon aria-hidden />
              {t("confirmAi")}
            </Button>
          )}
          {finalVerdict && (
            <Button type="button" variant="ghost" size="sm" className="h-8" disabled={disabled} onClick={() => decideFromButton(null)}>
              <RotateCcwIcon aria-hidden />
              {decisiveAi ? t("backToAi") : t("clear")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {noteOpen ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-note`} className="text-sm font-medium">
              {t("note")}
            </label>
            <Textarea
              id={`${id}-note`}
              value={noteValue}
              maxLength={STEP_NOTE_MAX}
              rows={2}
              disabled={disabled}
              placeholder={t("notePlaceholder")}
              aria-describedby={`${id}-note-hint`}
              onFocus={() => {
                setDraft(noteValue);
                setFocusedDraft(true);
              }}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                setFocusedDraft(false);
                if (draft.trim() !== note.trim()) onNote(draft);
              }}
            />
            <p id={`${id}-note-hint`} className="text-xs text-muted-foreground">
              {state === "changed" && !note ? t("changedHint") : t("noteHint", { max: String(STEP_NOTE_MAX) })}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={disabled}
              onClick={() => {
                setNoteOpen(true);
                requestAnimationFrame(() => document.getElementById(`${id}-note`)?.focus());
              }}
            >
              <PencilLineIcon aria-hidden />
              {t("addNote")}
            </Button>
            {state === "changed" && <p className="text-xs text-muted-foreground">{t("changedHint")}</p>}
          </div>
        )}
        <SaveStatus save={save} errorText={save.status === "error" ? ts(save.key) : null} onRetry={disabled ? undefined : onRetry} />
      </div>
    </article>
  );
}

function SaveStatus({ save, errorText, onRetry }: { save: SaveState; errorText: string | null; onRetry?: () => void }) {
  const t = useTranslations("scans.detail.step");
  return (
    <div aria-live="polite" className="flex min-h-4 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {save.status === "saving" && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Spinner aria-hidden className="size-3" />
          {t("saving")}
        </span>
      )}
      {save.status === "saved" && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CircleCheckIcon aria-hidden className="size-3.5" />
          {t("saved")}
        </span>
      )}
      {save.status === "error" && errorText && (
        <>
          <span role="alert" className="flex items-center gap-1.5 font-medium text-destructive">
            <CircleAlertIcon aria-hidden className="size-3.5" />
            {t("saveFailed", { reason: errorText })}
          </span>
          {onRetry && (
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={onRetry}>
              <RotateCcwIcon aria-hidden />
              {t("retry")}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The AI's assessment of a visual step (or why there is none). Evidence is in the viewer's language. A group named
 * after its step ("AI assessment, Step 2: …"), not a landmark: one landmark per step would fill the landmark list
 * with identical "AI assessment" regions.
 */
function AiBox({ step, labelledBy }: { step: ScanDetailStep; labelledBy: string }) {
  const t = useTranslations("scans.detail.step");
  const score = useTranslations("common.score");
  const aiTitleId = `${labelledBy}-ai`;
  if (!step.visualCheck) {
    return <p className="text-sm text-muted-foreground">{t("manualOnly")}</p>;
  }
  if (!step.aiVerdict) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <CircleHelpIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t("noAi")}
      </p>
    );
  }
  const confidence = step.aiConfidence ?? 0;
  const level = confidenceLevel(confidence);
  const flagged = aiNeedsReview(step.aiVerdict, step.aiConfidence);
  return (
    <div
      role="group"
      aria-labelledby={`${aiTitleId} ${labelledBy}`}
      className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm"
      data-ai-verdict={step.aiVerdict}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span id={aiTitleId} className="flex items-center gap-1.5 font-medium">
          <SparklesIcon aria-hidden className="size-4 text-primary" />
          {t("aiTitle")}
        </span>
        <VerdictBadge verdict={step.aiVerdict} />
        {step.aiVerdict !== "not_visible" && (
          <span className={cn("text-xs tabular-nums", level === "low" ? "font-medium" : "text-muted-foreground")}>
            {/* The percentage is isolated (<bdi>) like every score: in Arabic its sign then sits on the same side. */}
            {t.rich(`confidence.${level}`, { value: score("value", { score: String(Math.round(confidence * 100)) }), pct: (c) => <bdi>{c}</bdi> })}
          </span>
        )}
      </div>
      {step.evidence && <p className="text-muted-foreground">{step.evidence}</p>}
      {step.aiVerdict === "not_visible" ? (
        <p className="text-xs">{t("notVisible")}</p>
      ) : (
        flagged && (
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <TriangleAlertIcon aria-hidden className="size-3.5" />
            {t("lowConfidence")}
          </p>
        )
      )}
    </div>
  );
}
