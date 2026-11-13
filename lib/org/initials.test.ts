import { describe, expect, it } from "vitest";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it("takes the first letters of the first two words", () => {
    expect(initialsOf("King Fahd Hospital")).toBe("KF");
    expect(initialsOf("  nursing   college ")).toBe("NC");
    expect(initialsOf("Waqaya")).toBe("W");
  });

  it("keeps Arabic initials as separate letters and skips the article", () => {
    expect(initialsOf("مستشفى الملك فهد")).toBe("م‌م");
    expect(initialsOf("جامعة الجوف")).toBe("ج‌ج");
    expect(initialsOf("الجامعة")).toBe("ج");
    expect(initialsOf("ال")).toBe("ا"); // too short to be an article
  });

  it("skips symbols and handles empty names", () => {
    expect(initialsOf("& Co - Lab")).toBe("CL");
    expect(initialsOf("3D Lab")).toBe("3L");
    expect(initialsOf("")).toBe("");
    expect(initialsOf(null)).toBe("");
    expect(initialsOf("— —")).toBe("");
  });
});
