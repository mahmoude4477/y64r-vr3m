import { BanIcon, CircleAlertIcon, CircleCheckIcon, CircleDashedIcon, LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { ToneBadge } from "@/components/admin/badges";
import type { AiCallState } from "@/lib/admin/ai-display";

// The state of one AI call: color + icon + text (never color alone).

const STATES = {
  ok: { kind: "success", icon: CircleCheckIcon },
  refused: { kind: "warning", icon: BanIcon },
  error: { kind: "danger", icon: CircleAlertIcon },
  running: { kind: "primary", icon: LoaderCircleIcon },
  stalled: { kind: "neutral", icon: CircleDashedIcon },
} as const;

export function AiStateBadge({ state }: { state: AiCallState }) {
  const t = useTranslations("admin.ai.states");
  const { kind, icon } = STATES[state];
  return (
    <ToneBadge kind={kind} icon={icon}>
      {t(state)}
    </ToneBadge>
  );
}
