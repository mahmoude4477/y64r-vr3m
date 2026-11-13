// Calendar boundaries for the admin overview. A "day" and a "month" are Riyadh calendar periods (Asia/Riyadh,
// UTC+3, no daylight saving time): the same rule lib/ai/limits.ts uses for the daily AI limit, so "AI calls today"
// on the overview matches what the limit counts. Railway servers run in UTC. Pure, unit-tested.

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the Riyadh calendar day that contains `now`, as a UTC instant. */
export function riyadhDayStart(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + RIYADH_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - RIYADH_OFFSET_MS);
}

/** Start of the Riyadh calendar month that contains `now`, as a UTC instant. */
export function riyadhMonthStart(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + RIYADH_OFFSET_MS);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
  return new Date(start - RIYADH_OFFSET_MS);
}

/** `days` days before `now` (a rolling window, e.g. "last 30 days"). */
export function daysAgo(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
