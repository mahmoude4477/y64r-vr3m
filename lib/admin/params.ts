// Search-param parsing and pagination for the admin lists (users, institutions, assessments, AI calls, audit log). Pure: no DB, no
// session, safe in Server and Client Components, unit-tested. Every value comes from the URL, so it is untrusted:
// unknown values fall back to the default instead of failing the page.

export const PAGE_SIZE = 20;
/** Search text longer than this is cut (a search box, not a free-text field). */
export const MAX_QUERY_LENGTH = 100;
/** Deeper pages are clamped (offsets past the data return an empty page; this only bounds the number). */
const MAX_PAGE = 10_000;

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** The first value of a search param (Next gives an array when the key repeats). */
export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** 1-based page number; anything that is not a positive integer is page 1. */
export function parsePage(raw: string | string[] | undefined): number {
  const value = first(raw);
  if (!value || !/^\d{1,6}$/.test(value)) return 1;
  const n = Number.parseInt(value, 10);
  return n >= 1 ? Math.min(n, MAX_PAGE) : 1;
}

/** Trimmed search text without control characters, at most MAX_QUERY_LENGTH characters ("" = no search). */
export function parseQuery(raw: string | string[] | undefined): string {
  const value = first(raw) ?? "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

/** One of `allowed`, else `fallback`. */
export function parseChoice<T extends string>(raw: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const value = first(raw);
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** A row id from the URL (cuid, Better Auth id): letters, digits, "_" and "-" only, else "" (= no filter). */
export function parseId(raw: string | string[] | undefined): string {
  const value = first(raw) ?? "";
  return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : "";
}

/** A calendar day "YYYY-MM-DD" from a date input (a real date between 2000 and 2100), else "". */
export function parseDay(raw: string | string[] | undefined): string {
  const value = first(raw) ?? "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return "";
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? value : "";
}

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Start of a Riyadh calendar day ("YYYY-MM-DD", already checked by parseDay) as a UTC instant. */
function riyadhDayStartOf(day: string, plusDays = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + plusDays) - RIYADH_OFFSET_MS);
}

/**
 * The instants of a "from" / "to" day filter (both inclusive, Riyadh calendar days like the rest of the admin panel):
 * { gte: start of `from`, lt: start of the day after `to` }. A reversed range is swapped; "" leaves that end open.
 */
export function dayRange(from: string, to: string): { gte?: Date; lt?: Date } | null {
  if (!from && !to) return null;
  const [a, b] = from && to && from > to ? [to, from] : [from, to];
  return { ...(a ? { gte: riyadhDayStartOf(a) } : {}), ...(b ? { lt: riyadhDayStartOf(b, 1) } : {}) };
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/** Rows to skip for a page (page is clamped to the last page so a stale link still shows rows). */
export function pageOffset(page: number, total: number, size = PAGE_SIZE): { page: number; skip: number } {
  const last = pageCount(total, size);
  const p = Math.min(Math.max(1, page), last);
  return { page: p, skip: (p - 1) * size };
}

export type PageItem = { kind: "page"; page: number } | { kind: "gap"; key: string };

/**
 * The page links to show: first, last, the current page and its neighbours, with gaps in between.
 * e.g. current 6 of 12 -> 1 … 5 6 7 … 12. Short lists (up to 7 pages) show every page.
 */
export function pageWindow(current: number, total: number): PageItem[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => ({ kind: "page" as const, page: i + 1 }));
  const pages = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].sort((a, b) => a - b);
  const items: PageItem[] = [];
  sorted.forEach((page, i) => {
    const previous = sorted[i - 1];
    // A gap of one page shows that page instead of "…".
    if (i > 0 && page - previous === 2) items.push({ kind: "page", page: previous + 1 });
    else if (i > 0 && page - previous > 2) items.push({ kind: "gap", key: `gap-${previous}` });
    items.push({ kind: "page", page });
  });
  return items;
}

/**
 * A list URL with the given params, dropping empty values and defaults (so the canonical URL of the first page of an
 * unfiltered list is the bare path). `defaults` maps a param to the value that means "not set".
 */
export function listHref(
  path: string,
  params: Record<string, string | number | null | undefined>,
  defaults: Record<string, string> = {},
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    const text = String(value);
    if (text === "" || text === defaults[key]) continue;
    if (key === "page" && text === "1") continue;
    search.set(key, text);
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
