import { ID_PATTERN, RISK_LEVELS, type RiskLevelValue, SCAN_STATUSES, type ScanStatusValue, SEARCH_MAX } from "./constants";

/**
 * Filters of the scan list, kept in the URL (?status=review&protocol=<id>&department=<id>&risk=high&mine=1&q=room&page=2)
 * so a filtered view can be shared and survives a reload. Pure: used by the page (server) and the filter bar (client).
 * Unknown or malformed values are dropped, never passed to the database.
 */
export type ScanFilters = {
  status: ScanStatusValue | null;
  protocol: string | null;
  department: string | null;
  risk: RiskLevelValue | null;
  mine: boolean;
  q: string | null;
  page: number;
};

export const EMPTY_FILTERS: ScanFilters = {
  status: null,
  protocol: null,
  department: null,
  risk: null,
  mine: false,
  q: null,
  page: 1,
};

export type SearchParamsInput = Record<string, string | string[] | undefined> | URLSearchParams;

function first(params: SearchParamsInput, key: string): string | null {
  const value = params instanceof URLSearchParams ? params.get(key) : params[key];
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v : null;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

const MAX_PAGE = 10_000;

export function parseScanFilters(params: SearchParamsInput): ScanFilters {
  const id = (key: string) => {
    const v = first(params, key);
    return v !== null && ID_PATTERN.test(v) ? v : null;
  };
  const q = first(params, "q")?.trim().slice(0, SEARCH_MAX) || null;
  const page = Number.parseInt(first(params, "page") ?? "", 10);
  return {
    status: oneOf(first(params, "status"), SCAN_STATUSES),
    protocol: id("protocol"),
    department: id("department"),
    risk: oneOf(first(params, "risk"), RISK_LEVELS),
    mine: first(params, "mine") === "1",
    q,
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** The query string for `filters` (defaults omitted, stable key order), without the leading "?". */
export function scanFiltersQuery(filters: Partial<ScanFilters>): string {
  const p = new URLSearchParams();
  if (filters.status) p.set("status", filters.status);
  if (filters.protocol) p.set("protocol", filters.protocol);
  if (filters.department) p.set("department", filters.department);
  if (filters.risk) p.set("risk", filters.risk);
  if (filters.mine) p.set("mine", "1");
  if (filters.q) p.set("q", filters.q);
  if (filters.page && filters.page > 1) p.set("page", String(filters.page));
  return p.toString();
}

/** How many filters narrow the list (search and paging excluded). */
export function activeFilterCount(filters: ScanFilters): number {
  return [filters.status, filters.protocol, filters.department, filters.risk].filter(Boolean).length + (filters.mine ? 1 : 0);
}

export function hasAnyFilter(filters: ScanFilters): boolean {
  return activeFilterCount(filters) > 0 || !!filters.q;
}
