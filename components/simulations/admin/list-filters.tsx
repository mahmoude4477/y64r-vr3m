"use client";

import { FilterXIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import {
  type AdminListFilters,
  adminListQuery,
  DEFAULT_FILTERS,
  hasActiveFilters,
  OWNER_FILTERS,
  type OwnerFilter,
  STATUS_FILTERS,
  type StatusFilter,
} from "@/lib/simulations/admin/list-filters";

const ALL = "all";

/**
 * Filters of the admin scenario list. They live in the URL (?q=&owner=&status=&protocol=), so the server renders the
 * filtered page and a reload or a shared link shows the same view; changing a filter goes back to page 1.
 */
export function ScenarioListFilters({ filters, protocols }: { filters: AdminListFilters; protocols: Array<{ id: string; title: string }> }) {
  const t = useTranslations("simulations.admin.list.filters");
  const ts = useTranslations("simulations.admin.status");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const searchId = useId();

  function go(next: AdminListFilters) {
    startTransition(() => router.replace(`/admin/scenarios${adminListQuery({ ...next, page: 1 })}`, { scroll: false }));
  }

  const ownerOptions = OWNER_FILTERS.map((value) => ({
    value,
    label: value === "all" ? t("allOwners") : value === "global" ? t("global") : t("institutions"),
  }));
  const statusOptions = STATUS_FILTERS.map((value) => ({
    value,
    label: value === "all" ? t("allStatuses") : value === "published" ? ts("published") : t("notPublished"),
  }));
  const protocolOptions = [{ value: ALL, label: t("allProtocols") }, ...protocols.map((p) => ({ value: p.id, label: p.title }))];

  return (
    <div role="group" aria-label={t("label")} aria-busy={pending || undefined} className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <form
        role="search"
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          go({ ...filters, q: q.trim() });
        }}
      >
        <Label htmlFor={searchId}>{t("search")}</Label>
        <div className="flex gap-2">
          <Input
            id={searchId}
            type="search"
            value={q}
            maxLength={100}
            placeholder={t("searchPlaceholder")}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary">
            {pending ? <Spinner aria-hidden /> : <SearchIcon aria-hidden />}
            {t("submit")}
          </Button>
        </div>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <FilterSelect
          label={t("owner")}
          value={filters.owner}
          options={ownerOptions}
          onChange={(value) => go({ ...filters, owner: (OWNER_FILTERS as readonly string[]).includes(value) ? (value as OwnerFilter) : "all" })}
        />
        <FilterSelect
          label={t("status")}
          value={filters.status}
          options={statusOptions}
          onChange={(value) => go({ ...filters, status: (STATUS_FILTERS as readonly string[]).includes(value) ? (value as StatusFilter) : "all" })}
        />
        <FilterSelect
          label={t("protocol")}
          value={filters.protocol && protocols.some((p) => p.id === filters.protocol) ? filters.protocol : ALL}
          options={protocolOptions}
          onChange={(value) => go({ ...filters, protocol: value === ALL ? null : value })}
        />
      </div>
      {hasActiveFilters(filters) && (
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={() => {
            setQ("");
            go(DEFAULT_FILTERS);
          }}
        >
          <FilterXIcon aria-hidden />
          {t("clear")}
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select items={options} value={value} onValueChange={(next) => onChange(typeof next === "string" ? next : ALL)}>
        <SelectTrigger id={id} aria-label={label} className="w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
