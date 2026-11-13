/**
 * Date ranges of the dashboard's summary cards (pure, unit-tested). Days are Riyadh calendar days (YYYY-MM-DD), the
 * same as the report filters (lib/reports/filters.ts), so a card and the /reports page it links to agree.
 */
import { addDays, type ReportFilters } from "@/lib/reports/filters";

export type DayRange = { from: string; to: string };

/** The calendar month of `today` up to and including today: 2026-10-01 .. 2026-10-29. */
export function monthToDate(today: string): DayRange {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

/** The whole calendar month before the month of `today`: 2026-09-01 .. 2026-09-30 (January -> December). */
export function previousMonth(today: string): DayRange {
  const lastDay = addDays(`${today.slice(0, 7)}-01`, -1);
  return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
}

/**
 * Report filters for a fixed range over every protocol and department. `customRange` is set, so a link built with
 * filtersToQuery() opens /reports on exactly this range; the trend grouping stays automatic.
 */
export function rangeFilters(range: DayRange): ReportFilters {
  return {
    from: range.from,
    to: range.to,
    protocolId: null,
    teamId: null,
    granularity: "week",
    customRange: true,
    customGranularity: false,
  };
}

/** Change in whole points between two scores (null when either is missing). */
export function pointsChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return Math.round(current) - Math.round(previous);
}

export type Direction = "up" | "down" | "same";

export function directionOf(change: number): Direction {
  return change > 0 ? "up" : change < 0 ? "down" : "same";
}
