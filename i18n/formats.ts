import type { Formats } from "next-intl";

// Pin digits and calendar: the runtime default for "ar" differs between Node, Chrome and iOS,
// which causes hydration mismatches. Latin digits, Gregorian calendar.
const nu = { numberingSystem: "latn" } as const;

export const formats = {
  dateTime: {
    date: { ...nu, calendar: "gregory", day: "numeric", month: "long", year: "numeric" },
    dateShort: { ...nu, calendar: "gregory", day: "2-digit", month: "2-digit", year: "numeric" },
    dateTime: { ...nu, calendar: "gregory", dateStyle: "medium", timeStyle: "short" },
    time: { ...nu, calendar: "gregory", timeStyle: "short" },
  },
  number: {
    integer: { ...nu, maximumFractionDigits: 0 },
    decimal: { ...nu, maximumFractionDigits: 2 },
    percent: { ...nu, style: "percent", maximumFractionDigits: 0 },
    usd: { ...nu, style: "currency", currency: "USD", maximumFractionDigits: 4 },
  },
} satisfies Formats;

export const TIME_ZONE = "Asia/Riyadh"; // Railway servers run in UTC
