"use client";

import {
  BookOpenCheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ClipboardCheckIcon,
  InfoIcon,
  PlayIcon,
  RotateCcwIcon,
  TrophyIcon,
} from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import { type ActionError, answerStage, completeAttempt, restartAttempt, startAttempt } from "@/lib/simulations/actions";
import { nextStageIndex, optionSeed, shuffleOptions } from "@/lib/simulations/engine";
import type { PlayerData, PlayerStage } from "@/lib/simulations/queries";
import { cn } from "@/lib/utils";
import { markResultFocus } from "./result-focus";
import { ScenarioFacts } from "./scenario-meta";
import { ScoreBadge } from "@/components/shared/status-badges";

/**
 * A busy button stays focusable (aria-disabled; the handler ignores clicks) instead of `disabled`: a disabled button
 * that has focus drops it to <body> and keyboard or screen-reader users lose their place (WCAG 2.4.3).
 */
const BUSY = "aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

/** Text links of the player: a 32 px tap target (CONVENTIONS 9) and the same visible focus ring as the buttons. */
export const TEXT_LINK =
  "inline-flex min-h-8 w-fit items-center gap-2 rounded-md py-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

/**
 * The simulation player. All state that matters lives on the server (the attempt and its answers): this component
 * only shows the next unanswered stage, so a refresh, another device or a second tab resumes at the same place.
 * Focus moves to the new stage heading after each confirmed answer (WCAG 2.4.3), and a polite live region says the
 * answer was saved. Once the server says the attempt cannot go on here (the scenario was unpublished or replaced, or
 * the attempt counts for an institution that is no longer the active one), the player turns into a read-only notice
 * with the way back, and focus moves to that link (review round 2, UX-1): no form that can only fail again.
 */
export function ScenarioPlayer({ data }: { data: PlayerData }) {
  const t = useTranslations("simulations.player");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [attemptId, setAttemptId] = useState<string | null>(data.attempt?.id ?? null);
  const [answered, setAnswered] = useState<string[]>(data.attempt?.answeredStageIds ?? []);
  const [error, setError] = useState<string | null>(null);
  /** The scenario can no longer be played (unpublished, replaced, or the institution is no longer the active one). */
  const [unavailable, setUnavailable] = useState(false);
  const exitRef = useRef<HTMLAnchorElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  /** Set when the attempt completed and the result page is opening (see the Activity effects below). */
  const completed = useRef(false);

  const total = data.stages.length;
  const index = nextStageIndex(data.stages, answered);
  const n = (value: number) => format.number(value, "integer");

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    headingRef.current?.focus();
  }, [attemptId, index, finishing]);

  // The form that had focus is gone: keyboard and screen-reader users land on the way out (WCAG 2.4.3).
  useEffect(() => {
    if (unavailable) exitRef.current?.focus();
  }, [unavailable]);

  // With cacheComponents the router keeps this page alive but hidden (React Activity) while the result page shows.
  // When it is hidden after the attempt completed, go back to the intro, so returning with Back or a link never shows
  // a stuck "calculating" state; when it is shown again, fetch fresh server data (best score, no open attempt), whose
  // new key remounts the player.
  useLayoutEffect(
    () => () => {
      if (!completed.current) return;
      setFinishing(false);
      setAttemptId(null);
      setAnswered([]);
      setError(null);
      setUnavailable(false);
      setAnnouncement("");
    },
    [],
  );
  // An Effect Event: the router object may change identity during the navigation, which must not run this early.
  const refreshAfterResult = useEffectEvent(() => router.refresh());
  useEffect(() => {
    if (!completed.current) return;
    completed.current = false;
    refreshAfterResult();
  }, []);

  function messageFor(code: ActionError): string {
    switch (code) {
      case "already_answered":
      case "out_of_order":
        return t("errors.stale");
      case "not_found":
        return t("errors.notFound");
      case "invalid_choice":
      case "invalid_input":
        return t("errors.invalid");
      case "rate_limited":
        return t("errors.rateLimited");
      case "no_stages":
        return t("errors.noStages");
      case "not_playable":
        return t("errors.notPlayable");
      case "other_institution":
        return t("errors.otherInstitution");
      default:
        return t("errors.generic");
    }
  }

  /** Re-reads the open attempt from the server after another tab or device changed it. */
  async function resync() {
    const r = await startAttempt(locale, { scenarioId: data.scenario.id });
    if (r.ok) {
      setAttemptId(r.attemptId);
      setAnswered(r.answeredStageIds);
      moveFocus.current = true;
    }
  }

  function goToResult(id: string) {
    completed.current = true;
    setFinishing(true);
    moveFocus.current = true;
    // The result page moves focus to its heading when it opens from here (ResultFocus), not on every visit.
    markResultFocus(id);
    router.push(`/simulations/attempts/${id}`);
  }

  /** Shows the error; when the attempt cannot go on here, the player stays a read-only notice until the page changes. */
  function fail(code: ActionError) {
    setError(messageFor(code));
    if (code === "not_playable" || code === "other_institution") setUnavailable(true);
  }

  function begin(restart: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await (restart ? restartAttempt : startAttempt)(locale, { scenarioId: data.scenario.id });
        if (!r.ok) {
          if (r.error === "not_found") {
            // The scenario itself can no longer be started (unpublished or replaced since this page opened). An open
            // attempt is kept as it was: "Start over" closes nothing when it fails.
            setError(attemptId ? t("errors.notPlayable") : t("errors.scenarioGone"));
            setUnavailable(true);
            return;
          }
          fail(r.error);
          return;
        }
        moveFocus.current = true;
        setAttemptId(r.attemptId);
        setAnswered(r.answeredStageIds);
      } catch {
        setError(t("errors.network"));
      }
    });
  }

  function submit(stage: PlayerStage, optionIds: string[]) {
    if (!attemptId || pending || unavailable) return;
    setError(null);
    setAnnouncement("");
    startTransition(async () => {
      try {
        const r = await answerStage(locale, { attemptId, stageId: stage.id, optionIds });
        if (!r.ok) {
          if (r.error === "not_in_progress") return goToResult(attemptId);
          fail(r.error);
          if (r.error === "already_answered" || r.error === "out_of_order") await resync();
          return;
        }
        if (r.completed) return goToResult(r.attemptId);
        moveFocus.current = true;
        setAnswered((prev) => [...prev, stage.id]);
        setAnnouncement(t("stage.saved", { current: n(r.nextIndex + 1), total: n(total) }));
      } catch {
        setError(t("errors.network"));
      }
    });
  }

  function finish() {
    if (!attemptId || pending || unavailable) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await completeAttempt(locale, { attemptId });
        if (!r.ok) {
          if (r.error === "not_in_progress") return goToResult(attemptId);
          fail(r.error);
          if (r.error === "incomplete") await resync();
          return;
        }
        goToResult(r.attemptId);
      } catch {
        setError(t("errors.network"));
      }
    });
  }

  const header = (
    <header className="flex flex-col gap-3">
      <Link href={`/protocols/${data.scenario.protocol.slug}`} className={TEXT_LINK}>
        <ProtocolIcon name={data.scenario.protocol.icon} className="size-4" />
        <span className="sr-only">{t("protocol")}: </span>
        {data.scenario.protocol.title}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{data.scenario.title}</h1>
      <ScenarioFacts difficulty={data.scenario.difficulty} minutes={data.scenario.minutes} stages={total} />
    </header>
  );

  const errorAlert = error && (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden />
      <AlertDescription>
        <p>{error}</p>
      </AlertDescription>
    </Alert>
  );
  const live = (
    <p className="sr-only" role="status" aria-live="polite">
      {announcement}
    </p>
  );

  if (total === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {header}
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>
            <p className="font-medium text-foreground">{t("noStages.title")}</p>
            <p>{t("noStages.description")}</p>
          </AlertDescription>
        </Alert>
        <BackLink />
      </div>
    );
  }

  // The attempt cannot go on here: only the reason and the way back, no options, "Confirm" or "Start over".
  if (unavailable) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {header}
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden />
          <AlertDescription className="flex flex-col items-start gap-2">
            <p>{error ?? t("errors.notPlayable")}</p>
            <Link ref={exitRef} href="/simulations" className={cn(TEXT_LINK, "text-destructive")}>
              <BookOpenCheckIcon aria-hidden className="size-4" />
              {t("backToCatalogue")}
            </Link>
          </AlertDescription>
        </Alert>
        <Disclaimer />
      </div>
    );
  }

  // Intro: no open attempt yet.
  if (!attemptId) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {header}
        <p className="text-base leading-relaxed text-muted-foreground">{data.scenario.intro}</p>
        <section aria-labelledby="sim-situation" className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 id="sim-situation" className="mb-2 flex items-center gap-2 text-base font-semibold">
            <ClipboardCheckIcon aria-hidden className="size-4 text-primary" />
            {t("situation")}
          </h2>
          <p className="leading-relaxed">{data.scenario.setting}</p>
        </section>
        <section aria-labelledby="sim-how" className="flex flex-col gap-3">
          <h2 id="sim-how" className="text-base font-semibold">
            {t("howTitle")}
          </h2>
          <ol className="flex flex-col gap-2.5">
            {(["decide", "kinds", "final", "saved", "result"] as const).map((key, i) => (
              <li key={key} className="flex items-start gap-3 text-sm leading-relaxed">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums"
                >
                  {n(i + 1)}
                </span>
                {t(`how.${key}`)}
              </li>
            ))}
          </ol>
        </section>
        {data.history.completed > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
            <span className="inline-flex items-center gap-2">
              <TrophyIcon aria-hidden className="size-4 text-muted-foreground" />
              {t("bestSoFar")}
              <ScoreBadge score={data.history.bestScore} />
            </span>
            {data.history.lastAttemptId && (
              <Link href={`/simulations/attempts/${data.history.lastAttemptId}`} className={TEXT_LINK}>
                {t("viewLast")}
              </Link>
            )}
          </div>
        )}
        {errorAlert}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            size="lg"
            className={cn("sm:w-auto", BUSY)}
            aria-disabled={pending || undefined}
            onClick={() => !pending && begin(false)}
          >
            {pending ? <Spinner aria-hidden /> : <PlayIcon aria-hidden />}
            {pending ? t("starting") : t("start")}
          </Button>
          <BackLink />
        </div>
        <Disclaimer />
      </div>
    );
  }

  // Every stage answered but not completed yet (the completion of the last answer was lost): submit.
  if (index >= total || finishing) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {header}
        <section aria-labelledby="sim-ready" className="flex flex-col items-start gap-3 rounded-xl border bg-card p-5">
          <h2 id="sim-ready" ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-lg font-semibold outline-none">
            {finishing ? <Spinner aria-hidden /> : <CircleCheckIcon aria-hidden className="size-5 text-success" />}
            {finishing ? t("finishing") : t("ready.title")}
          </h2>
          {!finishing && (
            <>
              <p className="text-sm text-muted-foreground">{t("ready.description")}</p>
              {errorAlert}
              <Button type="button" size="lg" className={BUSY} aria-disabled={pending || undefined} onClick={finish}>
                {pending && <Spinner aria-hidden />}
                {t("ready.submit")}
              </Button>
            </>
          )}
        </section>
      </div>
    );
  }

  const stage = data.stages[index];
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {header}
      <Collapsible className="rounded-xl border bg-card">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-xl p-3 text-start text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&[data-panel-open]>svg]:rotate-180">
          <span className="inline-flex items-center gap-2">
            <ClipboardCheckIcon aria-hidden className="size-4 text-primary" />
            {t("situation")}
          </span>
          <ChevronDownIcon aria-hidden className="size-4 text-muted-foreground transition-transform" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3 pb-3 text-sm leading-relaxed text-muted-foreground">{data.scenario.setting}</CollapsibleContent>
      </Collapsible>

      <StageForm
        key={stage.id}
        stage={stage}
        index={index}
        total={total}
        attemptId={attemptId}
        pending={pending}
        headingRef={headingRef}
        onSubmit={(ids) => submit(stage, ids)}
        error={errorAlert}
      />
      {live}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Link href="/simulations" className={buttonVariants({ variant: "ghost" })}>
          {t("leave")}
        </Link>
        <RestartButton pending={pending} onConfirm={() => begin(true)} />
      </div>
      <Disclaimer />
    </div>
  );
}

/** One stage as the trainee answers it; also used by the admin preview (components/simulations/admin/preview.tsx). */
export function StageForm({
  stage,
  index,
  total,
  attemptId,
  pending,
  headingRef,
  onSubmit,
  error,
}: {
  stage: PlayerStage;
  index: number;
  total: number;
  attemptId: string;
  pending: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onSubmit: (optionIds: string[]) => void;
  error: React.ReactNode;
}) {
  const t = useTranslations("simulations.player.stage");
  const format = useFormatter();
  const uid = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const [missing, setMissing] = useState(false);
  const options = useMemo(() => shuffleOptions(stage.options, optionSeed(attemptId, stage.id)), [stage, attemptId]);
  const n = (value: number) => format.number(value, "integer");
  const label = t("label", { current: n(index + 1), total: n(total) });
  const last = index + 1 === total;
  const legendId = `${uid}-legend`;
  const errorId = `${uid}-error`;

  function toggle(id: string, checked: boolean) {
    setMissing(false);
    setSelected((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (selected.length === 0) {
      setMissing(true);
      return;
    }
    onSubmit(selected);
  }

  return (
    <section aria-labelledby={`${uid}-heading`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2
          id={`${uid}-heading`}
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-primary outline-none focus-visible:underline"
        >
          {label}
        </h2>
        {/* One segment per stage: answered ones filled, the current one half, the rest muted. */}
        <div
          role="progressbar"
          aria-label={t("progress")}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={index}
          aria-valuetext={label}
          className="flex gap-1"
        >
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i < index ? "bg-primary" : i === index ? "bg-primary/40" : "bg-muted-foreground/20",
              )}
            />
          ))}
        </div>
      </div>
      {stage.context && <p className="text-base leading-relaxed">{stage.context}</p>}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FieldSet aria-describedby={missing ? errorId : undefined}>
          <FieldLegend id={legendId} className="text-lg leading-snug font-semibold data-[variant=legend]:text-lg">
            {stage.prompt}
          </FieldLegend>
          <FieldDescription>{stage.kind === "single" ? t("chooseOne") : t("chooseAll")}</FieldDescription>
          {stage.kind === "single" ? (
            <RadioGroup
              aria-labelledby={legendId}
              aria-invalid={missing || undefined}
              value={selected[0] ?? null}
              onValueChange={(value) => {
                setMissing(false);
                setSelected(typeof value === "string" ? [value] : []);
              }}
              className="gap-2.5"
            >
              {options.map((option, i) => (
                <OptionCard key={option.id} id={`${uid}-o${i}`} text={option.text}>
                  <RadioGroupItem value={option.id} id={`${uid}-o${i}`} aria-labelledby={`${uid}-o${i}-text`} />
                </OptionCard>
              ))}
            </RadioGroup>
          ) : (
            <div className="grid gap-2.5">
              {options.map((option, i) => (
                <OptionCard key={option.id} id={`${uid}-o${i}`} text={option.text}>
                  <Checkbox
                    id={`${uid}-o${i}`}
                    aria-labelledby={`${uid}-o${i}-text`}
                    checked={selected.includes(option.id)}
                    onCheckedChange={(checked) => toggle(option.id, checked === true)}
                    aria-invalid={missing || undefined}
                  />
                </OptionCard>
              ))}
            </div>
          )}
          {missing && <FieldError id={errorId}>{stage.kind === "single" ? t("required") : t("requiredMulti")}</FieldError>}
        </FieldSet>
        {error}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Button type="submit" size="lg" className={cn("sm:w-auto", BUSY)} aria-disabled={pending || undefined}>
            {pending && <Spinner aria-hidden />}
            {pending ? t("saving") : last ? t("confirmLast") : t("confirm")}
          </Button>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <InfoIcon aria-hidden className="size-3.5" />
            {t("final")}
          </p>
        </div>
      </form>
    </section>
  );
}

/** A tappable choice card: the whole card is the label of its radio or checkbox. */
/**
 * One answer option: the control (children) is named by the text span `${id}-text` explicitly, so it has its name in
 * the server HTML too (Base UI finds a wrapping label only after hydration; a resumed attempt renders on the server).
 */
function OptionCard({ id, text, children }: { id: string; text: string; children: React.ReactNode }) {
  return (
    <FieldLabel htmlFor={id} className="w-full font-normal">
      <Field orientation="horizontal" className="items-start gap-3 p-3!">
        <span className="pt-0.5">{children}</span>
        <FieldContent>
          <span id={`${id}-text`} className="text-sm leading-relaxed">
            {text}
          </span>
        </FieldContent>
      </Field>
    </FieldLabel>
  );
}

function RestartButton({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  const t = useTranslations("simulations.player.restart");
  const tc = useTranslations("common.actions");
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button type="button" variant="outline" className={BUSY} aria-disabled={pending || undefined} />}>
        <RotateCcwIcon aria-hidden />
        {t("button")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BackLink() {
  const t = useTranslations("simulations.player");
  return (
    <Link href="/simulations" className={buttonVariants({ variant: "ghost" })}>
      <BookOpenCheckIcon aria-hidden />
      {t("backToCatalogue")}
    </Link>
  );
}

export function Disclaimer() {
  const t = useTranslations("common.marketing");
  return <p className="text-xs leading-relaxed text-muted-foreground">{t("disclaimer")}</p>;
}
