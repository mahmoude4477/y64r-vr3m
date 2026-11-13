import { describe, expect, it } from "vitest";
import { sparklineGeometry } from "./sparkline";

const box = { width: 100, height: 50, padding: 5 };

describe("sparklineGeometry", () => {
  it("needs at least two scores", () => {
    expect(sparklineGeometry([], box)).toBeNull();
    expect(sparklineGeometry([70], box)).toBeNull();
  });

  it("maps 0..100 to the bottom..top of the inner box, oldest on the left in LTR", () => {
    const g = sparklineGeometry([0, 50, 100], box);
    expect(g?.line).toBe("M5 45 L50 25 L95 5");
    expect(g?.last).toEqual({ x: 95, y: 5 });
    expect(g?.area).toBe("M5 45 L50 25 L95 5 L95 45 L5 45 Z");
  });

  it("runs right to left in RTL, the newest point on the left", () => {
    const g = sparklineGeometry([0, 100], box, { rtl: true });
    expect(g?.line).toBe("M95 45 L5 5");
    expect(g?.last).toEqual({ x: 5, y: 5 });
  });

  it("clamps scores outside 0..100 and treats non-numbers as 0", () => {
    const g = sparklineGeometry([-20, 140, Number.NaN], box);
    expect(g?.line).toBe("M5 45 L50 5 L95 45");
  });
});
