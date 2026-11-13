"use client";

import { ArrowLeftIcon, ClipboardCheckIcon, EyeIcon, InfoIcon, PlayIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { buildPreviewResult, previewRecommendations } from "@/lib/simulations/admin/preview";
import type { PreviewData } from "@/lib/simulations/admin/queries";
import { activeDurationSeconds } from "@/lib/simulations/engine";
import { cn } from "@/lib/utils";
import { Disclaimer, StageForm } from "../player";
import { CriticalAlert, Recommendations, ResultSummary, StageReview, Strengths } from "../result";
import { ScenarioFacts } from "../scenario-meta";
import { PublishBadge } from "./badges";

/** `answeredAt`: when each stage was answered, so "Time taken" counts play time the way a trainee's attempt does. */
type Phase =
  | { kind: "intro" }
  | { kind: "play"; run: string; startedAt: number; answeredAt: number[] }
  | { kind: "done"; run: string; durationSec: number };

/**
 * "Preview as a trainee" (platform admin): plays the saved scenario with the trainee's own stage form and shows the
 * trainee's result page, computed in the browser with the same scoring. Nothing is sent to the server: no attempt,
 * no answers, no step results, so a preview never locks a draft or shows up in reports.
 */
export function ScenarioPreview({ data }: { data: PreviewData }) {
  const t = useTranslations("simulations.admin.preview");
  const tp = useTranslations("simulations.player");
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);

  const total = data.stages.length;
  const index = data.stages.findIndex((s) => !(s.id in answers));
  const current = index === -1 ? total : index;

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (phase.kind === "done" ? resultRef : headingRef).current?.focus();
  }, [phase, current]);

  const model = useMemo(
    () => (phase.kind === "done" ? buildPreviewResult(data, answers, phase.durationSec) : null),
    [data, answers, phase],
  );

  function start() {
    moveFocus.current = true;
    setAnswers({});
    // A fresh option order per run, like a new attempt (engine.shuffleOptions is keyed by this id).
    setPhase({ kind: "play", run: crypto.randomUUID(), startedAt: Date.now(), answeredAt: [] });
  }

  function answer(stageId: string, optionIds: string[]) {
    if (phase.kind !== "play") return;
    const next = { ...answers, [stageId]: optionIds };
    const now = Date.now();
    const answeredAt = [...phase.answeredAt, now];
    setAnswers(next);
    moveFocus.current = true;
    if (data.stages.every((s) => s.id in next)) {
      const durationSec = activeDurationSeconds(new Date(phase.startedAt), answeredAt.map((ms) => new Date(ms)), new Date(now));
      setPhase({ kind: "done", run: phase.run, durationSec });
    } else {
      setPhase({ ...phase, answeredAt });
    }
  }

  const banner = (
    <Alert role="note" className="border-info/40 bg-info/5">
      <EyeIcon aria-hidden />
      <AlertDescription className="flex flex-col gap-2">
        <p className="font-medium text-foreground">{t("banner")}</p>
        {!data.scenario.isPublished && <p>{t("unpublished")}</p>}
      </AlertDescription>
    </Alert>
  );

  const header = (
    <header className="flex flex-col gap-3">
      <Link href={`/admin/scenarios/${data.scenario.id}`} className={cn(buttonVariants({ variant: "ghost" }), "self-start")}>
        <ArrowLeftIcon aria-hidden className="rtl:rotate-180" />
        {t("back")}
      </Link>
      {banner}
      <p className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary">
        <ProtocolIcon name={data.scenario.protocol.icon} className="size-4" />
        <span className="sr-only">{tp("protocol")}: </span>
        {data.scenario.protocol.title}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{data.scenario.title}</h1>
      <div className="flex flex-wrap items-center gap-3">
        <PublishBadge published={data.scenario.isPublished} played={data.scenario.played} />
        <ScenarioFacts difficulty={data.scenario.difficulty} minutes={data.scenario.minutes} stages={total} />
      </div>
    </header>
  );

  if (total === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {header}
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>
            <p className="font-medium text-foreground">{tp("noStages.title")}</p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (phase.kind === "intro") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {header}
        <p className="text-base leading-relaxed text-muted-foreground">{data.scenario.intro}</p>
        <section aria-labelledby="preview-situation" className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 id="preview-situation" className="mb-2 flex items-center gap-2 text-base font-semibold">
            <ClipboardCheckIcon aria-hidden className="size-4 text-primary" />
            {tp("situation")}
          </h2>
          <p className="leading-relaxed">{data.scenario.setting}</p>
        </section>
        <Button type="button" size="lg" className="self-start" onClick={start}>
          <PlayIcon aria-hidden />
          {tp("start")}
        </Button>
        <Disclaimer />
      </div>
    );
  }

  if (phase.kind === "done" && model) {
    const criticalSteps = model.violated.filter((s) => model.criticalIds.includes(s.id));
    // The same column as the trainee's result page (UX-14: the header and the result line up).
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {header}
        <section aria-labelledby="preview-result" className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 id="preview-result" ref={resultRef} tabIndex={-1} className="text-xl font-semibold outline-none focus-visible:underline">
              {t("resultTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("resultDescription")}</p>
          </div>
          <ResultSummary model={model} />
          <CriticalAlert steps={criticalSteps} />
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Recommendations items={previewRecommendations(model)} currentSlug={model.scenario.slug} />
            <Strengths steps={model.strengths} />
          </div>
          <StageReview stages={model.stages} />
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={start}>
              <RotateCcwIcon aria-hidden />
              {t("again")}
            </Button>
            <Link href={`/admin/scenarios/${data.scenario.id}`} className={buttonVariants({ variant: "outline" })}>
              <ArrowLeftIcon aria-hidden className="rtl:rotate-180" />
              {t("back")}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const stage = data.stages[current];
  if (phase.kind !== "play" || !stage) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {header}
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden />
          <AlertDescription>{tp("errors.generic")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {header}
      <StageForm
        key={`${phase.run}:${stage.id}`}
        stage={{ id: stage.id, kind: stage.kind, prompt: stage.prompt, context: stage.context, options: stage.options.map((o) => ({ id: o.id, text: o.text })) }}
        index={current}
        total={total}
        attemptId={phase.run}
        pending={false}
        headingRef={headingRef}
        onSubmit={(ids) => answer(stage.id, ids)}
        error={null}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Link href={`/admin/scenarios/${data.scenario.id}`} className={buttonVariants({ variant: "ghost" })}>
          {t("back")}
        </Link>
        <Button type="button" variant="outline" onClick={start}>
          <RotateCcwIcon aria-hidden />
          {t("again")}
        </Button>
      </div>
      <Disclaimer />
    </div>
  );
}
