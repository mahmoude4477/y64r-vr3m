import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

/**
 * What makes a gap critical, in words that stay true:
 * - "Critical step" only when the protocol step itself is critical (ProtocolStep.isCritical);
 * - otherwise "N critical violations" when simulations chose a critical wrong option for an ordinary step
 *   (SimulationStepResult.critical). recommendationsFor folds both into one `critical` flag, which must not be shown
 *   as "critical step" (review SPEC-2: an ordinary step was labelled a critical protocol step).
 */
export function GapCriticalBadge({ criticalStep, criticalViolations }: { criticalStep: boolean; criticalViolations: number }) {
  const t = useTranslations("reports.critical");
  if (!criticalStep && criticalViolations <= 0) return null;
  return (
    <Badge variant="destructive" className="h-5">
      {criticalStep ? t("step") : t("violations", { count: criticalViolations })}
    </Badge>
  );
}

/** A violated step marked critical in a person's own results (a critical step, or a critical wrong option). */
export function CriticalViolationBadge() {
  const t = useTranslations("reports.critical");
  return (
    <Badge variant="destructive" className="h-5">
      {t("violation")}
    </Badge>
  );
}
