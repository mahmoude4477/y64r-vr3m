import { describe, expect, it } from "vitest";
import { departmentRisk, SAMPLE_DEPARTMENTS, SAMPLE_TREND, SAMPLE_TREND_MONTHS, trendSummary } from "./sample";

describe("landing illustration values", () => {
  it("one month name per trend point, valid months", () => {
    expect(SAMPLE_TREND_MONTHS).toHaveLength(SAMPLE_TREND.length);
    for (const m of SAMPLE_TREND_MONTHS) expect(m).toBeGreaterThanOrEqual(1);
    for (const m of SAMPLE_TREND_MONTHS) expect(m).toBeLessThanOrEqual(12);
  });

  it("scores stay within 0..100", () => {
    for (const v of [...SAMPLE_TREND, ...SAMPLE_DEPARTMENTS.map((d) => d.score)]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("trendSummary", () => {
  it("takes the last value and its change from the month before", () => {
    expect(trendSummary([64, 76, 82])).toEqual({ latest: 82, change: 6 });
    expect(trendSummary([90, 85])).toEqual({ latest: 85, change: -5 });
    expect(trendSummary([70])).toEqual({ latest: 70, change: 0 });
    expect(trendSummary([])).toEqual({ latest: 0, change: 0 });
  });
});

describe("departmentRisk", () => {
  it("uses the app's risk bands", () => {
    expect(departmentRisk(86)).toBe("low");
    expect(departmentRisk(80)).toBe("low");
    expect(departmentRisk(79)).toBe("medium");
    expect(departmentRisk(50)).toBe("medium");
    expect(departmentRisk(49)).toBe("high");
  });
});
