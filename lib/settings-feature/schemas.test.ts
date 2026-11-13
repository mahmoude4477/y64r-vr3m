import { describe, expect, it } from "vitest";
import { localePreferenceSchema, NAME_MAX, PROFESSION_MAX, profileSchema, sessionIdSchema } from "./schemas";

describe("profileSchema", () => {
  it("trims both fields", () => {
    expect(profileSchema.parse({ name: "  سارة العتيبي ", profession: " ممرضة  " })).toEqual({
      name: "سارة العتيبي",
      profession: "ممرضة",
    });
  });

  it("allows an empty profession", () => {
    expect(profileSchema.safeParse({ name: "Sara", profession: "   " }).success).toBe(true);
  });

  it("needs a name of 2..100 characters", () => {
    expect(profileSchema.safeParse({ name: " ", profession: "" }).success).toBe(false);
    expect(profileSchema.safeParse({ name: "A", profession: "" }).success).toBe(false);
    expect(profileSchema.safeParse({ name: "a".repeat(NAME_MAX), profession: "" }).success).toBe(true);
    expect(profileSchema.safeParse({ name: "a".repeat(NAME_MAX + 1), profession: "" }).success).toBe(false);
  });

  it("limits the profession to 100 characters", () => {
    expect(profileSchema.safeParse({ name: "Sara", profession: "p".repeat(PROFESSION_MAX + 1) }).success).toBe(false);
  });

  it("refuses control characters (the database cannot store U+0000)", () => {
    const result = profileSchema.safeParse({ name: "Sa\u0000ra", profession: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ code: "custom", params: { i18n: "invalidFormat" } });
    expect(profileSchema.safeParse({ name: "Sara", profession: "nurse\nICU" }).success).toBe(false);
  });

  it("refuses anything that is not a string", () => {
    expect(profileSchema.safeParse({ name: 12, profession: "" }).success).toBe(false);
    expect(profileSchema.safeParse(null).success).toBe(false);
  });
});

describe("localePreferenceSchema", () => {
  it("accepts the app's locales only", () => {
    expect(localePreferenceSchema.safeParse({ locale: "ar" }).success).toBe(true);
    expect(localePreferenceSchema.safeParse({ locale: "en" }).success).toBe(true);
    expect(localePreferenceSchema.safeParse({ locale: "fr" }).success).toBe(false);
    expect(localePreferenceSchema.safeParse({ locale: "EN" }).success).toBe(false);
  });
});

describe("sessionIdSchema", () => {
  it("accepts a plausible id only", () => {
    expect(sessionIdSchema.safeParse({ sessionId: "9u2X0pQb1T4yQm3vLx8sZk5rN7cWd6fA" }).success).toBe(true);
    expect(sessionIdSchema.safeParse({ sessionId: "" }).success).toBe(false);
    expect(sessionIdSchema.safeParse({ sessionId: "x".repeat(129) }).success).toBe(false);
  });
});
