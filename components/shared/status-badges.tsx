import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CircleMinusIcon,
  CirclePlayIcon,
  CircleXIcon,
  EyeIcon,
  FilePenLineIcon,
  LoaderCircleIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Shared badges so every feature shows risk, verdicts, scores and statuses the same way (color + icon +
 * text, never color alone). Work in Server and Client Components (useTranslations in a non-async component).
 *
 * Badge text is 12 px, so WCAG AA needs 4.5:1 on the badge's own tint. The plain light-theme tokens are too light for
 * that (success / risk-low 3.7:1, info 4.1:1, warning 2.2:1), so in the light theme the text is the token darkened IN
 * OKLAB: green and blue mix in 30 % --foreground (5.4-6.2:1), amber mixes in 50 % --warning-foreground (5.2-5.9:1).
 * OKLab mixes along a straight line, so the hue stays; an OKLCH mix of amber with the blue-grey foreground went round
 * the hue circle through green and made "in review" and "medium" read like "compliant". Dark mode keeps the tokens
 * (5.5-7.9:1). TONE_TEXT is exported for small coloured text outside the badges.
 */

export const TONE_TEXT = {
  success: "text-[color-mix(in_oklab,var(--success),var(--foreground)_30%)] dark:text-success",
  info: "text-[color-mix(in_oklab,var(--info),var(--foreground)_30%)] dark:text-info",
  warning: "text-[color-mix(in_oklab,var(--warning),var(--warning-foreground)_50%)] dark:text-warning",
  riskLow: "text-[color-mix(in_oklab,var(--risk-low),var(--foreground)_30%)] dark:text-risk-low",
  riskMedium: "text-[color-mix(in_oklab,var(--risk-medium),var(--warning-foreground)_50%)] dark:text-risk-medium",
} as const;

export type RiskLevelValue = "low" | "medium" | "high";
export type VerdictValue = "compliant" | "non_compliant" | "not_visible" | "not_applicable";

const riskStyles: Record<RiskLevelValue, string> = {
  low: `bg-risk-low/12 ${TONE_TEXT.riskLow} ring-1 ring-risk-low/25`,
  medium: `bg-risk-medium/15 ${TONE_TEXT.riskMedium} ring-1 ring-risk-medium/30`,
  high: "bg-risk-high/12 text-risk-high ring-1 ring-risk-high/25",
};

export function RiskBadge({ level, className }: { level: RiskLevelValue; className?: string }) {
  const t = useTranslations("common.risk");
  return (
    <Badge variant="outline" className={cn("border-transparent", riskStyles[level], className)}>
      <ShieldAlertIcon aria-hidden />
      <span className="sr-only">{t("label")}: </span>
      {t(level)}
    </Badge>
  );
}

const neutralStyle = "bg-muted text-muted-foreground ring-1 ring-border";

const verdictConfig: Record<VerdictValue, { icon: typeof CircleCheckIcon; style: string }> = {
  compliant: { icon: CircleCheckIcon, style: `bg-success/12 ${TONE_TEXT.success} ring-1 ring-success/25` },
  non_compliant: { icon: CircleXIcon, style: "bg-destructive/10 text-destructive ring-1 ring-destructive/25" },
  not_visible: { icon: CircleHelpIcon, style: neutralStyle },
  not_applicable: { icon: CircleMinusIcon, style: neutralStyle },
};

export function VerdictBadge({ verdict, className }: { verdict: VerdictValue; className?: string }) {
  const t = useTranslations("common.verdict");
  const { icon: Icon, style } = verdictConfig[verdict];
  return (
    <Badge variant="outline" className={cn("border-transparent", style, className)}>
      <Icon aria-hidden />
      {t(verdict)}
    </Badge>
  );
}

/**
 * Score 0..100 as a percentage, colored by the same thresholds as lib/scoring.ts (50 / 80).
 * score={null} = not assessable (ScoreResult.assessable false): a neutral badge, never "0%".
 */
export function ScoreBadge({ score, className }: { score: number | null; className?: string }) {
  const t = useTranslations("common.score");
  if (score === null) {
    return (
      <Badge variant="outline" className={cn("border-transparent", neutralStyle, className)} title={t("notAssessableHint")}>
        <CircleMinusIcon aria-hidden />
        {t("notAssessable")}
      </Badge>
    );
  }
  const tone = score >= 80 ? riskStyles.low : score >= 50 ? riskStyles.medium : riskStyles.high;
  return (
    <Badge variant="outline" className={cn("border-transparent tabular-nums", tone, className)}>
      <span className="sr-only">{t("label")}: </span>
      <bdi>{t("value", { score: String(Math.round(score)) })}</bdi>
    </Badge>
  );
}

export type ScanStatusValue = "draft" | "analyzing" | "review" | "finalized" | "failed";

const scanStatusConfig: Record<ScanStatusValue, { icon: typeof CircleCheckIcon; style: string }> = {
  draft: { icon: FilePenLineIcon, style: neutralStyle },
  analyzing: { icon: LoaderCircleIcon, style: `bg-info/12 ${TONE_TEXT.info} ring-1 ring-info/25` },
  review: { icon: EyeIcon, style: `bg-warning/15 ${TONE_TEXT.warning} ring-1 ring-warning/30` },
  finalized: { icon: CircleCheckIcon, style: `bg-success/12 ${TONE_TEXT.success} ring-1 ring-success/25` },
  failed: { icon: CircleAlertIcon, style: "bg-destructive/10 text-destructive ring-1 ring-destructive/25" },
};

/** Scan.status (common.scanStatus.*). */
export function ScanStatusBadge({ status, className }: { status: ScanStatusValue; className?: string }) {
  const t = useTranslations("common.scanStatus");
  const { icon: Icon, style } = scanStatusConfig[status];
  return (
    <Badge variant="outline" className={cn("border-transparent", style, className)}>
      <Icon aria-hidden className={status === "analyzing" ? "motion-safe:animate-spin" : undefined} />
      {t(status)}
    </Badge>
  );
}

export type AttemptStatusValue = "in_progress" | "completed" | "abandoned";

const attemptStatusConfig: Record<AttemptStatusValue, { icon: typeof CircleCheckIcon; style: string }> = {
  in_progress: { icon: CirclePlayIcon, style: `bg-info/12 ${TONE_TEXT.info} ring-1 ring-info/25` },
  completed: { icon: CircleCheckIcon, style: `bg-success/12 ${TONE_TEXT.success} ring-1 ring-success/25` },
  abandoned: { icon: CircleMinusIcon, style: neutralStyle },
};

/** SimulationAttempt.status (common.attemptStatus.*). */
export function AttemptStatusBadge({ status, className }: { status: AttemptStatusValue; className?: string }) {
  const t = useTranslations("common.attemptStatus");
  const { icon: Icon, style } = attemptStatusConfig[status];
  return (
    <Badge variant="outline" className={cn("border-transparent", style, className)}>
      <Icon aria-hidden />
      {t(status)}
    </Badge>
  );
}
