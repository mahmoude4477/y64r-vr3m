import { ArrowRightIcon, BotIcon, ChevronRightIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { AiStateBadge } from "@/components/admin/ai-badges";
import { Usd } from "@/components/admin/usd";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { aiCallState, aiErrorCodeKey, aiTargetHref } from "@/lib/admin/ai-display";
import type { AiCallRow, AiPeriodTotals, FailureGroup } from "@/lib/admin/ai-queries";
import { orgNames } from "@/lib/admin/display";

// Read-only blocks of /admin/ai: the totals of today and this month, the failure log and the list of calls.

export function AiTotals({ today, month }: { today: AiPeriodTotals; month: AiPeriodTotals }) {
  const t = useTranslations("admin.ai.totals");
  const format = useFormatter();
  const n = (v: number) => format.number(v, "integer");
  const periods = [
    ["today", today],
    ["month", month],
  ] as const;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {periods.map(([key, p]) => (
        <section key={key} aria-labelledby={`ai-${key}`} className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
          <h3 id={`ai-${key}`} className="text-sm font-medium text-muted-foreground">
            {t(key)}
          </h3>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="flex flex-col">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">{n(p.calls)}</span>
              <span className="text-xs text-muted-foreground">{t("calls")}</span>
            </p>
            <p className="flex flex-col">
              <Usd value={p.costUsd} className="text-3xl font-semibold tracking-tight" />
              <span className="text-xs text-muted-foreground">{t("cost")}</span>
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
            {(
              [
                ["ok", n(p.ok)],
                ["failed", n(p.failed)],
                ["running", n(p.running)],
                ["stalled", n(p.stalled)],
                ["tokensIn", n(p.inputTokens)],
                ["tokensOut", n(p.outputTokens)],
                ["avgLatency", p.avgLatencyMs === null ? "—" : t("seconds", { n: format.number(p.avgLatencyMs / 1000, "decimal") })],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex min-w-0 flex-col">
                <dt className="truncate text-xs text-muted-foreground">{t(label)}</dt>
                <dd
                  className={
                    label === "failed" && p.failed > 0
                      ? "font-medium text-destructive tabular-nums"
                      : label === "stalled" && p.stalled > 0
                        ? "font-medium text-[color-mix(in_oklab,var(--warning),var(--foreground)_50%)] tabular-nums dark:text-warning"
                        : "font-medium tabular-nums"
                  }
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function AiFailureLog({ groups }: { groups: FailureGroup[] }) {
  const t = useTranslations("admin.ai");
  const format = useFormatter();
  if (groups.length === 0) return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("failures.empty")}</p>;
  return (
    <ul className="flex flex-col divide-y">
      {groups.map((g) => {
        const key = g.status === "stalled" ? null : aiErrorCodeKey(g.code);
        return (
          <li key={`${g.status}-${g.code}`} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <AiStateBadge state={g.status} />
                <code dir="ltr" className="font-mono text-xs text-muted-foreground">
                  {g.code}
                </code>
              </span>
              <p className="text-sm">{g.status === "stalled" ? t("states.stalledHint") : key ? t(`errorCodes.${key}`) : g.code}</p>
            </div>
            <div className="flex shrink-0 flex-col text-sm sm:items-end">
              <span className="font-medium tabular-nums">{t("failures.count", { count: g.count, n: format.number(g.count, "integer") })}</span>
              <span className="text-xs text-muted-foreground">
                {t("failures.last", { date: format.dateTime(g.lastAt, "dateTime") })}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Who({ call }: { call: AiCallRow }) {
  const t = useTranslations("admin.ai");
  const common = useTranslations("common");
  const locale = useLocale();
  return (
    <span className="flex min-w-0 flex-col">
      {call.user ? (
        <Link href={`/admin/users/${call.user.id}`} className="inline-flex min-h-6 max-w-full items-center truncate hover:underline">
          <bdi>{call.user.name}</bdi>
        </Link>
      ) : (
        <span className="text-muted-foreground">{common("deletedUser")}</span>
      )}
      <span className="truncate text-xs text-muted-foreground">
        {call.organization ? (
          <Link href={`/admin/organizations/${call.organization.id}`} className="inline-flex min-h-6 max-w-full items-center hover:underline">
            <bdi>{orgNames(call.organization, locale).primary}</bdi>
          </Link>
        ) : (
          t("table.noInstitution")
        )}
      </span>
    </span>
  );
}

export function AiCallsTable({ calls }: { calls: AiCallRow[] }) {
  const t = useTranslations("admin.ai");
  const format = useFormatter();
  const now = new Date();
  const seconds = (ms: number | null) => (ms === null ? "—" : t("seconds", { n: format.number(ms / 1000, "decimal") }));
  const tokens = (c: AiCallRow) =>
    c.inputTokens === null && c.outputTokens === null
      ? "—"
      : t("table.tokensValue", { in: format.number(c.inputTokens ?? 0, "integer"), out: format.number(c.outputTokens ?? 0, "integer") });
  const cost = (c: AiCallRow) => <Usd value={c.costUsd} precise />;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl ring-1 ring-foreground/10 [contain:inline-size] lg:block">
        <Table>
          <TableCaption className="sr-only">{t("calls.caption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">{t("table.when")}</TableHead>
              <TableHead>{t("table.kind")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.who")}</TableHead>
              <TableHead>{t("table.model")}</TableHead>
              <TableHead className="text-end">{t("table.duration")}</TableHead>
              <TableHead className="text-end">{t("table.tokens")}</TableHead>
              <TableHead className="pe-4 text-end">{t("table.cost")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((c) => {
              const code = aiErrorCodeKey(c.errorCode);
              const href = aiTargetHref(c.targetType, c.targetId);
              return (
                <TableRow key={c.id}>
                  <TableCell className="ps-4 whitespace-nowrap text-muted-foreground tabular-nums">
                    <time dateTime={c.createdAt.toISOString()}>{format.dateTime(c.createdAt, "dateTime")}</time>
                  </TableCell>
                  <TableCell>
                    {href ? (
                      <Link href={href} className="inline-flex items-center gap-1 hover:underline">
                        {t(`kinds.${c.kind}`)}
                        <ArrowRightIcon aria-hidden className="size-3.5 rtl:rotate-180" />
                      </Link>
                    ) : (
                      t(`kinds.${c.kind}`)
                    )}
                  </TableCell>
                  <TableCell className="max-w-56">
                    <span className="flex flex-col items-start gap-1">
                      <AiStateBadge state={aiCallState(c, now)} />
                      {code && <span className="text-xs whitespace-normal text-muted-foreground">{t(`errorCodes.${code}`)}</span>}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-48">
                    <Who call={c} />
                  </TableCell>
                  <TableCell>
                    <code dir="ltr" className="font-mono text-xs">
                      {c.model}
                    </code>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{seconds(c.latencyMs)}</TableCell>
                  <TableCell className="text-end tabular-nums">{tokens(c)}</TableCell>
                  <TableCell className="pe-4 text-end tabular-nums">{cost(c)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 lg:hidden" aria-label={t("calls.caption")}>
        {calls.map((c) => {
          const code = aiErrorCodeKey(c.errorCode);
          const href = aiTargetHref(c.targetType, c.targetId);
          return (
            <li key={c.id} className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-foreground/10">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BotIcon aria-hidden className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t(`kinds.${c.kind}`)}</span>
                    <AiStateBadge state={aiCallState(c, now)} />
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    <time dateTime={c.createdAt.toISOString()}>{format.dateTime(c.createdAt, "dateTime")}</time>
                  </span>
                  {code && <span className="text-xs text-muted-foreground">{t(`errorCodes.${code}`)}</span>}
                  <span className="text-sm">
                    <Who call={c} />
                  </span>
                </div>
                {href && (
                  <Link
                    href={href}
                    aria-label={t("calls.openTarget")}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronRightIcon aria-hidden className="size-4 rtl:rotate-180" />
                  </Link>
                )}
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div className="flex min-w-0 flex-col">
                  <dt className="text-muted-foreground">{t("table.duration")}</dt>
                  <dd className="tabular-nums">{seconds(c.latencyMs)}</dd>
                </div>
                <div className="flex min-w-0 flex-col">
                  <dt className="text-muted-foreground">{t("table.tokens")}</dt>
                  <dd className="tabular-nums">{tokens(c)}</dd>
                </div>
                <div className="flex min-w-0 flex-col">
                  <dt className="text-muted-foreground">{t("table.cost")}</dt>
                  <dd className="tabular-nums">{cost(c)}</dd>
                </div>
              </dl>
              <code dir="ltr" className="self-start font-mono text-xs text-muted-foreground">
                {c.model}
              </code>
            </li>
          );
        })}
      </ul>
    </>
  );
}
