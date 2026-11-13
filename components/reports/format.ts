import type { useFormatter } from "next-intl";
import type { Granularity } from "@/lib/reports/filters";

/**
 * Inline date formats for report labels. i18n/formats.ts pins Latin digits and the Gregorian calendar for its named
 * formats; inline options must pin them too, or Arabic labels would switch digit systems between Node and browsers.
 */
const LATN = { numberingSystem: "latn", calendar: "gregory" } as const;

export const DAY_MONTH = { ...LATN, day: "numeric", month: "short" } as const;
export const MONTH_YEAR = { ...LATN, month: "short", year: "numeric" } as const;
export const MONTH_YEAR_LONG = { ...LATN, month: "long", year: "numeric" } as const;

/** A Riyadh calendar day (YYYY-MM-DD) as a Date at noon Riyadh time, so formatting in that zone never shifts the day. */
export function dayDate(day: string): Date {
  return new Date(`${day}T12:00:00+03:00`);
}

type DateFormatter = Pick<ReturnType<typeof useFormatter>, "dateTime">;

/** Axis label and tooltip label of a trend bucket. */
export function bucketLabels(
  bucket: string,
  granularity: Granularity,
  format: DateFormatter,
  weekOf: (date: string) => string,
): { label: string; tooltipLabel: string } {
  const date = dayDate(bucket);
  if (granularity === "month") {
    return { label: format.dateTime(date, MONTH_YEAR), tooltipLabel: format.dateTime(date, MONTH_YEAR_LONG) };
  }
  return { label: format.dateTime(date, DAY_MONTH), tooltipLabel: weekOf(format.dateTime(date, "date")) };
}
