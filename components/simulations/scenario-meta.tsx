import { ClockIcon, LayersIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { DifficultyValue } from "@/lib/simulations/engine";
import { cn } from "@/lib/utils";

/**
 * Small facts about a scenario (difficulty, minutes, number of stages) shared by the catalogue cards and the player
 * intro. Works in Server and Client Components (hooks only, no async).
 */

const LEVEL = { beginner: 1, intermediate: 2, advanced: 3 } as const;

/** Three rising bars, as many filled as the level (the text label says it too: never the icon alone). */
function DifficultyMeter({ level }: { level: DifficultyValue }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden focusable="false" className="rtl:-scale-x-100">
      {[0, 1, 2].map((i) => {
        const height = 4 + i * 3.5;
        return (
          <rect
            key={i}
            x={0.5 + i * 4}
            y={11.5 - height}
            width={3}
            height={height}
            rx={1}
            className={cn("fill-current", i >= LEVEL[level] && "opacity-25")}
          />
        );
      })}
    </svg>
  );
}

export function DifficultyBadge({ level, className }: { level: DifficultyValue; className?: string }) {
  const t = useTranslations("common.difficulty");
  return (
    <Badge variant="secondary" className={className}>
      <DifficultyMeter level={level} />
      {t(level)}
    </Badge>
  );
}

export function ScenarioFacts({
  difficulty,
  minutes,
  stages,
  className,
}: {
  difficulty: DifficultyValue;
  minutes: number;
  stages: number;
  className?: string;
}) {
  const t = useTranslations("simulations.catalogue.card");
  const format = useFormatter();
  const n = (value: number) => format.number(value, "integer");
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground", className)}>
      <li>
        <DifficultyBadge level={difficulty} />
      </li>
      <li className="inline-flex items-center gap-1">
        <ClockIcon aria-hidden className="size-3.5" />
        {t("minutes", { count: minutes, n: n(minutes) })}
      </li>
      <li className="inline-flex items-center gap-1">
        <LayersIcon aria-hidden className="size-3.5" />
        {t("stages", { count: stages, n: n(stages) })}
      </li>
    </ul>
  );
}
