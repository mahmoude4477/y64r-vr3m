import { useFormatter, useTranslations } from "next-intl";
import { ToneBadge } from "@/components/admin/badges";
import { aiCallState, aiErrorCodeKey } from "@/lib/admin/ai-display";
import type { AiCallSummary } from "@/lib/admin/assessment-queries";
import { AiStateBadge } from "@/components/admin/ai-badges";
import { Usd } from "@/components/admin/usd";

// Small read-only blocks shared by the scan and attempt details of /admin/assessments.

/** A term / value list (who, where, when) with a responsive two-column grid. */
export function DetailList({ items }: { items: Array<{ label: string; value: React.ReactNode } | null | undefined | false | ""> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items
        .filter((i): i is { label: string; value: React.ReactNode } => !!i)
        .map((i) => (
          <div key={i.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{i.label}</dt>
            <dd className="min-w-0 break-words">{i.value}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Step flags: critical, mandatory or optional, the weight. */
export function StepFlags({ step }: { step: { isCritical: boolean; isMandatory: boolean; weight: number; visualCheck?: boolean } }) {
  const t = useTranslations("admin.assessment.flags");
  const format = useFormatter();
  return (
    <span className="flex flex-wrap gap-1">
      {step.isCritical && <ToneBadge kind="danger">{t("critical")}</ToneBadge>}
      <ToneBadge kind="neutral">{step.isMandatory ? t("mandatory") : t("optional")}</ToneBadge>
      <ToneBadge kind="neutral">{t("weight", { n: format.number(step.weight, "integer") })}</ToneBadge>
      {step.visualCheck && <ToneBadge kind="primary">{t("visual")}</ToneBadge>}
    </span>
  );
}

/** The AI calls made for one scan or attempt (status, model, time, cost): a list, so it never scrolls sideways. */
export function AiCallsForTarget({ calls }: { calls: AiCallSummary[] }) {
  const t = useTranslations("admin.ai");
  const format = useFormatter();
  if (calls.length === 0) return <p className="text-sm text-muted-foreground">{t("target.none")}</p>;
  const now = new Date();
  return (
    <ul className="flex flex-col divide-y" aria-label={t("target.caption")}>
      {calls.map((c) => {
        const code = aiErrorCodeKey(c.errorCode);
        return (
          <li key={c.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <AiStateBadge state={aiCallState(c, now)} />
                <span className="text-sm">{t(`kinds.${c.kind}`)}</span>
              </span>
              {code && <span className="text-xs text-muted-foreground">{t(`errorCodes.${code}`)}</span>}
              <span className="text-xs text-muted-foreground tabular-nums">
                <time dateTime={c.createdAt.toISOString()}>{format.dateTime(c.createdAt, "dateTime")}</time>
              </span>
            </div>
            {/* Phones: the model id on a row of its own (in a third of 390 px it broke mid-token), then duration and cost. */}
            <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 sm:gap-y-1 sm:text-end">
              <div className="col-span-2 flex min-w-0 flex-col sm:col-span-1">
                <dt className="text-muted-foreground">{t("table.model")}</dt>
                <dd>
                  <code dir="ltr" className="font-mono wrap-anywhere">
                    {c.model}
                  </code>
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-muted-foreground">{t("table.duration")}</dt>
                <dd className="tabular-nums">{c.latencyMs === null ? "—" : t("seconds", { n: format.number(c.latencyMs / 1000, "decimal") })}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-muted-foreground">{t("table.cost")}</dt>
                <dd>
                  <Usd value={c.costUsd} precise />
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
