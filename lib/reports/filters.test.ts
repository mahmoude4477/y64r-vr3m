import { describe, expect, it } from "vitest";
import {
  addDays,
  bucketOf,
  bucketStarts,
  DEFAULT_RANGE_DAYS,
  filtersToQuery,
  isIsoDate,
  MAX_RANGE_DAYS,
  MAX_WEEK_BUCKETS,
  parseReportFilters,
  queryString,
  rangeBounds,
  rangeDays,
  reportViewQuery,
  todayInRiyadh,
} from "./filters";

const TODAY = "2026-10-29"; // a Thursday

describe("dates", () => {
  it("accepts only real calendar days", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26-01-01")).toBe(false);
    expect(isIsoDate("2026-1-1")).toBe(false);
    expect(isIsoDate("1999-12-31")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it("knows today in Riyadh (UTC+3): 22:00 UTC is already the next day there", () => {
    expect(todayInRiyadh(new Date("2026-10-28T20:59:59Z"))).toBe("2026-10-28");
    expect(todayInRiyadh(new Date("2026-10-28T21:00:00Z"))).toBe("2026-10-29");
  });

  it("adds days across months and years and counts inclusive ranges", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(rangeDays("2026-10-29", "2026-10-29")).toBe(1);
    expect(rangeDays("2026-08-01", "2026-10-29")).toBe(90);
  });

  it("turns a Riyadh day range into UTC instants [start, end)", () => {
    const { start, end } = rangeBounds({ from: "2026-10-01", to: "2026-10-29" });
    expect(start.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-29T21:00:00.000Z");
  });
});

describe("parseReportFilters", () => {
  it("defaults to the last 90 days ending today, weekly, no protocol or department", () => {
    const f = parseReportFilters({}, TODAY);
    expect(f).toEqual({
      from: addDays(TODAY, -(DEFAULT_RANGE_DAYS - 1)),
      to: TODAY,
      protocolId: null,
      teamId: null,
      granularity: "week",
      customRange: false,
      customGranularity: false,
    });
    expect(rangeDays(f.from, f.to)).toBe(DEFAULT_RANGE_DAYS);
  });

  it("reads a custom range, ids and the period; arrays use their first value", () => {
    const f = parseReportFilters(
      { from: "2026-01-01", to: ["2026-06-30", "2026-07-01"], protocol: "cm1abc_9-x", department: "team123", period: "week" },
      TODAY,
    );
    expect(f).toMatchObject({ from: "2026-01-01", to: "2026-06-30", protocolId: "cm1abc_9-x", teamId: "team123", granularity: "week" });
    expect(f.customRange).toBe(true);
    expect(f.customGranularity).toBe(true);
  });

  it("falls back on invalid values and never trusts odd ids", () => {
    const f = parseReportFilters({ from: "yesterday", to: "2026-02-30", protocol: "x' OR 1=1 --", department: "a".repeat(65), period: "day" }, TODAY);
    expect(f.to).toBe(TODAY);
    expect(f.from).toBe(addDays(TODAY, -(DEFAULT_RANGE_DAYS - 1)));
    expect(f.protocolId).toBeNull();
    expect(f.teamId).toBeNull();
    expect(f.customRange).toBe(false);
    expect(f.customGranularity).toBe(false);
  });

  it("swaps a reversed range, caps the future at today and very long ranges at the maximum", () => {
    expect(parseReportFilters({ from: "2026-10-10", to: "2026-09-01" }, TODAY)).toMatchObject({ from: "2026-09-01", to: "2026-10-10" });
    expect(parseReportFilters({ from: "2026-10-01", to: "2027-01-01" }, TODAY).to).toBe(TODAY);
    const long = parseReportFilters({ from: "2001-01-01", to: TODAY }, TODAY);
    expect(rangeDays(long.from, long.to)).toBe(MAX_RANGE_DAYS);
  });

  it("never ends in the future, whichever end of the URL is in the future", () => {
    // A future `from` alone: capped to today before the swap (it used to become a future `to`).
    expect(parseReportFilters({ from: "2026-11-15" }, TODAY)).toMatchObject({ from: TODAY, to: TODAY });
    expect(parseReportFilters({ from: "2099-01-01" }, TODAY)).toMatchObject({ from: TODAY, to: TODAY });
    expect(parseReportFilters({ from: "2026-12-01", to: "2026-12-31" }, TODAY)).toMatchObject({ from: TODAY, to: TODAY });
    // A future `from` with a past `to`: the range runs from that day to today.
    expect(parseReportFilters({ from: "2026-12-01", to: "2026-10-01" }, TODAY)).toMatchObject({ from: "2026-10-01", to: TODAY });
    for (const query of [{ from: "2026-11-15" }, { from: "2099-01-01", to: "2001-01-01" }, { to: "2030-01-01" }]) {
      const f = parseReportFilters(query, TODAY);
      expect(f.to <= TODAY && f.from <= f.to).toBe(true);
    }
  });

  it("is weekly up to 120 days and monthly beyond, and a weekly request that is too long becomes monthly", () => {
    expect(parseReportFilters({ from: addDays(TODAY, -119), to: TODAY }, TODAY).granularity).toBe("week");
    expect(parseReportFilters({ from: addDays(TODAY, -120), to: TODAY }, TODAY).granularity).toBe("month");
    expect(parseReportFilters({ from: addDays(TODAY, -364), to: TODAY, period: "week" }, TODAY).granularity).toBe("week");
    const tooLong = parseReportFilters({ from: addDays(TODAY, -(7 * MAX_WEEK_BUCKETS + 14)), to: TODAY, period: "week" }, TODAY);
    expect(tooLong.granularity).toBe("month");
    expect(parseReportFilters({ period: "month" }, TODAY).granularity).toBe("month");
  });
});

describe("links", () => {
  it("keeps only what the URL said: the rolling default range and the automatic period stay out", () => {
    expect(filtersToQuery(parseReportFilters({}, TODAY))).toEqual({});
    expect(filtersToQuery(parseReportFilters({ protocol: "p1", department: "t1" }, TODAY))).toEqual({ protocol: "p1", department: "t1" });
    expect(filtersToQuery(parseReportFilters({ from: "2026-09-01", period: "month" }, TODAY))).toEqual({
      from: "2026-09-01",
      to: TODAY,
      period: "month",
    });
  });

  it("builds a stable query string without empty values", () => {
    expect(queryString({})).toBe("");
    expect(queryString({ to: "2026-10-29", from: "2026-10-01", page: null, kind: "" })).toBe("?from=2026-10-01&to=2026-10-29");
    expect(queryString({ a: 2, b: "x y&z" })).toBe("?a=2&b=x+y%26z");
  });

  it("keeps the report filters when switching between the institution report and my results, both ways", () => {
    const filters = filtersToQuery(parseReportFilters({ from: "2026-10-01", to: "2026-10-28", department: "t1" }, TODAY));
    const personal = queryString(reportViewQuery("personal", filters));
    expect(personal).toBe("?department=t1&from=2026-10-01&to=2026-10-28&view=personal");
    // Back from my results: the same filters, no view (the institution report is the default).
    const back = filtersToQuery(parseReportFilters(Object.fromEntries(new URLSearchParams(personal)), TODAY));
    expect(queryString(reportViewQuery("institution", back))).toBe("?department=t1&from=2026-10-01&to=2026-10-28");
    // No filters: the bare links.
    expect(queryString(reportViewQuery("institution", {}))).toBe("");
    expect(queryString(reportViewQuery("personal", {}))).toBe("?view=personal");
  });
});

describe("buckets", () => {
  it("starts weeks on Sunday and months on the 1st", () => {
    expect(bucketOf("2026-10-29", "week")).toBe("2026-10-25"); // Thursday -> Sunday
    expect(bucketOf("2026-10-25", "week")).toBe("2026-10-25"); // Sunday itself
    expect(bucketOf("2026-10-31", "week")).toBe("2026-10-25"); // Saturday ends the week
    expect(bucketOf("2026-11-01", "week")).toBe("2026-11-01");
    expect(bucketOf("2026-10-29", "month")).toBe("2026-10-01");
  });

  it("lists every bucket of the range, empty ones included", () => {
    expect(bucketStarts("2026-10-01", "2026-10-29", "week")).toEqual(["2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"]);
    expect(bucketStarts("2025-11-15", "2026-02-02", "month")).toEqual(["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
    expect(bucketStarts(TODAY, TODAY, "week")).toEqual(["2026-10-25"]);
  });
});
