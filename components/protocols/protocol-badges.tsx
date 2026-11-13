import { Building2Icon, CameraIcon, CircleCheckIcon, CircleDotIcon, OctagonAlertIcon, ScaleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { ProtocolCategoryValue } from "@/lib/protocols/search";
import { cn } from "@/lib/utils";

/**
 * Badges of the protocol library (color + icon + text, never color alone). Plain components with
 * useTranslations, so they render in Server Components (and would in Client Components).
 */

const tone = {
  primary: "border-transparent bg-primary/10 text-primary ring-1 ring-primary/20",
  critical: "border-transparent bg-destructive/10 text-destructive ring-1 ring-destructive/25",
  neutral: "border-transparent bg-muted text-muted-foreground ring-1 ring-border",
  secondary: "border-transparent bg-secondary text-secondary-foreground ring-1 ring-border",
} as const;

export function CategoryBadge({ category, className }: { category: ProtocolCategoryValue; className?: string }) {
  const t = useTranslations("common.category");
  return (
    <Badge variant="outline" className={className}>
      {t(category)}
    </Badge>
  );
}

/** The active institution's own protocol (custom copy or its own). */
export function OwnProtocolBadge({ className }: { className?: string }) {
  const t = useTranslations("protocols");
  return (
    <Badge variant="outline" className={cn(tone.secondary, className)}>
      <Building2Icon aria-hidden />
      {t("own")}
    </Badge>
  );
}

export function MandatoryBadge({ mandatory }: { mandatory: boolean }) {
  const t = useTranslations("protocols.badges");
  return mandatory ? (
    <Badge variant="outline" className={tone.primary}>
      <CircleCheckIcon aria-hidden />
      {t("mandatory")}
    </Badge>
  ) : (
    <Badge variant="outline" className={tone.neutral}>
      <CircleDotIcon aria-hidden />
      {t("recommended")}
    </Badge>
  );
}

export function CriticalBadge() {
  const t = useTranslations("protocols.badges");
  return (
    <Badge variant="outline" className={tone.critical}>
      <OctagonAlertIcon aria-hidden />
      {t("critical")}
    </Badge>
  );
}

export function VisualCheckBadge() {
  const t = useTranslations("protocols.badges");
  return (
    <Badge variant="outline" className={tone.secondary}>
      <CameraIcon aria-hidden />
      {t("visual")}
    </Badge>
  );
}

export function WeightBadge({ weight }: { weight: number }) {
  const t = useTranslations("protocols.badges");
  return (
    <Badge variant="outline" className={cn(tone.neutral, "tabular-nums")}>
      <ScaleIcon aria-hidden />
      {t("weight", { weight: String(weight) })}
    </Badge>
  );
}
