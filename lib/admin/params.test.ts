import { describe, expect, it } from "vitest";
import { dayRange, first, listHref, pageCount, pageOffset, pageWindow, parseChoice, parseDay, parseId, parsePage, parseQuery, PAGE_SIZE } from "./params";

describe("search params", () => {
  it("takes the first value of a repeated param", () => {
    expect(first(["a", "b"])).toBe("a");
    expect(first("x")).toBe("x");
    expect(first(undefined)).toBeUndefined();
  });

  it("parses a page number and falls back to 1 for anything odd", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(["7", "2"])).toBe(7);
    for (const bad of [undefined, "", "0", "-2", "1.5", "abc", "1e3", " 2", "9999999"]) expect(parsePage(bad)).toBe(1);
    expect(parsePage("999999")).toBe(10_000);
  });

  it("cleans the search text", () => {
    expect(parseQuery("  huda   al  ")).toBe("huda al");
    expect(parseQuery("a\u0000b\u001fc")).toBe("a b c");
    expect(parseQuery("x".repeat(500))).toHaveLength(100);
    expect(parseQuery(undefined)).toBe("");
  });

  it("accepts only known choices", () => {
    const roles = ["all", "admin", "user"] as const;
    expect(parseChoice("admin", roles, "all")).toBe("admin");
    expect(parseChoice("root", roles, "all")).toBe("all");
    expect(parseChoice(undefined, roles, "all")).toBe("all");
  });
});

describe("pagination", () => {
  it("counts pages (at least one)", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(PAGE_SIZE)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
  });

  it("clamps a page past the end to the last page", () => {
    expect(pageOffset(1, 100)).toEqual({ page: 1, skip: 0 });
    expect(pageOffset(3, 100)).toEqual({ page: 3, skip: 40 });
    expect(pageOffset(50, 45)).toEqual({ page: 3, skip: 40 });
    expect(pageOffset(2, 0)).toEqual({ page: 1, skip: 0 });
  });

  it("shows every page of a short list", () => {
    expect(pageWindow(2, 5).map((i) => (i.kind === "page" ? i.page : "…"))).toEqual([1, 2, 3, 4, 5]);
  });

  it("shows first, last and the neighbours of the current page with gaps", () => {
    const show = (current: number, total: number) => pageWindow(current, total).map((i) => (i.kind === "page" ? i.page : "…"));
    expect(show(6, 12)).toEqual([1, "…", 5, 6, 7, "…", 12]);
    expect(show(1, 12)).toEqual([1, 2, 3, 4, "…", 12]);
    expect(show(12, 12)).toEqual([1, "…", 9, 10, 11, 12]);
    expect(show(4, 12)).toEqual([1, 2, 3, 4, 5, "…", 12]);
  });

  it("builds list links without empty values, defaults or page 1", () => {
    expect(listHref("/admin/users", { q: "", role: "all", page: 1 }, { role: "all" })).toBe("/admin/users");
    expect(listHref("/admin/users", { q: "huda", role: "admin", page: 2 }, { role: "all" })).toBe("/admin/users?q=huda&role=admin&page=2");
    expect(listHref("/admin/users", { q: "a&b=c", status: null })).toBe("/admin/users?q=a%26b%3Dc");
  });
});

describe("ids and day ranges", () => {
  it("accepts row ids only", () => {
    expect(parseId("clx0abc_DEF-12")).toBe("clx0abc_DEF-12");
    expect(parseId(["a1", "b2"])).toBe("a1");
    for (const bad of [undefined, "", "a b", "a/b", "x".repeat(129), "' OR 1=1", "a.b"]) expect(parseId(bad)).toBe("");
  });

  it("accepts real calendar days only", () => {
    expect(parseDay("2026-10-29")).toBe("2026-10-29");
    expect(parseDay("2024-02-29")).toBe("2024-02-29");
    for (const bad of [undefined, "", "2026-02-30", "2025-02-29", "2026-13-01", "26-10-29", "2026-1-5", "1999-12-31", "2026-10-29T00:00"]) {
      expect(parseDay(bad)).toBe("");
    }
  });

  it("turns days into Riyadh-midnight instants, both ends inclusive", () => {
    expect(dayRange("", "")).toBeNull();
    // Riyadh is UTC+3: its 29 October starts at 21:00 UTC on the 28th.
    expect(dayRange("2026-10-29", "")).toEqual({ gte: new Date("2026-10-28T21:00:00Z") });
    expect(dayRange("", "2026-10-29")).toEqual({ lt: new Date("2026-10-29T21:00:00Z") });
    expect(dayRange("2026-10-01", "2026-10-31")).toEqual({ gte: new Date("2026-09-30T21:00:00Z"), lt: new Date("2026-10-31T21:00:00Z") });
    // Month and year ends roll over.
    expect(dayRange("", "2026-12-31")).toEqual({ lt: new Date("2026-12-31T21:00:00Z") });
  });

  it("swaps a reversed range", () => {
    expect(dayRange("2026-10-31", "2026-10-01")).toEqual(dayRange("2026-10-01", "2026-10-31"));
  });
});
