/**
 * Report filters (institution reports, CSV export, print view). Pure and client-safe: the filter bar builds its
 * URLs with the same rules the server parses them with. Filters live in the URL (searchParams):
 *
 *   ?from=2026-08-01&to=2026-10-29&protocol=<protocolId>&department=<teamId>&period=week
 *
 * Dates are calendar days in Saudi time (Asia/Riyadh, UTC+3 all year, no daylight saving), inclusive on both ends.
 * Without from/to the report shows the last DEFAULT_RANGE_DAYS days ending today, so a bare /reports link always
 * means "recent". Weeks start on Sunday (the Saudi working week).
 */
import { TIME_ZONE } from "@/i18n/formats";

export type Granularity = "week" | "month";

export type ReportFilters = {
  /** First day, YYYY-MM-DD (Riyadh), inclusive. */
  from: string;
  /** Last day, YYYY-MM-DD (Riyadh), inclusive. */
  to: string;
  protocolId: string | null;
  /** Department = Better Auth team. */
  teamId: string | null;
  granularity: Granularity;
  /** from/to came from the URL (not the rolling default): links keep them. */
  customRange: boolean;
  /** period came from the URL. */
  customGranularity: boolean;
};

export const REPORT_TIME_ZONE = TIME_ZONE;
/** Saudi Arabia has used UTC+3 all year since 1980. */
const RIYADH_OFFSET = "+03:00";

export const DEFAULT_RANGE_DAYS = 90;
/** Quick ranges offered by the filter bar (days ending today). */
export const RANGE_PRESETS = [30, 90, 365] as const;
/** Longest range a report covers (about five years). */
export const MAX_RANGE_DAYS = 1830;
/** Up to this many days the trend is weekly by default, monthly beyond. */
export const AUTO_WEEK_MAX_DAYS = 120;
/** A weekly trend never has more points than this (about two years); longer ranges switch to months. */
export const MAX_WEEK_BUCKETS = 105;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** cuid (Prisma) and Better Auth ids: letters, digits, "_" and "-". */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A real calendar date in YYYY-MM-DD form (2026-02-30 is not). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2999) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function isReportId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

/** Made once on first use: a formatter with a time zone is costly to build, and riyadhDay() may run per row. */
let riyadhDayFormat: Intl.DateTimeFormat | undefined;

/** Today's date in Riyadh, YYYY-MM-DD. */
export function todayInRiyadh(now: Date = new Date()): string {
  riyadhDayFormat ??= new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = riyadhDayFormat.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = toUtcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtcDate(date);
}

/** Days from `from` to `to`, both included (1 for the same day). */
export function rangeDays(from: string, to: string): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000) + 1;
}

export function autoGranularity(from: string, to: string): Granularity {
  return rangeDays(from, to) <= AUTO_WEEK_MAX_DAYS ? "week" : "month";
}

/** Reads the filters from the URL. Invalid values fall back to the defaults; nothing throws. */
export function parseReportFilters(searchParams: SearchParamsRecord, today: string): ReportFilters {
  const rawFrom = first(searchParams.from);
  const rawTo = first(searchParams.to);
  const hasFrom = isIsoDate(rawFrom);
  const hasTo = isIsoDate(rawTo);

  // Nothing happens in the future: both ends are capped at today BEFORE a reversed range is swapped, so a future
  // `from` can never become a future `to` (the range, the print header and the file name would name days to come, and
  // the "to" date input would hold a value above its own max, which blocks the form).
  const capped = (day: string) => (day > today ? today : day);
  let to = hasTo ? capped(rawTo) : today;
  let from = hasFrom ? capped(rawFrom) : addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  if (from > to) [from, to] = [to, from];
  if (rangeDays(from, to) > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));

  const rawPeriod = first(searchParams.period);
  const customGranularity = rawPeriod === "week" || rawPeriod === "month";
  let granularity: Granularity = customGranularity ? (rawPeriod as Granularity) : autoGranularity(from, to);
  if (granularity === "week" && bucketStarts(from, to, "week").length > MAX_WEEK_BUCKETS) granularity = "month";

  const protocol = first(searchParams.protocol);
  const department = first(searchParams.department);
  return {
    from,
    to,
    protocolId: isReportId(protocol) ? protocol : null,
    teamId: isReportId(department) ? department : null,
    granularity,
    customRange: hasFrom || hasTo,
    customGranularity,
  };
}

/**
 * The filters as URL query values (for links that keep the current report: print, CSV, pages, view switch).
 * The rolling default range and the automatic period are left out, so a shared link stays "recent".
 */
export function filtersToQuery(filters: ReportFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.customRange) {
    query.from = filters.from;
    query.to = filters.to;
  }
  if (filters.protocolId) query.protocol = filters.protocolId;
  if (filters.teamId) query.department = filters.teamId;
  if (filters.customGranularity) query.period = filters.granularity;
  return query;
}

/** `?a=1&b=2` (or "" when empty), keys in a stable order. */
export function queryString(query: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(query).sort()) {
    const value = query[key];
    if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export type ReportView = "institution" | "personal";

/**
 * Query of a /reports view that keeps the report filters (`filterQuery` = filtersToQuery(...)): "my results" ignores
 * them but carries them, so switching to it and back (and paging through it) returns to the same institution report.
 * Page numbers are not part of it: each view has its own.
 */
export function reportViewQuery(view: ReportView, filterQuery: Record<string, string>): Record<string, string> {
  return view === "personal" ? { ...filterQuery, view } : { ...filterQuery };
}

/** UTC instants of the range: [start, end) with start = `from` 00:00 Riyadh and end = the day after `to`, 00:00. */
export function rangeBounds(filters: Pick<ReportFilters, "from" | "to">): { start: Date; end: Date } {
  return {
    start: new Date(`${filters.from}T00:00:00.000${RIYADH_OFFSET}`),
    end: new Date(`${addDays(filters.to, 1)}T00:00:00.000${RIYADH_OFFSET}`),
  };
}

/** The bucket (YYYY-MM-DD of its first day) a Riyadh calendar day belongs to: the Sunday of its week, or the 1st. */
export function bucketOf(day: string, granularity: Granularity): string {
  if (granularity === "month") return `${day.slice(0, 7)}-01`;
  return addDays(day, -toUtcDate(day).getUTCDay()); // getUTCDay: 0 = Sunday
}

/** Every bucket from the one holding `from` to the one holding `to`, oldest first (empty ones included). */
export function bucketStarts(from: string, to: string, granularity: Granularity): string[] {
  const out: string[] = [];
  const last = bucketOf(to, granularity);
  let current = bucketOf(from, granularity);
  // Hard stop well above any allowed range, in case of a bug: never loop forever.
  for (let i = 0; current <= last && i < 5000; i++) {
    out.push(current);
    if (granularity === "week") current = addDays(current, 7);
    else {
      const d = toUtcDate(current);
      d.setUTCMonth(d.getUTCMonth() + 1);
      current = fromUtcDate(d);
    }
  }
  return out;
}

/** Riyadh calendar day of an instant, YYYY-MM-DD. */
export function riyadhDay(instant: Date): string {
  return todayInRiyadh(instant);
}
