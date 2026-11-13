import { describe, expect, it } from "vitest";
import { contactLink, INSTITUTION_CONTACT, institutionContact } from "./contact";

describe("contactLink", () => {
  it("returns null when no contact is set", () => {
    expect(contactLink(null)).toBeNull();
    expect(contactLink(undefined)).toBeNull();
    expect(contactLink("")).toBeNull();
    expect(contactLink("   ")).toBeNull();
  });

  it("turns an e-mail address into a mailto link", () => {
    expect(contactLink("team@example.org")).toEqual({ href: "mailto:team@example.org", external: false });
    expect(contactLink("  first.last+inst@sub.example.sa ")).toEqual({
      href: "mailto:first.last+inst@sub.example.sa",
      external: false,
    });
  });

  it("keeps an https form link and marks it external", () => {
    expect(contactLink("https://forms.example.org/waqaya")).toEqual({
      href: "https://forms.example.org/waqaya",
      external: true,
    });
  });

  it("rejects anything else, so a typo fails the build", () => {
    for (const bad of [
      "http://example.org/form",
      "javascript:alert(1)",
      "mailto:team@example.org",
      "team@example",
      "Team <team@example.org>",
      "team@example.org?subject=x",
      "https://user:secret@example.org/",
      "not a contact",
    ]) {
      expect(() => contactLink(bad), bad).toThrow(/INSTITUTION_CONTACT/);
    }
  });
});

describe("INSTITUTION_CONTACT", () => {
  it("is valid (or not set yet)", () => {
    expect(() => institutionContact()).not.toThrow();
    if (INSTITUTION_CONTACT === null) expect(institutionContact()).toBeNull();
  });
});
