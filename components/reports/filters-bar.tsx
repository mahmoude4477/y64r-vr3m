"use client";

import { RotateCcwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, use, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { usePathname, useRouter } from "@/i18n/navigation";
import { addDays, DEFAULT_RANGE_DAYS, type Granularity, queryString, RANGE_PRESETS } from "@/lib/reports/filters";
import { cn } from "@/lib/utils";

/**
 * Report filters (dataviz: one row above everything they scope, date range first, presets before a custom range).
 * State goes to the URL (the server parses it with lib/reports/filters.ts). Navigation runs in a transition: the
 * report below keeps its previous render, dimmed, until the new one arrives (no skeleton flash, no layout jump).
 */

type Pending = { pending: boolean; start: (fn: () => void) => void };
const PendingContext = createContext<Pending>({ pending: false, start: (fn) => fn() });

export function ReportFilterProvider({ children }: { children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  return <PendingContext value={{ pending, start: startTransition }}>{children}</PendingContext>;
}

/** Wraps the report body: dimmed and aria-busy while new filters load. */
export function ReportPendingArea({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = use(PendingContext);
  return (
    <div aria-busy={pending || undefined} className={cn("flex flex-col gap-6 transition-opacity", pending && "opacity-60", className)}>
      {children}
    </div>
  );
}

export type FilterBarValue = {
  from: string;
  to: string;
  protocolId: string | null;
  teamId: string | null;
  granularity: Granularity;
  customRange: boolean;
  customGranularity: boolean;
};

const ALL = "all";
const AUTO = "auto";

export function ReportFiltersBar({
  value,
  today,
  protocols,
  departments,
  extraQuery,
}: {
  value: FilterBarValue;
  today: string;
  protocols: ReadonlyArray<{ id: string; label: string }>;
  departments: ReadonlyArray<{ id: string; name: string }>;
  /** Query values that are not filters but must survive (e.g. the view). */
  extraQuery?: Record<string, string>;
}) {
  const t = useTranslations("reports.filters");
  const router = useRouter();
  const pathname = usePathname();
  const { pending, start } = use(PendingContext);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const [rangeTouched, setRangeTouched] = useState(value.customRange);
  const [protocol, setProtocol] = useState(value.protocolId ?? ALL);
  const [department, setDepartment] = useState(value.teamId ?? ALL);
  const [period, setPeriod] = useState<string>(value.customGranularity ? value.granularity : AUTO);

  // A new URL (applied filters, "back", a link) resets the form to what the server parsed. The form is NOT
  // remounted for it (a `key` did that): the button that was pressed keeps the keyboard focus, and the live region
  // below survives to say that the report was updated. React's "adjust state while rendering" pattern, no effect.
  const valueKey = JSON.stringify([value.from, value.to, value.protocolId, value.teamId, value.granularity, value.customRange, value.customGranularity]);
  const [shownKey, setShownKey] = useState(valueKey);
  if (shownKey !== valueKey) {
    setShownKey(valueKey);
    setFrom(value.from);
    setTo(value.to);
    setRangeTouched(value.customRange);
    setProtocol(value.protocolId ?? ALL);
    setDepartment(value.teamId ?? ALL);
    setPeriod(value.customGranularity ? value.granularity : AUTO);
  }
  // "Updating…" while the new report loads, then "Report updated" once it is there (screen readers hear both).
  const [announce, setAnnounce] = useState<"" | "applying" | "updated">("");
  const [wasPending, setWasPending] = useState(pending);
  if (wasPending !== pending) {
    setWasPending(pending);
    setAnnounce(pending ? "applying" : "updated");
  }

  function navigate(query: Record<string, string | null>) {
    start(() => router.push(`${pathname}${queryString({ ...extraQuery, ...query })}`, { scroll: false }));
  }

  function current(overrides: Partial<Record<"from" | "to", string | null>> = {}) {
    const keepRange = rangeTouched || "from" in overrides;
    return {
      from: keepRange ? (overrides.from !== undefined ? overrides.from : from) : null,
      to: keepRange ? (overrides.to !== undefined ? overrides.to : to) : null,
      protocol: protocol === ALL ? null : protocol,
      department: department === ALL ? null : department,
      period: period === AUTO ? null : period,
    };
  }

  function applyPreset(days: number) {
    const presetFrom = addDays(today, -(days - 1));
    setFrom(presetFrom);
    setTo(today);
    if (days === DEFAULT_RANGE_DAYS) {
      setRangeTouched(false); // the default range stays "rolling" in the link
      navigate({ ...current(), from: null, to: null });
    } else {
      setRangeTouched(true);
      navigate(current({ from: presetFrom, to: today }));
    }
  }

  const activePreset = RANGE_PRESETS.find((d) => to === today && from === addDays(today, -(d - 1)));
  const protocolItems = [{ value: ALL, label: t("allProtocols") }, ...protocols.map((p) => ({ value: p.id, label: p.label }))];
  const departmentItems = [{ value: ALL, label: t("allDepartments") }, ...departments.map((d) => ({ value: d.id, label: d.name }))];
  const periodItems = [
    { value: AUTO, label: t("periodAuto") },
    { value: "week", label: t("week") },
    { value: "month", label: t("month") },
  ];

  return (
    <form
      aria-label={t("label")}
      className="flex flex-col gap-3 rounded-xl border bg-card p-3 print:hidden sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        navigate(current());
      }}
    >
      <div role="group" aria-label={t("presets")} className="flex flex-wrap items-center gap-1.5">
        {RANGE_PRESETS.map((days) => (
          <Button
            key={days}
            type="button"
            size="sm"
            variant={activePreset === days ? "secondary" : "ghost"}
            aria-pressed={activePreset === days}
            className="min-h-8"
            onClick={() => applyPreset(days)}
          >
            {t(`preset${days}`)}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] md:items-end">
        <div className="flex min-w-0 flex-col gap-1.5">
          <FieldLabel htmlFor="report-from">{t("from")}</FieldLabel>
          <Input
            id="report-from"
            type="date"
            value={from}
            max={to || today}
            required
            className="min-h-9"
            onChange={(e) => {
              setFrom(e.target.value);
              setRangeTouched(true);
            }}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <FieldLabel htmlFor="report-to">{t("to")}</FieldLabel>
          <Input
            id="report-to"
            type="date"
            value={to}
            min={from}
            max={today}
            required
            className="min-h-9"
            onChange={(e) => {
              setTo(e.target.value);
              setRangeTouched(true);
            }}
          />
        </div>
        <div className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1">
          <FieldLabel htmlFor="report-protocol">{t("protocol")}</FieldLabel>
          <Select items={protocolItems} value={protocol} onValueChange={(v) => setProtocol(typeof v === "string" ? v : ALL)}>
            <SelectTrigger id="report-protocol" className="min-h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {protocolItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {departments.length > 0 && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="report-department">{t("department")}</FieldLabel>
            <Select items={departmentItems} value={department} onValueChange={(v) => setDepartment(typeof v === "string" ? v : ALL)}>
              <SelectTrigger id="report-department" className="min-h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {departmentItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className={cn("flex min-w-0 flex-col gap-1.5", departments.length === 0 && "col-span-2 md:col-span-1")}>
          <FieldLabel htmlFor="report-period">{t("period")}</FieldLabel>
          <Select items={periodItems} value={period} onValueChange={(v) => setPeriod(typeof v === "string" ? v : AUTO)}>
            <SelectTrigger id="report-period" className="min-h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 flex items-center gap-2 md:col-span-1">
          {/* aria-disabled, not disabled: a button that becomes disabled drops the keyboard focus to the page. */}
          <Button type="submit" className="min-h-9 flex-1 aria-disabled:opacity-70" aria-disabled={pending || undefined}>
            {pending && <Spinner aria-hidden />}
            {t("apply")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-9"
            onClick={() => {
              setFrom(addDays(today, -(DEFAULT_RANGE_DAYS - 1)));
              setTo(today);
              setRangeTouched(false);
              setProtocol(ALL);
              setDepartment(ALL);
              setPeriod(AUTO);
              navigate({ from: null, to: null, protocol: null, department: null, period: null });
            }}
          >
            <RotateCcwIcon aria-hidden />
            {t("reset")}
          </Button>
        </div>
      </div>
      <p role="status" className="sr-only">
        {announce === "applying" ? t("applying") : announce === "updated" ? t("updated") : ""}
      </p>
    </form>
  );
}
