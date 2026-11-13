"use client";

import { ArrowRightIcon, CirclePlayIcon, FilterXIcon, HistoryIcon, SearchXIcon, TrophyIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type Ref, useId, useRef, useState } from "react";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@/i18n/navigation";
import { type CatalogueFilters, catalogueQuery, DIFFICULTIES, isDifficulty } from "@/lib/simulations/engine";
import type { CatalogueItem } from "@/lib/simulations/queries";
import { cn } from "@/lib/utils";
import { ScenarioFacts } from "./scenario-meta";
import { AttemptStatusBadge, RiskBadge, ScoreBadge } from "@/components/shared/status-badges";

const ALL = "all";

/** An inactive button keeps focus (aria-disabled, the handler ignores clicks): see player.tsx BUSY. */
const INACTIVE = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

/**
 * The scenario catalogue (client): filters by protocol and level without a server round trip (the list is small and
 * already scoped on the server), keeps them in the URL (?protocol=&difficulty=) with history.replaceState so a
 * reload or a shared link shows the same view, and announces the result count.
 */
export function SimulationCatalogue({
  items,
  protocols,
  initial,
}: {
  items: CatalogueItem[];
  /** The protocols of `items`, sorted for the reader's language on the server. */
  protocols: Array<{ slug: string; title: string }>;
  initial: CatalogueFilters;
}) {
  const t = useTranslations("simulations.catalogue");
  const format = useFormatter();
  const [filters, setFilters] = useState<CatalogueFilters>(() => ({
    protocol: initial.protocol && items.some((i) => i.protocol.slug === initial.protocol) ? initial.protocol : null,
    difficulty: initial.difficulty,
  }));

  const visible = items.filter(
    (i) => (!filters.protocol || i.protocol.slug === filters.protocol) && (!filters.difficulty || i.difficulty === filters.difficulty),
  );
  const inProgress = items.filter((i) => i.inProgress).slice(0, 3);
  const filtered = filters.protocol !== null || filters.difficulty !== null;
  const firstFilterRef = useRef<HTMLButtonElement>(null);

  function update(next: CatalogueFilters) {
    setFilters(next);
    window.history.replaceState(null, "", `${window.location.pathname}${catalogueQuery(next)}`);
  }

  /**
   * Both "Clear filters" buttons keep keyboard focus in the filters: the bar button turns inactive and the one in the
   * no-results state disappears, so focus moves to the first filter instead of dropping to <body> (WCAG 2.4.3).
   */
  function clear() {
    if (!filtered) return;
    update({ protocol: null, difficulty: null });
    requestAnimationFrame(() => firstFilterRef.current?.focus());
  }

  return (
    <div className="flex flex-col gap-8">
      {inProgress.length > 0 && (
        <section aria-labelledby="sim-continue" className="flex flex-col gap-3">
          <h2 id="sim-continue" className="flex items-center gap-2 text-base font-semibold">
            <HistoryIcon aria-hidden className="size-4 text-muted-foreground" />
            {t("continueTitle")}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {inProgress.map((item) => (
              <li key={item.id}>
                <ContinueCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="sim-list" className="flex flex-col gap-4">
        <h2 id="sim-list" className="sr-only">
          {t("listLabel")}
        </h2>
        <div
          role="group"
          aria-label={t("filters.label")}
          className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <FilterSelect
            label={t("filters.protocol")}
            triggerRef={firstFilterRef}
            value={filters.protocol ?? ALL}
            options={[{ value: ALL, label: t("filters.allProtocols") }, ...protocols.map((p) => ({ value: p.slug, label: p.title }))]}
            onChange={(value) => update({ ...filters, protocol: value === ALL ? null : value })}
          />
          <DifficultySelect value={filters.difficulty} onChange={(difficulty) => update({ ...filters, difficulty })} />
          <Button
            type="button"
            variant="ghost"
            className={cn("justify-self-start sm:mb-px", INACTIVE)}
            aria-disabled={!filtered || undefined}
            onClick={clear}
          >
            <FilterXIcon aria-hidden />
            {t("filters.clear")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {t("filters.results", { count: visible.length, n: format.number(visible.length, "integer") })}
        </p>

        {visible.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("noResults.title")}</EmptyTitle>
              <EmptyDescription>{t("noResults.description")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" variant="outline" onClick={clear}>
                <FilterXIcon aria-hidden />
                {t("filters.clear")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => (
              <li key={item.id} className="flex">
                <ScenarioCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  triggerRef,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select items={options} value={value} onValueChange={(next) => onChange(typeof next === "string" ? next : ALL)}>
        <SelectTrigger id={id} ref={triggerRef} aria-label={label} className="w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DifficultySelect({ value, onChange }: { value: CatalogueFilters["difficulty"]; onChange: (v: CatalogueFilters["difficulty"]) => void }) {
  const t = useTranslations("simulations.catalogue.filters");
  const td = useTranslations("common.difficulty");
  return (
    <FilterSelect
      label={t("difficulty")}
      value={value ?? ALL}
      options={[{ value: ALL, label: t("allDifficulties") }, ...DIFFICULTIES.map((d) => ({ value: d, label: td(d) }))]}
      onChange={(next) => onChange(isDifficulty(next) ? next : null)}
    />
  );
}

/** "Stage 3 of 6" for an open attempt (the next stage to answer). */
function useProgress(item: CatalogueItem) {
  const t = useTranslations("simulations.catalogue.card");
  const format = useFormatter();
  if (!item.inProgress) return null;
  const current = Math.min(item.inProgress.answered + 1, item.stages);
  return {
    label: t("progress", { current: format.number(current, "integer"), total: format.number(item.stages, "integer") }),
    value: item.stages > 0 ? Math.round((100 * item.inProgress.answered) / item.stages) : 0,
  };
}

function ContinueCard({ item }: { item: CatalogueItem }) {
  const t = useTranslations("simulations.catalogue.card");
  const progress = useProgress(item);
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ProtocolIcon name={item.protocol.icon} className="size-4.5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">{item.protocol.title}</p>
          <p className="font-medium leading-snug">{item.title}</p>
        </div>
      </div>
      {progress && (
        <Progress value={progress.value} aria-label={progress.label} className="gap-1.5">
          <span className="text-xs text-muted-foreground">{progress.label}</span>
        </Progress>
      )}
      <Link href={`/simulations/${item.slug}`} className={cn(buttonVariants({ size: "sm" }), "self-start")}>
        <CirclePlayIcon aria-hidden />
        {t("continue")}
        <span className="sr-only">: {item.title}</span>
      </Link>
    </div>
  );
}

function ScenarioCard({ item }: { item: CatalogueItem }) {
  const t = useTranslations("simulations.catalogue.card");
  const format = useFormatter();
  const progress = useProgress(item);
  const action = item.inProgress ? t("continue") : item.completed > 0 ? t("tryAgain") : t("start");
  return (
    <article className="flex w-full flex-col gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/30">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ProtocolIcon name={item.protocol.icon} className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">{item.protocol.title}</p>
          <h3 className="text-base leading-snug font-semibold text-balance">{item.title}</h3>
        </div>
      </div>
      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{item.intro}</p>
      <ScenarioFacts difficulty={item.difficulty} minutes={item.minutes} stages={item.stages} />

      <div className="mt-auto flex flex-col gap-3 border-t pt-3">
        {progress && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <AttemptStatusBadge status="in_progress" />
              <span className="text-xs text-muted-foreground">{progress.label}</span>
            </div>
            <Progress value={progress.value} aria-label={progress.label} />
          </div>
        )}
        {/* The history stays visible while a new attempt is open (SPEC-4). Before the first completion nothing is said:
            the "Start" button already says it. */}
        {item.completed > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <span>{t("completed", { count: item.completed, n: format.number(item.completed, "integer") })}</span>
            <span className="inline-flex items-center gap-1.5">
              <TrophyIcon aria-hidden className="size-3.5" />
              {t("best")}
              <ScoreBadge score={item.bestScore} />
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/simulations/${item.slug}`} className={buttonVariants({ size: "sm", variant: item.inProgress ? "default" : "outline" })}>
            {action}
            <span className="sr-only">: {item.title}</span>
            <ArrowRightIcon aria-hidden className="rtl:rotate-180" />
          </Link>
          {item.last && (
            <Link
              href={`/simulations/attempts/${item.last.id}`}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {t("lastResult")}
              <span className="sr-only">: {item.title}</span>
              {item.last.riskLevel && <RiskBadge level={item.last.riskLevel} />}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
