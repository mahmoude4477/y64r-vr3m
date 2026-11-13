"use client";

import { ListFilterIcon, SearchIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { RISK_LEVELS, SCAN_STATUSES } from "@/lib/scans/constants";
import { activeFilterCount, type ScanFilters, scanFiltersQuery } from "@/lib/scans/filters";
import type { FilterOption } from "@/lib/scans/queries";
import { cn } from "@/lib/utils";

const ANY = "all";
const SEARCH_DEBOUNCE_MS = 350;

type Props = { filters: ScanFilters; protocols: FilterOption[]; departments: FilterOption[] };

/**
 * Filters of the scan list, kept in the URL. On phones they live in a bottom sheet behind one "Filters" button (with
 * the number of active filters); from md up they sit in one row. Every change applies at once (router.replace).
 */
export function ScanFiltersBar({ filters, protocols, departments }: Props) {
  const t = useTranslations("scans.filters");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const count = activeFilterCount(filters);

  const apply = (patch: Partial<ScanFilters>) => {
    const query = scanFiltersQuery({ ...filters, ...patch, page: 1 });
    startTransition(() => router.replace(query ? `/scans?${query}` : "/scans", { scroll: false }));
  };
  const clear = () => apply({ status: null, protocol: null, department: null, risk: null, mine: false });

  return (
    <section aria-label={t("label")} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SearchBox value={filters.q} onSearch={(q) => apply({ q })} />
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button variant="outline" size="lg" className="shrink-0 md:hidden">
                <ListFilterIcon aria-hidden />
                {count > 0 ? t("openWithCount", { count: String(count) }) : t("open")}
              </Button>
            }
          />
          <SheetContent side="bottom" showCloseButton={false} className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>{t("label")}</SheetTitle>
              <SheetDescription>{t("description")}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4">
              <FilterFields idPrefix="sheet" filters={filters} protocols={protocols} departments={departments} apply={apply} stacked />
            </div>
            <SheetFooter className="flex-row gap-2">
              <Button variant="outline" size="lg" className="flex-1" onClick={clear} disabled={count === 0}>
                {t("clear")}
              </Button>
              <Button size="lg" className="flex-1" onClick={() => setSheetOpen(false)}>
                {pending && <Spinner aria-hidden />}
                {t("done")}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
      <div className="hidden flex-wrap items-end gap-3 md:flex">
        <FilterFields idPrefix="bar" filters={filters} protocols={protocols} departments={departments} apply={apply} />
        {count > 0 && (
          <Button variant="ghost" size="lg" onClick={clear}>
            <XIcon aria-hidden />
            {t("clear")}
          </Button>
        )}
      </div>
      <p role="status" className={cn("text-xs text-muted-foreground", !pending && "sr-only")}>
        {pending ? t("updating") : ""}
      </p>
    </section>
  );
}

function SearchBox({ value, onSearch }: { value: string | null; onSearch: (q: string | null) => void }) {
  const t = useTranslations("scans.filters");
  const [text, setText] = useState(value ?? "");
  // The URL can change without typing (back button, "clear"): follow it unless it is the value we just sent.
  const [seen, setSeen] = useState(value);
  const [sent, setSent] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== sent) setText(value ?? "");
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const send = (next: string) => {
    const q = next.trim() || null;
    setSent(q);
    onSearch(q);
  };

  return (
    <form
      role="search"
      className="min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        send(text);
      }}
    >
      <Label htmlFor="scan-search" className="sr-only">
        {t("search")}
      </Label>
      <InputGroup className="h-9">
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          id="scan-search"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          maxLength={80}
          placeholder={t("searchPlaceholder")}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => send(next), SEARCH_DEBOUNCE_MS);
          }}
        />
      </InputGroup>
    </form>
  );
}

function FilterFields({
  idPrefix,
  filters,
  protocols,
  departments,
  apply,
  stacked = false,
}: Props & { idPrefix: string; apply: (patch: Partial<ScanFilters>) => void; stacked?: boolean }) {
  const t = useTranslations("scans.filters");
  const status = useTranslations("common.scanStatus");
  const risk = useTranslations("common.risk");

  const select = (
    key: "status" | "protocol" | "department" | "risk",
    label: string,
    anyLabel: string,
    options: FilterOption[],
  ) => {
    const items = [{ value: ANY, label: anyLabel }, ...options];
    const id = `${idPrefix}-filter-${key}`;
    return (
      <div className={cn("flex flex-col gap-2", stacked ? "w-full" : "w-44")}>
        <Label htmlFor={id}>{label}</Label>
        <Select
          items={items}
          value={filters[key] ?? ANY}
          onValueChange={(v) => apply({ [key]: v === ANY || v === null ? null : v } as Partial<ScanFilters>)}
        >
          <SelectTrigger id={id} className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <>
      {select("status", t("status"), t("anyStatus"), SCAN_STATUSES.map((s) => ({ value: s, label: status(s) })))}
      {protocols.length > 0 && select("protocol", t("protocol"), t("anyProtocol"), protocols)}
      {departments.length > 0 && select("department", t("department"), t("anyDepartment"), departments)}
      {select("risk", t("risk"), t("anyRisk"), RISK_LEVELS.map((r) => ({ value: r, label: risk(r) })))}
      <div className={cn("flex items-center gap-2", stacked ? "min-h-9 py-1" : "h-9")}>
        <Switch id={`${idPrefix}-filter-mine`} checked={filters.mine} onCheckedChange={(checked) => apply({ mine: checked })} />
        <Label htmlFor={`${idPrefix}-filter-mine`} className="font-normal">
          {t("mine")}
        </Label>
      </div>
    </>
  );
}
