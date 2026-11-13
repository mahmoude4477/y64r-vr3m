import { describe, expect, it } from "vitest";
import {
  addAgg,
  aggOf,
  averageScore,
  buildTrend,
  mergeGaps,
  num,
  pageInfo,
  riskPercents,
  riskTotal,
  topStepsByUser,
} from "./aggregate";

describe("scores", () => {
  it("averages only scored results and rounds to a whole number", () => {
    expect(averageScore({ scored: 0, sum: 0 })).toBeNull();
    expect(averageScore({ scored: 3, sum: 200 })).toBe(67);
    expect(averageScore({ scored: 2, sum: 199 })).toBe(100); // 99.5 rounds up
    expect(averageScore({ scored: 1, sum: 250 })).toBe(100); // never above 100
  });

  it("combines scans and attempts by result, not by average of averages", () => {
    const scans = { n: 1, scored: 1, sum: 40 };
    const attempts = { n: 3, scored: 3, sum: 300 };
    expect(averageScore(addAgg(scans, attempts))).toBe(85); // (40 + 300) / 4, not (40 + 100) / 2
  });

  it("reads SQL numbers of any shape", () => {
    expect(num(3)).toBe(3);
    expect(num(BigInt(7))).toBe(7);
    expect(num("12.5")).toBe(12.5);
    expect(num(null)).toBe(0);
    expect(num("x")).toBe(0);
    expect(aggOf({ n: BigInt(2), scored: "1", sum: 80 })).toEqual({ n: 2, scored: 1, sum: 80 });
  });
});

describe("riskPercents", () => {
  it("adds up to exactly 100 (largest remainder)", () => {
    const p = riskPercents({ low: 1, medium: 1, high: 1, notAssessable: 0 });
    expect(p.low + p.medium + p.high + p.notAssessable).toBe(100);
    expect(p).toEqual({ low: 34, medium: 33, high: 33, notAssessable: 0 });
    expect(riskPercents({ low: 0, medium: 0, high: 0, notAssessable: 0 })).toEqual({ low: 0, medium: 0, high: 0, notAssessable: 0 });
    expect(riskPercents({ low: 2, medium: 0, high: 0, notAssessable: 0 })).toEqual({ low: 100, medium: 0, high: 0, notAssessable: 0 });
  });

  it("never gives a share to an empty level", () => {
    const p = riskPercents({ low: 199, medium: 0, high: 1, notAssessable: 0 });
    expect(p.medium).toBe(0);
    expect(p.low + p.high).toBe(100);
    expect(riskTotal({ low: 1, medium: 2, high: 3, notAssessable: 4 })).toBe(10);
  });
});

describe("buildTrend", () => {
  it("fills every bucket, keeps sources apart and combines them", () => {
    const points = buildTrend(
      ["2026-10-04", "2026-10-11", "2026-10-18"],
      [{ bucket: "2026-10-04", n: 2, scored: 2, sum: 150 }],
      [
        { bucket: "2026-10-04", n: 1, scored: 1, sum: 90 },
        { bucket: "2026-10-18", n: 2, scored: 1, sum: 40 }, // one attempt was not assessable
      ],
    );
    expect(points).toEqual([
      { bucket: "2026-10-04", scans: 75, simulations: 90, combined: 80, scanCount: 2, simulationCount: 1 },
      { bucket: "2026-10-11", scans: null, simulations: null, combined: null, scanCount: 0, simulationCount: 0 },
      { bucket: "2026-10-18", scans: null, simulations: 40, combined: 40, scanCount: 0, simulationCount: 2 },
    ]);
  });
});

describe("mergeGaps", () => {
  it("merges scan and simulation violations per step, most violated first, and drops clean steps", () => {
    const gaps = mergeGaps(
      [
        { stepId: "a", violated: 2, assessed: 10 },
        { stepId: "b", violated: 0, assessed: 5 },
        { stepId: "c", violated: 3, assessed: 3 },
      ],
      [
        { stepId: "a", violated: 2, assessed: 2, critical: 1 },
        { stepId: "d", violated: 3, assessed: 6, critical: 0 },
      ],
      10,
    );
    expect(gaps.map((g) => g.stepId)).toEqual(["a", "c", "d"]); // c and d tie on 3: c has the higher rate
    expect(gaps[0]).toEqual({
      stepId: "a",
      violated: 4,
      assessed: 12,
      scanViolations: 2,
      simulationViolations: 2,
      criticalChoices: 1,
      rate: 4 / 12,
    });
    expect(mergeGaps([{ stepId: "a", violated: 1, assessed: 1 }], [], 0)).toEqual([]);
  });
});

describe("topStepsByUser", () => {
  it("keeps each user's most missed steps", () => {
    const top = topStepsByUser(
      [
        { userId: "u1", stepId: "s1", violated: 1 },
        { userId: "u1", stepId: "s2", violated: 4 },
        { userId: "u1", stepId: "s3", violated: 2 },
        { userId: "u2", stepId: "s1", violated: 0 },
      ],
      2,
    );
    expect(top.get("u1")).toEqual(["s2", "s3"]);
    expect(top.has("u2")).toBe(false);
  });
});

describe("pageInfo", () => {
  it("clamps the page to what exists", () => {
    expect(pageInfo(undefined, 45, 20)).toEqual({ page: 1, pageSize: 20, total: 45, pageCount: 3, offset: 0 });
    expect(pageInfo("3", 45, 20)).toMatchObject({ page: 3, offset: 40 });
    expect(pageInfo("99", 45, 20)).toMatchObject({ page: 3 });
    expect(pageInfo("0", 45, 20)).toMatchObject({ page: 1 });
    expect(pageInfo("-2", 45, 20)).toMatchObject({ page: 1 });
    expect(pageInfo("2abc", 45, 20)).toMatchObject({ page: 1 });
    expect(pageInfo("2", 0, 20)).toEqual({ page: 1, pageSize: 20, total: 0, pageCount: 1, offset: 0 });
  });
});
