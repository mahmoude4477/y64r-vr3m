import { describe, expect, it } from "vitest";
import { safeReferenceUrl, summarizeSteps, textLang } from "./steps";

describe("summarizeSteps", () => {
  it("counts mandatory, critical and photo-checkable steps", () => {
    expect(
      summarizeSteps([
        { isMandatory: true, isCritical: true, visualCheck: false },
        { isMandatory: true, isCritical: false, visualCheck: true },
        { isMandatory: false, isCritical: false, visualCheck: true },
      ]),
    ).toEqual({ total: 3, mandatory: 2, critical: 1, visual: 2 });
    expect(summarizeSteps([])).toEqual({ total: 0, mandatory: 0, critical: 0, visual: 0 });
  });
});

describe("safeReferenceUrl", () => {
  it("keeps absolute https links", () => {
    expect(safeReferenceUrl("https://www.who.int/publications/i/item/9789241597906")).toBe(
      "https://www.who.int/publications/i/item/9789241597906",
    );
    expect(safeReferenceUrl(" https://www.osha.gov/x#1910.1030(f) ")).toBe("https://www.osha.gov/x#1910.1030(f)");
  });

  it("refuses anything else", () => {
    for (const url of [
      null,
      undefined,
      "",
      "http://example.com",
      "javascript:alert(1)",
      "data:text/html,hi",
      "//evil.example/x",
      "/protocols",
      "https://user:pass@example.com/",
      "not a url",
    ]) {
      expect(safeReferenceUrl(url)).toBeNull();
    }
  });
});

describe("textLang", () => {
  it("detects Latin-only and Arabic-only labels", () => {
    expect(textLang("WHO Guidelines on Hand Hygiene in Health Care (2009)")).toBe("en");
    expect(textLang("دليل منظمة الصحة العالمية")).toBe("ar");
  });

  it("leaves mixed or letterless text to the page language", () => {
    expect(textLang("دليل WHO")).toBeUndefined();
    expect(textLang("29 CFR 1910.1030")).toBe("en");
    expect(textLang("2009")).toBeUndefined();
  });
});
