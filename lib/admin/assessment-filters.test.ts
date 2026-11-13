import { describe, expect, it } from "vitest";
import { assessmentParams, attemptListWhere, isFiltered, parseAssessmentFilters, scanListWhere, type AssessmentFilters } from "./assessment-filters";

const none: Omit<AssessmentFilters, "kind" | "page"> = { q: "", org: "", protocol: "", risk: "all", status: "all", from: "", to: "" };

describe("assessment filters from the URL", () => {
  it("defaults to every scan", () => {
    expect(parseAssessmentFilters({})).toEqual({ kind: "scans", ...none, page: 1 });
  });

  it("keeps known values and drops the rest", () => {
    const f = parseAssessmentFilters({
      kind: "attempts",
      q: "  huda ",
      org: "org_1",
      protocol: "p-1",
      risk: "high",
      status: "completed",
      from: "2026-10-01",
      to: "2026-10-31",
      page: "3",
    });
    expect(f).toEqual({ kind: "attempts", q: "huda", org: "org_1", protocol: "p-1", risk: "high", status: "completed", from: "2026-10-01", to: "2026-10-31", page: 3 });
    expect(parseAssessmentFilters({ kind: "users", risk: "extreme", status: "deleted", org: "a b", from: "yesterday" })).toEqual({
      kind: "scans",
      ...none,
      page: 1,
    });
  });

  it("checks the status against the list it belongs to", () => {
    expect(parseAssessmentFilters({ kind: "scans", status: "completed" }).status).toBe("all");
    expect(parseAssessmentFilters({ kind: "scans", status: "review" }).status).toBe("review");
    expect(parseAssessmentFilters({ kind: "attempts", status: "review" }).status).toBe("all");
  });

  it("offers individual trainees for attempts only, and treats 'all' as no filter", () => {
    expect(parseAssessmentFilters({ kind: "attempts", org: "none" }).org).toBe("none");
    expect(parseAssessmentFilters({ kind: "scans", org: "none" }).org).toBe("");
    expect(parseAssessmentFilters({ org: "all", protocol: "all" })).toMatchObject({ org: "", protocol: "" });
  });

  it("says when anything narrows the list", () => {
    expect(isFiltered(parseAssessmentFilters({ kind: "attempts", page: "2" }))).toBe(false);
    expect(isFiltered(parseAssessmentFilters({ risk: "low" }))).toBe(true);
    expect(isFiltered(parseAssessmentFilters({ to: "2026-10-01" }))).toBe(true);
  });

  it("keeps every filter in its links", () => {
    expect(assessmentParams(parseAssessmentFilters({ kind: "attempts", q: "x", page: "4" }))).toEqual({
      kind: "attempts",
      q: "x",
      org: "",
      protocol: "",
      risk: "all",
      status: "all",
      from: "",
      to: "",
    });
  });
});

describe("scan list where-clause", () => {
  it("is empty without filters", () => {
    expect(scanListWhere(none)).toEqual({});
  });

  it("searches the area and the examiner", () => {
    expect(scanListWhere({ ...none, q: "sink" })).toEqual({
      AND: [
        {
          OR: [
            { areaLabel: { contains: "sink", mode: "insensitive" } },
            { examiner: { name: { contains: "sink", mode: "insensitive" } } },
            { examiner: { email: { contains: "sink", mode: "insensitive" } } },
          ],
        },
      ],
    });
  });

  it("filters institution, protocol, risk, status and days", () => {
    expect(scanListWhere({ ...none, org: "o1", protocol: "p1", risk: "medium", status: "finalized", from: "2026-10-29", to: "2026-10-29" })).toEqual({
      AND: [
        { organizationId: "o1" },
        { protocolId: "p1" },
        { riskLevel: "medium" },
        { status: "finalized" },
        { createdAt: { gte: new Date("2026-10-28T21:00:00Z"), lt: new Date("2026-10-29T21:00:00Z") } },
      ],
    });
  });

  it("means finalised without a risk level by 'not assessable'", () => {
    expect(scanListWhere({ ...none, risk: "not_assessable" })).toEqual({ AND: [{ status: "finalized", riskLevel: null }] });
  });
});

describe("attempt list where-clause", () => {
  it("searches the trainee and the scenario in both languages", () => {
    const where = attemptListWhere({ ...none, q: "dam" });
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { user: { name: { contains: "dam", mode: "insensitive" } } },
            { user: { email: { contains: "dam", mode: "insensitive" } } },
            { scenario: { titleAr: { contains: "dam", mode: "insensitive" } } },
            { scenario: { titleEn: { contains: "dam", mode: "insensitive" } } },
          ],
        },
      ],
    });
  });

  it("filters individual trainees, the protocol through the scenario, and the start day", () => {
    expect(attemptListWhere({ ...none, org: "none", protocol: "p1", risk: "not_assessable", status: "completed", from: "2026-10-01" })).toEqual({
      AND: [
        { organizationId: null },
        { scenario: { protocolId: "p1" } },
        { status: "completed", riskLevel: null },
        { status: "completed" },
        { startedAt: { gte: new Date("2026-09-30T21:00:00Z") } },
      ],
    });
    expect(attemptListWhere({ ...none, org: "o1", risk: "high" })).toEqual({ AND: [{ organizationId: "o1" }, { riskLevel: "high" }] });
  });
});
