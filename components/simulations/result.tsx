import {
  ArrowRightIcon,
  BookOpenCheckIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleMinusIcon,
  CircleXIcon,
  ExternalLinkIcon,
  LightbulbIcon,
  ListChecksIcon,
  ShieldAlertIcon,
  SparklesIcon,
  TimerIcon,
  TrophyIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { RiskBadge, ScoreBadge } from "@/components/shared/status-badges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { Recommendation } from "@/lib/recommendations";
import { formatDuration, isMistake, type ReviewOptionState, riskCause } from "@/lib/simulations/engine";
import type { ResultModel, ResultStep, ReviewOption, ReviewStage } from "@/lib/simulations/result-model";
import { cn } from "@/lib/utils";

/**
 * The parts of the attempt result page (Server Components without async: hooks from next-intl), also used by the
 * admin preview. Colour is never the only signal: every state carries an icon and a text label (CONVENTIONS 9).
 * Printing hides the buttons only.
 *
 * Two readers: the trainee who made the attempt ("owner") and institution staff reviewing it ("staff"). Texts that
 * name the reader ("your choice", "what you did well") have a third-person variant for staff (review round 1, SPEC-5);
 * the others are written impersonally so they fit both. Practice links are for the owner only.
 */

export type ResultViewer = "owner" | "staff";

/** Plain text links of the result page: 32 px tap target, visible focus ring (CONVENTIONS 9, WCAG 2.4.7). */
const TEXT_LINK = "rounded-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

export function ResultSummary({ model }: { model: ResultModel }) {
  const t = useTranslations("simulations.result.summary");
  const ts = useTranslations("common.score");
  const format = useFormatter();
  const n = (value: number) => format.number(value, "integer");
  const cause = riskCause(model);
  return (
    <section aria-label={t("label")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile icon={TrophyIcon} label={t("score")}>
        {model.score === null ? (
          <>
            <ScoreBadge score={null} />
            <p className="text-xs text-muted-foreground">{t("notAssessable")}</p>
          </>
        ) : (
          // The tile label already names the value: no second, hidden "Score:" badge (UX-16).
          <span className="text-3xl font-semibold tabular-nums">
            <bdi>{ts("value", { score: n(model.score) })}</bdi>
          </span>
        )}
      </Tile>
      {/* The risk badge says "Risk level: …" to screen readers itself: the visible label is not read twice (UX-2). */}
      <Tile icon={ShieldAlertIcon} label={t("risk")} labelHidden={model.riskLevel !== null}>
        {model.riskLevel ? (
          <>
            <RiskBadge level={model.riskLevel} className="h-6 px-2.5 text-sm" />
            {cause && <p className="text-xs leading-relaxed text-muted-foreground">{t(`riskHint.${cause}`)}</p>}
          </>
        ) : (
          <ScoreBadge score={null} />
        )}
      </Tile>
      <Tile icon={ListChecksIcon} label={t("stages")}>
        <span className="text-2xl font-semibold tabular-nums">
          {t("stagesValue", { correct: n(model.stagesCorrect), total: n(model.stagesTotal) })}
        </span>
      </Tile>
      <Tile icon={TimerIcon} label={t("time")}>
        <span className="text-2xl font-semibold tabular-nums">
          <bdi dir="ltr">{formatDuration(model.durationSec ?? 0)}</bdi>
        </span>
      </Tile>
    </section>
  );
}

/** One summary tile; `labelHidden` keeps the label visual only when the value already announces it. */
function Tile({
  icon: Icon,
  label,
  labelHidden = false,
  children,
}: {
  icon: typeof TrophyIcon;
  label: string;
  labelHidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 break-inside-avoid">
      <p aria-hidden={labelHidden || undefined} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * The critical steps broken, with the rule once: the risk tile above only names the cause ("A critical step was
 * broken"), so the page does not say the same sentence twice (review round 2, UX-3).
 */
export function CriticalAlert({ steps }: { steps: ResultStep[] }) {
  const t = useTranslations("simulations.result.critical");
  if (steps.length === 0) return null;
  return (
    <Alert variant="destructive" role="note" className="border-destructive/30 bg-destructive/5">
      <ShieldAlertIcon aria-hidden />
      <AlertTitle>{t("title")}</AlertTitle>
      <AlertDescription>
        <p>{t("description")}</p>
        <ul className="mt-1 list-disc ps-5">
          {steps.map((s) => (
            <li key={s.id}>{s.text}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

export function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  id: string;
  icon: typeof TrophyIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5 break-inside-avoid", className)}>
      <div className="flex flex-col gap-1">
        <h2 id={id} className="flex items-center gap-2 text-base font-semibold">
          <Icon aria-hidden className="size-4 text-primary" />
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** The AI summary card; `printable` false leaves it out of the printed report (no summary stored: nothing to print). */
export function DebriefSection({ children, printable = true }: { children: React.ReactNode; printable?: boolean }) {
  const t = useTranslations("simulations.result.debrief");
  return (
    <SectionCard id="sim-debrief" icon={SparklesIcon} title={t("title")} description={t("description")} className={cn(!printable && "print:hidden")}>
      {children}
    </SectionCard>
  );
}

/** A stored debrief (in its own language, which may differ from the page's). */
export function StoredDebrief({ text, locale }: { text: string; locale: "ar" | "en" }) {
  const t = useTranslations("simulations.result.debrief");
  return (
    <div className="flex flex-col gap-2">
      <p lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className="text-sm leading-7 whitespace-pre-line">
        {text}
      </p>
      <p className="text-xs text-muted-foreground">{t("aiNote")}</p>
    </div>
  );
}

/** A recommendation with its scenario title already in the page language. */
export type RecommendationView = Omit<Recommendation<ResultStep>, "scenario"> & { scenario: { slug: string; title: string } | null };

/**
 * The rule-based "what to work on" list. `practice` (the owner only) adds the scenarios that train these steps; staff
 * read the list without links meant for the trainee.
 */
export function Recommendations({
  items,
  currentSlug,
  practice = true,
}: {
  items: readonly RecommendationView[];
  currentSlug: string;
  practice?: boolean;
}) {
  const t = useTranslations("simulations.result.recommendations");
  const scenarios = practice ? [...new Map(items.flatMap((rec) => (rec.scenario ? [[rec.scenario.slug, rec.scenario] as const] : []))).values()] : [];
  return (
    <SectionCard id="sim-recommendations" icon={LightbulbIcon} title={t("title")} description={t("description")}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {items.map((rec) => (
            <li key={rec.step.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium leading-relaxed">{rec.step.text}</p>
                {rec.critical && (
                  <Badge variant="destructive">
                    <ShieldAlertIcon aria-hidden />
                    {t("critical")}
                  </Badge>
                )}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{rec.step.rationale}</p>
              {rec.step.source && (
                <div>
                  <SourceLink source={rec.step.source} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {scenarios.length > 0 && (
        // The scenarios that train these steps, once each (the steps of one scenario usually share one).
        <ul className="flex flex-col gap-1 border-t pt-3 print:hidden">
          {scenarios.map((scenario) => (
            <li key={scenario.slug}>
              <Link
                href={`/simulations/${scenario.slug}`}
                className={cn("inline-flex min-h-8 items-center gap-1 text-sm font-medium text-primary", TEXT_LINK)}
              >
                {scenario.slug === currentSlug ? t("practiseAgain") : t("practise", { title: scenario.title })}
                <ArrowRightIcon aria-hidden className="size-3.5 rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function SourceLink({ source }: { source: { label: string; url: string | null } }) {
  const t = useTranslations("simulations.result.review");
  if (!source.url) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("source")}: {source.label}
      </span>
    );
  }
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex min-h-8 items-center gap-1 text-xs text-muted-foreground hover:text-foreground", TEXT_LINK)}
    >
      <span>
        {t("source")}: <bdi>{source.label}</bdi>
      </span>
      <ExternalLinkIcon aria-hidden className="size-3" />
    </a>
  );
}

export function Strengths({ steps, viewer = "owner" }: { steps: ResultStep[]; viewer?: ResultViewer }) {
  const t = useTranslations("simulations.result.strengths");
  const staff = viewer === "staff";
  return (
    <SectionCard
      id="sim-strengths"
      icon={CircleCheckIcon}
      title={staff ? t("titleStaff") : t("title")}
      description={staff ? t("descriptionStaff") : t("description")}
    >
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {steps.map((s) => (
            <li key={s.id} className="flex items-start gap-2 text-sm leading-relaxed">
              <CircleCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const STATE_ICON: Record<ReviewOptionState, typeof CircleCheckIcon> = {
  chosen_correct: CircleCheckIcon,
  chosen_wrong: CircleXIcon,
  missed: CircleDashedIcon,
  avoided: CircleMinusIcon,
  not_chosen: CircleDotIcon,
};

/** Review order inside a stage: what the trainee chose, then the right options they missed, then the rest. */
const STATE_ORDER: Record<ReviewOptionState, number> = { chosen_wrong: 0, chosen_correct: 0, missed: 1, avoided: 2, not_chosen: 2 };

const STATE_STYLE: Record<ReviewOptionState, { box: string; icon: string }> = {
  chosen_correct: { box: "border-success/40 bg-success/5", icon: "text-success" },
  chosen_wrong: { box: "border-destructive/40 bg-destructive/5", icon: "text-destructive" },
  missed: { box: "border-dashed border-warning/70 bg-warning/5", icon: "text-[color-mix(in_oklab,var(--warning),var(--warning-foreground)_50%)] dark:text-warning" },
  avoided: { box: "border-border bg-transparent", icon: "text-muted-foreground" },
  not_chosen: { box: "border-border bg-transparent", icon: "text-muted-foreground" },
};

/** The states whose label names the person who chose (owner: "your choice"; staff: "the trainee's choice"). */
type PersonalState = Extract<ReviewOptionState, "chosen_correct" | "chosen_wrong" | "missed">;
function isPersonal(state: ReviewOptionState): state is PersonalState {
  return state === "chosen_correct" || state === "chosen_wrong" || state === "missed";
}

export function StageReview({ stages, viewer = "owner" }: { stages: ReviewStage[]; viewer?: ResultViewer }) {
  const t = useTranslations("simulations.result.review");
  return (
    <section aria-labelledby="sim-review" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="sim-review" className="flex items-center gap-2 text-lg font-semibold">
          <BookOpenCheckIcon aria-hidden className="size-5 text-primary" />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ol className="flex flex-col gap-4">
        {stages.map((stage) => (
          <li key={stage.id}>
            <StageCard stage={stage} viewer={viewer} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function StageCard({ stage, viewer }: { stage: ReviewStage; viewer: ResultViewer }) {
  const t = useTranslations("simulations.result.review");
  const format = useFormatter();
  const headingId = `sim-stage-${stage.id}`;
  const status = !stage.answered ? "notAnswered" : stage.correct ? "correct" : "incorrect";
  const StatusIcon = stage.correct ? CircleCheckIcon : CircleXIcon;
  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5 break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-sm font-semibold text-muted-foreground">
          {t("stage", { n: format.number(stage.number, "integer") })}
        </h3>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
            stage.correct ? "bg-success/10 ring-success/25" : "bg-destructive/10 ring-destructive/25",
          )}
        >
          <StatusIcon aria-hidden className={cn("size-3.5", stage.correct ? "text-success" : "text-destructive")} />
          {t(status)}
        </span>
      </div>
      {stage.context && <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{stage.context}</p>}
      <p className="max-w-prose font-medium leading-relaxed">{stage.prompt}</p>
      {/* Two columns on wide screens keep option text and feedback at a readable line length (UX-9). */}
      <ul className="grid gap-2.5 lg:grid-cols-2">
        {[...stage.options].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]).map((option) => (
          <li key={option.id} className="flex">
            <OptionReview option={option} viewer={viewer} />
          </li>
        ))}
      </ul>
    </article>
  );
}

function OptionReview({ option, viewer }: { option: ReviewOption; viewer: ResultViewer }) {
  const t = useTranslations("simulations.result.review");
  const Icon = STATE_ICON[option.state];
  const style = STATE_STYLE[option.state];
  const mistake = isMistake(option.state);
  const label = viewer === "staff" && isPersonal(option.state) ? t(`stateStaff.${option.state}`) : t(`state.${option.state}`);
  const quiet = option.state === "avoided" || option.state === "not_chosen";
  return (
    <div className={cn("flex w-full flex-col gap-1.5 rounded-lg border p-3", style.box)}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <Icon aria-hidden className={cn("size-4", style.icon)} />
          {label}
        </span>
        {option.criticalChosen && (
          // Sits on the red tint of a wrong choice: no second tint in dark mode (text contrast), a ring instead.
          <Badge variant="destructive" className="ring-1 ring-destructive/30 dark:bg-transparent">
            <ShieldAlertIcon aria-hidden />
            {t("criticalOption")}
          </Badge>
        )}
      </p>
      <p className={cn("text-sm leading-relaxed", quiet ? "text-muted-foreground" : "font-medium")}>{option.text}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{option.feedback}</p>
      {mistake && option.step && (
        <div className="mt-1 flex flex-col gap-1 border-s-2 border-primary/40 ps-3 text-xs leading-relaxed">
          <p>
            <span className="font-semibold">{t("step")}: </span>
            {option.step.text}
          </p>
          {option.step.source && <SourceLink source={option.step.source} />}
        </div>
      )}
    </div>
  );
}

/** The id of the result h1 (the page moves focus to it after the last answer: ResultFocus). */
export const RESULT_HEADING_ID = "sim-result-title";

/**
 * Header: protocol link, title, completion date and the trainee. Staff always see the trainee's name; on the owner's
 * own page it is printed only (`printOnly`), so a printed result handed to a supervisor says whose it is (UX-10).
 */
export function ResultHeading({
  model,
  trainee,
  actions,
}: {
  model: ResultModel;
  trainee: { name: string; printOnly: boolean } | null;
  actions: React.ReactNode;
}) {
  const t = useTranslations("simulations.result");
  const tp = useTranslations("simulations.player");
  const format = useFormatter();
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <Link
          href={`/protocols/${model.scenario.protocol.slug}`}
          className={cn("inline-flex min-h-8 w-fit items-center gap-2 py-1 text-sm font-medium text-primary", TEXT_LINK)}
        >
          <ProtocolIcon name={model.scenario.protocol.icon} className="size-4" />
          <span className="sr-only">{tp("protocol")}: </span>
          {model.scenario.protocol.title}
        </Link>
        <h1 id={RESULT_HEADING_ID} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-balance outline-none">
          {model.scenario.title}
        </h1>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {model.completedAt && <span>{t("completedOn", { date: format.dateTime(model.completedAt, "dateTime") })}</span>}
          {trainee && (
            <span className={cn(trainee.printOnly && "hidden print:inline")}>
              {t("trainee")}: <bdi>{trainee.name}</bdi>
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">{actions}</div>
    </header>
  );
}
