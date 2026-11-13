import { describe, expect, it } from "vitest";
import { filtersToQuery, rangeBounds } from "@/lib/reports/filters";
import { directionOf, monthToDate, pointsChange, previousMonth, rangeFilters } from "./periods";

describe("monthToDate", () => {
  it("runs from the 1st of the month to today", () => {
    expect(monthToDate("2026-10-29")).toEqual({ from: "2026-10-01", to: "2026-10-29" });
  });

  it("is the single day on the 1st", () => {
    expect(monthToDate("2026-11-01")).toEqual({ from: "2026-11-01", to: "2026-11-01" });
  });
});

describe("previousMonth", () => {
  it("is the whole month before, with its real last day", () => {
    expect(previousMonth("2026-10-29")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousMonth("2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousMonth("2028-03-01")).toEqual({ from: "2028-02-01", to: "2028-02-29" }); // leap year
  });

  it("goes back across the year in January", () => {
    expect(previousMonth("2027-01-10")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("rangeFilters", () => {
  it("covers every protocol and department, and links to /reports keep the range", () => {
    const filters = rangeFilters({ from: "2026-10-01", to: "2026-10-29" });
    expect(filters).toMatchObject({ protocolId: null, teamId: null, customRange: true, customGranularity: false });
    expect(filtersToQuery(filters)).toEqual({ from: "2026-10-01", to: "2026-10-29" });
  });

  it("this month and last month do not overlap and leave no gap (Riyadh midnight)", () => {
    const current = rangeBounds(rangeFilters(monthToDate("2026-10-29")));
    const previous = rangeBounds(rangeFilters(previousMonth("2026-10-29")));
    expect(previous.end.toISOString()).toBe(current.start.toISOString());
    expect(current.start.toISOString()).toBe("2026-09-30T21:00:00.000Z");
  });
});

describe("pointsChange", () => {
  it("is the difference in whole points", () => {
    expect(pointsChange(78, 70)).toBe(8);
    expect(pointsChange(60, 75)).toBe(-15);
    expect(pointsChange(80, 80)).toBe(0);
  });

  it("is null without both scores", () => {
    expect(pointsChange(null, 70)).toBeNull();
    expect(pointsChange(70, null)).toBeNull();
  });

  it("has a direction", () => {
    expect(directionOf(3)).toBe("up");
    expect(directionOf(-1)).toBe("down");
    expect(directionOf(0)).toBe("same");
  });
});
