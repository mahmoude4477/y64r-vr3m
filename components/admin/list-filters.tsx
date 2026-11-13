"use client";

import { ChevronDownIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { listHref } from "@/lib/admin/params";
import { cn } from "@/lib/utils";

export type FilterSelect = {
  name: string;
  label: string;
  value: string;
  defaultValue: string;
  options: ReadonlyArray<{ value: string; label: string }>;
};

/**
 * Search box, select filters and an optional day range of an admin list. The URL is the state (?q=&role=&from=&page=),
 * so a filtered list can be shared and survives a reload; any change goes back to page 1. The values come from the
 * server (no useSearchParams). `keep` holds params that stay as they are (the tab of a list, an actor chip);
 * "Clear filters" keeps them too.
 */
export function ListFilters({
  path,
  label,
  searchLabel,
  searchPlaceholder,
  query = "",
  selects,
  dates,
  keep = {},
}: {
  path: `/${string}`;
  label: string;
  /** Without a label there is no search box. */
  searchLabel?: string;
  searchPlaceholder?: string;
  query?: string;
  selects: readonly FilterSelect[];
  /** A "from" / "to" calendar-day range (YYYY-MM-DD, "" = open). */
  dates?: { from: string; to: string };
  keep?: Record<string, string>;
}) {
  const t = useTranslations("admin.list");
  const format = useFormatter();
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(query);
  const [from, setFrom] = useState(dates?.from ?? "");
  const [to, setTo] = useState(dates?.to ?? "");
  const current = Object.fromEntries(selects.map((s) => [s.name, s.value]));
  const defaults = Object.fromEntries(selects.map((s) => [s.name, s.defaultValue]));
  const filtered = query !== "" || selects.some((s) => s.value !== s.defaultValue) || !!dates?.from || !!dates?.to;

  function go(next: Record<string, string | undefined>) {
    const params = {
      ...keep,
      ...current,
      ...(searchLabel ? { q: text.trim() } : {}),
      ...(dates ? { from, to } : {}),
      ...next,
      page: null,
    };
    const href = listHref(path, params, defaults);
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function changeDay(which: "from" | "to", value: string) {
    if (which === "from") setFrom(value);
    else setTo(value);
    // A picked or fully typed day applies right away; a cleared one on blur or with the search button.
    if (value) go({ [which]: value });
  }

  function commitDay(which: "from" | "to", value: string) {
    if (value !== (which === "from" ? dates?.from : dates?.to)) go({ [which]: value });
  }

  // Phones: the day range and the selects fold into a "Filters (n)" disclosure when there are many of them, so the
  // first result is not pushed below the fold; from sm up they are always shown.
  const foldable = !!dates || selects.length > 2;
  const activeCount = selects.filter((s) => s.value !== s.defaultValue).length + (dates?.from ? 1 : 0) + (dates?.to ? 1 : 0);
  const [open, setOpen] = useState(false);
  const panelId = `${id}-filters`;

  const clear = filtered && (
    <Button
      type="button"
      variant="ghost"
      className="shrink-0"
      onClick={() => {
        setText("");
        setFrom("");
        setTo("");
        startTransition(() => router.replace(listHref(path, { ...keep }, defaults), { scroll: false }));
      }}
    >
      <XIcon aria-hidden />
      {t("clear")}
    </Button>
  );

  return (
    <div role="search" aria-label={label} className="flex flex-col gap-3">
      {(searchLabel || foldable) && (
        // Without a search box this row holds only the phone toggle and "clear": no empty row on wide screens.
        <div className={cn("flex flex-wrap items-end gap-2", !searchLabel && !filtered && "sm:hidden")}>
          {searchLabel && (
            // The search button sits right next to its box, whatever wraps around it.
            <form
              className="flex min-w-0 flex-1 basis-64 items-end gap-2 sm:max-w-xl"
              onSubmit={(e) => {
                e.preventDefault();
                go({});
              }}
            >
              <Field className="min-w-0 flex-1 gap-1.5">
                <FieldLabel htmlFor={`${id}-q`}>{searchLabel}</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon aria-hidden />
                  </InputGroupAddon>
                  <InputGroupInput
                    id={`${id}-q`}
                    type="search"
                    value={text}
                    maxLength={100}
                    placeholder={searchPlaceholder}
                    enterKeyHint="search"
                    onChange={(e) => setText(e.target.value)}
                  />
                </InputGroup>
              </Field>
              <Button type="submit" variant="secondary" className="h-8 shrink-0" aria-label={t("apply")}>
                {pending ? <Spinner /> : <SearchIcon aria-hidden />}
                <span aria-hidden className="hidden sm:inline">
                  {t("apply")}
                </span>
              </Button>
            </form>
          )}
          {foldable && (
            <Button
              type="button"
              variant="outline"
              className="shrink-0 sm:hidden"
              aria-expanded={open}
              aria-controls={panelId}
              data-filters-toggle=""
              onClick={() => setOpen((v) => !v)}
            >
              <SlidersHorizontalIcon aria-hidden />
              {activeCount > 0 ? t("filtersCount", { n: format.number(activeCount, "integer") }) : t("filters")}
              <ChevronDownIcon aria-hidden className={cn("transition-transform", open && "rotate-180")} />
            </Button>
          )}
          {!searchLabel && pending && <Spinner className="mb-2 self-end" />}
          {clear}
        </div>
      )}
      {(dates || selects.length > 0) && (
        <div id={panelId} className={cn("flex-col gap-3 sm:flex sm:flex-row sm:flex-wrap sm:items-end", foldable && !open ? "hidden" : "flex")}>
          {dates && (
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:w-80">
              <Field className="min-w-0 gap-1.5">
                <FieldLabel htmlFor={`${id}-from`}>{t("from")}</FieldLabel>
                <Input
                  id={`${id}-from`}
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => changeDay("from", e.target.value)}
                  onBlur={(e) => commitDay("from", e.target.value)}
                />
              </Field>
              <Field className="min-w-0 gap-1.5">
                <FieldLabel htmlFor={`${id}-to`}>{t("to")}</FieldLabel>
                <Input
                  id={`${id}-to`}
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => changeDay("to", e.target.value)}
                  onBlur={(e) => commitDay("to", e.target.value)}
                />
              </Field>
            </div>
          )}
          {selects.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
              {selects.map((s) => {
                const items = Object.fromEntries(s.options.map((o) => [o.value, o.label]));
                return (
                  <Field key={s.name} className="min-w-0 gap-1.5 sm:w-44">
                    <FieldLabel htmlFor={`${id}-${s.name}`}>{s.label}</FieldLabel>
                    <Select items={items} value={s.value} onValueChange={(v) => go({ [s.name]: (v as string | null) ?? s.defaultValue })}>
                      <SelectTrigger id={`${id}-${s.name}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {s.options.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                );
              })}
            </div>
          )}
          {!searchLabel && !foldable && pending && <Spinner className="self-center sm:mb-2 sm:self-end" />}
          {!searchLabel && !foldable && clear}
        </div>
      )}
    </div>
  );
}
