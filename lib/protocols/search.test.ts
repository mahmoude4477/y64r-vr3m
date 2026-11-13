import { describe, expect, it } from "vitest";
import {
  cleanQuery,
  filterLibrary,
  type LibraryEntry,
  libraryHref,
  MAX_QUERY_LENGTH,
  matchRank,
  normalizeForSearch,
  parseLibraryFilters,
  queryTokens,
  searchIndex,
  type SearchableProtocol,
} from "./search";

describe("normalizeForSearch", () => {
  it("folds Arabic letter variants, diacritics and tatweel", () => {
    expect(normalizeForSearch("إدارة")).toBe(normalizeForSearch("اداره"));
    expect(normalizeForSearch("أمان")).toBe("امان");
    expect(normalizeForSearch("آلة")).toBe("اله");
    expect(normalizeForSearch("ٱلنفايات")).toBe("النفايات");
    expect(normalizeForSearch("مُسْتَشْفَى")).toBe("مستشفي");
    expect(normalizeForSearch("نظـــافة")).toBe("نظافه");
    expect(normalizeForSearch("مسؤول")).toBe("مسوول");
    expect(normalizeForSearch("بيئة")).toBe("بييه");
  });

  it("folds Arabic presentation forms (NFKD)", () => {
    expect(normalizeForSearch("ﻻ")).toBe(normalizeForSearch("لا")); // ﻻ ligature
  });

  it("lowercases, drops Latin accents and punctuation, converts Arabic-Indic digits", () => {
    expect(normalizeForSearch("  Hand-Hygiene, Café!  ")).toBe("hand hygiene cafe");
    expect(normalizeForSearch("الخطوة ٣ و۴")).toBe("الخطوه 3 و4");
    expect(normalizeForSearch("WHO (2009)")).toBe("who 2009");
  });

  it("returns an empty string for text with no letters or digits", () => {
    expect(normalizeForSearch(" ،.!؟ ")).toBe("");
  });
});

describe("filters from the URL", () => {
  it("keeps a known category and a cleaned query", () => {
    expect(parseLibraryFilters({ category: "waste", q: "  sharps   bin " })).toEqual({ category: "waste", q: "sharps bin" });
  });

  it("ignores unknown categories, arrays use the first value, missing params are empty", () => {
    expect(parseLibraryFilters({ category: "secret" })).toEqual({ category: null, q: "" });
    expect(parseLibraryFilters({ category: ["hygiene", "waste"], q: ["a", "b"] })).toEqual({ category: "hygiene", q: "a" });
    expect(parseLibraryFilters(undefined)).toEqual({ category: null, q: "" });
  });

  it("caps the query length", () => {
    expect(cleanQuery("x".repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
    expect(cleanQuery(null)).toBe("");
  });

  it("builds stable hrefs without empty values", () => {
    expect(libraryHref({})).toBe("/protocols");
    expect(libraryHref({ category: null, q: "  " })).toBe("/protocols");
    expect(libraryHref({ category: "waste" })).toBe("/protocols?category=waste");
    expect(libraryHref({ category: "hygiene", q: "غسل اليدين" })).toBe(
      `/protocols?category=hygiene&q=${encodeURIComponent("غسل اليدين").replace(/%20/g, "+")}`,
    );
  });
});

const protocol = (over: Partial<SearchableProtocol> = {}): SearchableProtocol => ({
  titleAr: "سلامة الأدوات الحادة",
  titleEn: "Sharps safety",
  summaryAr: "التعامل الآمن مع الإبر",
  summaryEn: "Safe handling of needles",
  descriptionAr: "إصابات الوخز",
  descriptionEn: "Needlestick injuries",
  steps: [{ textAr: "لا تُعِد تغطية الإبرة", textEn: "Never recap a used needle" }],
  ...over,
});

describe("matchRank", () => {
  const index = searchIndex(protocol());
  it("ranks title hits first, then summary, then description and steps", () => {
    expect(matchRank(index, queryTokens("sharps"))).toBe(0);
    expect(matchRank(index, queryTokens("الادوات"))).toBe(0);
    expect(matchRank(index, queryTokens("needles"))).toBe(1);
    expect(matchRank(index, queryTokens("recap"))).toBe(2);
    expect(matchRank(index, queryTokens("تغطيه"))).toBe(2);
  });

  it("needs every word, in any field", () => {
    expect(matchRank(index, queryTokens("sharps recap"))).toBe(2);
    expect(matchRank(index, queryTokens("sharps gloves"))).toBeNull();
  });

  it("matches everything when there is no word", () => {
    expect(matchRank(index, [])).toBe(0);
    expect(matchRank(index, queryTokens("  ؟ "))).toBe(0);
  });
});

describe("filterLibrary", () => {
  const entry = (id: string, category: LibraryEntry<string>["category"], title: string, own = false, extra: Partial<SearchableProtocol> = {}) => ({
    item: id,
    category,
    own,
    title,
    index: searchIndex(protocol({ titleAr: title, titleEn: title, summaryAr: "", summaryEn: "", descriptionAr: "", descriptionEn: "", steps: [], ...extra })),
  });
  const entries = [
    entry("b", "hygiene", "بيئة نظيفة"),
    entry("a", "hygiene", "أدوات"),
    entry("w", "waste", "نفايات", false, { summaryEn: "waste bins and hygiene" }),
    entry("own", "hygiene", "يدين", true),
  ];

  it("sorts the institution's own first, then by localized title", () => {
    const result = filterLibrary(entries, { category: null, q: "" }, "ar");
    expect(result.items).toEqual(["own", "a", "b", "w"]);
    expect(result.total).toBe(4);
    expect(result.searchTotal).toBe(4);
    expect(result.categoryCounts).toEqual({ safety: 0, hygiene: 3, waste: 1, maintenance: 0, other: 0 });
  });

  it("filters by category; counts still cover every category", () => {
    const result = filterLibrary(entries, { category: "waste", q: "" }, "ar");
    expect(result.items).toEqual(["w"]);
    expect(result.categoryCounts.hygiene).toBe(3);
  });

  it("search drives the counts and the order (rank before own)", () => {
    const withHygiene = [...entries, entry("h", "safety", "Hygiene station")];
    const result = filterLibrary(withHygiene, { category: null, q: "hygiene" }, "en");
    expect(result.items).toEqual(["h", "w"]); // title hit (rank 0) before summary hit (rank 1)
    expect(result.searchTotal).toBe(2);
    expect(result.categoryCounts).toEqual({ safety: 1, hygiene: 0, waste: 1, maintenance: 0, other: 0 });
  });

  it("returns nothing (but keeps the total) when nothing matches", () => {
    const result = filterLibrary(entries, { category: "hygiene", q: "xyz" }, "ar");
    expect(result.items).toEqual([]);
    expect(result.total).toBe(4);
    expect(result.searchTotal).toBe(0);
  });
});
