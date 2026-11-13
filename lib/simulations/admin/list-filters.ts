/**
 * Filters of the admin scenario list (/admin/scenarios?q=&owner=&status=&protocol=&page=), parsed from the URL and
 * turned back into a query string. Pure and unit-tested; unknown values fall back to "all".
 */

export const OWNER_FILTERS = ["all", "global", "institutions"] as const;
/**
 * "unpublished" lists every scenario that is not published: drafts nobody has played and played versions that were
 * unpublished or replaced (the list badges them "Draft" / "Unpublished"). The old value "draft" is still read.
 */
export const STATUS_FILTERS = ["all", "published", "unpublished"] as const;
export const PAGE_SIZE = 20;

export type OwnerFilter = (typeof OWNER_FILTERS)[number];
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export type AdminListFilters = {
  /** Free text matched against both titles and the slug (trimmed, at most 100 characters). */
  q: string;
  owner: OwnerFilter;
  status: StatusFilter;
  /** Protocol id, or null for every protocol. */
  protocol: string | null;
  /** 1-based page. */
  page: number;
};

export const DEFAULT_FILTERS: AdminListFilters = { q: "", owner: "all", status: "all", protocol: null, page: 1 };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const oneOf = <T extends string>(values: readonly T[], v: string | undefined, fallback: T): T =>
  v !== undefined && (values as readonly string[]).includes(v) ? (v as T) : fallback;

export function parseAdminListFilters(params: Record<string, string | string[] | undefined>): AdminListFilters {
  const q = (first(params.q) ?? "").trim().slice(0, 100);
  const protocol = first(params.protocol)?.trim() ?? "";
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  return {
    q,
    owner: oneOf(OWNER_FILTERS, first(params.owner), "all"),
    status: oneOf(STATUS_FILTERS, first(params.status) === "draft" ? "unpublished" : first(params.status), "all"),
    protocol: /^[A-Za-z0-9_-]{1,64}$/.test(protocol) ? protocol : null,
    page: Number.isFinite(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/** "?q=…&owner=…" for the non-default filters ("" when none). */
export function adminListQuery(filters: AdminListFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.owner !== "all") params.set("owner", filters.owner);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.protocol) params.set("protocol", filters.protocol);
  if (filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function hasActiveFilters(filters: AdminListFilters): boolean {
  return filters.q !== "" || filters.owner !== "all" || filters.status !== "all" || filters.protocol !== null;
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}
