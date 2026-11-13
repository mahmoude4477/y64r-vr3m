import { describe, expect, it } from "vitest";
import { trendChart } from "./trend-chart";

const base = { min: 40, max: 100, ticks: [100, 80, 60, 40] } as const;
const values = [64, 69, 72, 74, 76, 82];

describe("trendChart", () => {
  it("runs left to right in English, oldest point first", () => {
    const c = trendChart(values, { ...base, dir: "ltr" });
    const xs = c.points.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[0]).toBe(30); // pad 8 + inset 22
    expect(xs[xs.length - 1]).toBe(440); // 470 - pad 8 - inset 22
  });

  it("is mirrored in Arabic: right to left, newest point on the left", () => {
    const ltr = trendChart(values, { ...base, dir: "ltr" });
    const rtl = trendChart(values, { ...base, dir: "rtl" });
    rtl.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(ltr.width - ltr.points[i].x, 5);
      expect(p.y).toBe(ltr.points[i].y);
    });
    expect(rtl.points[0].x).toBeGreaterThan(rtl.points[1].x);
  });

  it("keeps no gutter for axis labels: the grid spans the chart symmetrically in both directions", () => {
    // The phone in the illustration covers the reading-start side; tick labels there were never visible and a
    // glyph of "100" showed at the phone's rounded corner (landing review r1). The chart has no axis labels now.
    for (const dir of ["ltr", "rtl"] as const) {
      const c = trendChart(values, { ...base, dir });
      expect(c.gridFrom).toBe(8);
      expect(c.gridTo).toBe(c.width - 8);
      expect(c).not.toHaveProperty("tickLabelX");
    }
  });

  it("keeps a larger inset on the reading-start side when asked (the side the phone covers)", () => {
    const ltr = trendChart(values, { ...base, dir: "ltr", insetStart: 62 });
    expect(ltr.points[0].x).toBe(70); // pad 8 + start inset 62, on the left
    expect(ltr.points[ltr.points.length - 1].x).toBe(440); // end inset stays 22
    const rtl = trendChart(values, { ...base, dir: "rtl", insetStart: 62 });
    expect(rtl.points[0].x).toBe(400); // 470 - 8 - 62, on the right
    expect(rtl.points[rtl.points.length - 1].x).toBe(30);
    rtl.points.forEach((p, i) => expect(p.x).toBeCloseTo(470 - ltr.points[i].x, 5));
  });

  it("maps the value range onto the plot height and clamps outliers", () => {
    const c = trendChart(values, { ...base, dir: "ltr" });
    expect(c.y(100)).toBe(8);
    expect(c.y(40)).toBe(c.baselineY);
    expect(c.y(70)).toBeCloseTo((8 + c.baselineY) / 2, 0);
    expect(c.y(130)).toBe(c.y(100));
    expect(c.y(-5)).toBe(c.y(40));
    expect(c.ticks.map((t) => t.value)).toEqual([100, 80, 60, 40]);
    expect(c.ticks[0].y).toBeLessThan(c.ticks[1].y);
  });

  it("builds the polyline and closes the area on the baseline", () => {
    const c = trendChart([50, 100], { ...base, dir: "ltr" });
    expect(c.line).toBe(`30,${c.y(50)} 440,8`);
    expect(c.area).toBe(`${c.line} 440,${c.baselineY} 30,${c.baselineY}`);
    expect(c.labelY).toBeGreaterThan(c.baselineY);
    expect(c.labelY).toBeLessThan(c.height);
  });

  it("handles one value and no values", () => {
    const one = trendChart([80], { ...base, dir: "ltr" });
    expect(one.points).toEqual([{ x: 30, y: one.y(80) }]);
    const empty = trendChart([], { ...base, dir: "rtl" });
    expect(empty.points).toEqual([]);
    expect(empty.line).toBe("");
    expect(empty.area).toBe("");
  });

  it("rejects an empty value range", () => {
    expect(() => trendChart(values, { ...base, min: 50, max: 50, dir: "ltr" })).toThrow();
  });
});
