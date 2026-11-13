import { describe, expect, it } from "vitest";
import { ORGANIZATION_TYPES } from "@/lib/permissions";
import { clipText, hasArabicScript, orgDisplayName, orgSecondaryName, orgTypeOf } from "./display";

const org = { name: "مستشفى الملك فهد", nameEn: "King Fahd Hospital" };

describe("institution names", () => {
  it("English pages show the English name when there is one", () => {
    expect(orgDisplayName(org, "en")).toBe("King Fahd Hospital");
    expect(orgDisplayName(org, "ar")).toBe("مستشفى الملك فهد");
    expect(orgDisplayName({ name: "مستشفى", nameEn: "  " }, "en")).toBe("مستشفى");
    expect(orgDisplayName({ name: "مستشفى", nameEn: null }, "en")).toBe("مستشفى");
  });

  it("the other language is a secondary line", () => {
    expect(orgSecondaryName(org, "ar")).toBe("King Fahd Hospital");
    expect(orgSecondaryName(org, "en")).toBe("مستشفى الملك فهد");
    expect(orgSecondaryName({ name: "مستشفى", nameEn: "" }, "ar")).toBeNull();
    expect(orgSecondaryName({ name: "Same", nameEn: "Same" }, "en")).toBeNull();
  });

  it("types outside the list are null", () => {
    expect(orgTypeOf("hospital", ORGANIZATION_TYPES)).toBe("hospital");
    expect(orgTypeOf("clinic", ORGANIZATION_TYPES)).toBeNull();
    expect(orgTypeOf(null, ORGANIZATION_TYPES)).toBeNull();
  });
});

describe("clipText", () => {
  it("keeps short text and cuts long text to the limit with an ellipsis", () => {
    expect(clipText("قسم الطوارئ", 80)).toBe("قسم الطوارئ");
    expect(clipText("x".repeat(80), 80)).toBe("x".repeat(80));
    const cut = clipText("x".repeat(300_000), 80);
    expect(cut).toHaveLength(80);
    expect(cut.endsWith("…")).toBe(true);
  });

  it("never splits a surrogate pair", () => {
    const cut = clipText("ab😀😀😀", 4); // "ab" + half of the first emoji would be 3 code units
    expect(cut).toBe("ab…");
  });
});

describe("hasArabicScript", () => {
  it("finds Arabic letters in names of either language", () => {
    expect(hasArabicScript("قسم الطوارئ")).toBe(true);
    expect(hasArabicScript("مستشفى King Fahd")).toBe(true);
    expect(hasArabicScript("King Fahd Hospital")).toBe(false);
    expect(hasArabicScript("Huda 123")).toBe(false);
    expect(hasArabicScript("")).toBe(false);
  });
});
