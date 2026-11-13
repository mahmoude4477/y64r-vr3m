import { describe, expect, it } from "vitest";
import { adminListQuery, DEFAULT_FILTERS, hasActiveFilters, pageCount, parseAdminListFilters } from "./list-filters";

describe("admin scenario list filters", () => {
  it("reads known values and ignores the rest", () => {
    expect(parseAdminListFilters({})).toEqual(DEFAULT_FILTERS);
    expect(parseAdminListFilters({ q: "  spill ", owner: "global", status: "unpublished", protocol: "abc_123", page: "3" })).toEqual({
      q: "spill",
      owner: "global",
      status: "unpublished",
      protocol: "abc_123",
      page: 3,
    });
    expect(parseAdminListFilters({ owner: "mine", status: "x", protocol: "a b", page: "-1" })).toEqual(DEFAULT_FILTERS);
    // An old link with ?status=draft lists the unpublished scenarios (drafts and played, unpublished versions).
    expect(parseAdminListFilters({ status: "draft" }).status).toBe("unpublished");
    expect(parseAdminListFilters({ q: ["first", "second"], page: "abc" })).toMatchObject({ q: "first", page: 1 });
    expect(parseAdminListFilters({ q: "x".repeat(300) }).q).toHaveLength(100);
  });

  it("writes only the filters that differ from the defaults", () => {
    expect(adminListQuery(DEFAULT_FILTERS)).toBe("");
    expect(adminListQuery({ ...DEFAULT_FILTERS, q: "دم", status: "published", page: 2 })).toBe("?q=%D8%AF%D9%85&status=published&page=2");
    const round = parseAdminListFilters(Object.fromEntries(new URLSearchParams(adminListQuery({ q: "a&b", owner: "institutions", status: "all", protocol: "p1", page: 4 }))));
    expect(round).toEqual({ q: "a&b", owner: "institutions", status: "all", protocol: "p1", page: 4 });
  });

  it("knows when filters are active and how many pages there are", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, page: 5 })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, protocol: "p" })).toBe(true);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(21)).toBe(2);
  });
});
