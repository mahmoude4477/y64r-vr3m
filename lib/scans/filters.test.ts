import { describe, expect, it } from "vitest";
import type { Scope } from "@/lib/authz";
import { ANALYSIS_STALE_MS } from "./constants";
import { activeFilterCount, EMPTY_FILTERS, hasAnyFilter, parseScanFilters, scanFiltersQuery } from "./filters";
import { scanListWhere } from "./list-where";

const staff: Scope = { userId: "u1", organizationId: "org1", orgRole: "examiner", isPlatformAdmin: false };
const trainee: Scope = { userId: "u2", organizationId: "org1", orgRole: "trainee", isPlatformAdmin: false };

describe("parseScanFilters", () => {
  it("reads every filter from the URL", () => {
    expect(
      parseScanFilters({ status: "review", protocol: "p1", department: "t_1", risk: "high", mine: "1", q: "  Room 12 ", page: "3" }),
    ).toEqual({ status: "review", protocol: "p1", department: "t_1", risk: "high", mine: true, q: "Room 12", page: 3 });
    expect(parseScanFilters(new URLSearchParams("status=finalized&mine=1"))).toEqual({
      ...EMPTY_FILTERS,
      status: "finalized",
      mine: true,
    });
  });

  it("drops unknown or malformed values instead of passing them on", () => {
    expect(
      parseScanFilters({
        status: "deleted",
        protocol: "p1' OR 1=1",
        department: "a/b",
        risk: "extreme",
        mine: "true",
        q: "   ",
        page: "-2",
      }),
    ).toEqual(EMPTY_FILTERS);
    expect(parseScanFilters({ page: "abc" }).page).toBe(1);
    expect(parseScanFilters({ page: "999999999" }).page).toBe(10_000);
    expect(parseScanFilters({ status: ["review", "draft"] }).status).toBe("review");
    expect(parseScanFilters({ q: "x".repeat(500) }).q).toHaveLength(80);
  });
});

describe("scanFiltersQuery", () => {
  it("omits defaults and round-trips through parseScanFilters", () => {
    expect(scanFiltersQuery(EMPTY_FILTERS)).toBe("");
    const f = { ...EMPTY_FILTERS, status: "review" as const, risk: "low" as const, mine: true, q: "sink", page: 2 };
    const q = scanFiltersQuery(f);
    expect(q).toBe("status=review&risk=low&mine=1&q=sink&page=2");
    expect(parseScanFilters(new URLSearchParams(q))).toEqual(f);
  });

  it("counts the narrowing filters (not search or paging)", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, status: "draft", mine: true, q: "x", page: 4 })).toBe(2);
    expect(hasAnyFilter({ ...EMPTY_FILTERS, q: "x" })).toBe(true);
    expect(hasAnyFilter({ ...EMPTY_FILTERS, page: 3 })).toBe(false);
  });
});

describe("scanListWhere", () => {
  it("always starts from scansReadable and adds each filter", () => {
    const where = scanListWhere(staff, { ...EMPTY_FILTERS, status: "review", protocol: "p1", department: "t1", risk: "high", mine: true, q: "sink" });
    expect(where).toEqual({
      AND: [
        { organizationId: "org1" },
        { status: "review" },
        { protocolId: "p1" },
        { teamId: "t1" },
        { riskLevel: "high" },
        { examinerId: "u1" },
        { areaLabel: { contains: "sink", mode: "insensitive" } },
      ],
    });
  });

  it("filters a crashed analysis (stale 'analyzing') as failed, the way its page shows it", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const cutoff = new Date(now.getTime() - ANALYSIS_STALE_MS);
    expect(scanListWhere(staff, { ...EMPTY_FILTERS, status: "failed" }, now)).toEqual({
      AND: [{ organizationId: "org1" }, { OR: [{ status: "failed" }, { status: "analyzing", updatedAt: { lt: cutoff } }] }],
    });
    expect(scanListWhere(staff, { ...EMPTY_FILTERS, status: "analyzing" }, now)).toEqual({
      AND: [{ organizationId: "org1" }, { status: "analyzing", updatedAt: { gte: cutoff } }],
    });
    expect(scanListWhere(staff, { ...EMPTY_FILTERS, status: "draft" }, now)).toEqual({ AND: [{ organizationId: "org1" }, { status: "draft" }] });
  });

  it("matches nothing for a trainee, whatever the filters say", () => {
    expect(scanListWhere(trainee, EMPTY_FILTERS)).toEqual({ AND: [{ id: { in: [] } }] });
  });
});
