import { describe, expect, it } from "vitest";
import { departmentSchema, inviteSchema, orgProfileSchema, sameDepartmentName } from "./schemas";

describe("orgProfileSchema", () => {
  it("accepts an Arabic name, an optional English name and a known type", () => {
    const r = orgProfileSchema.safeParse({ name: "  مستشفى الملك فهد ", nameEn: "", type: "hospital" });
    expect(r.success).toBe(true);
    expect(r.data?.name).toBe("مستشفى الملك فهد");
  });

  it("refuses short names, long names and unknown types", () => {
    expect(orgProfileSchema.safeParse({ name: "م", nameEn: "", type: "hospital" }).success).toBe(false);
    expect(orgProfileSchema.safeParse({ name: "x".repeat(121), nameEn: "", type: "hospital" }).success).toBe(false);
    expect(orgProfileSchema.safeParse({ name: "مستشفى", nameEn: "", type: "clinic" }).success).toBe(false);
  });
});

describe("inviteSchema", () => {
  it("needs a valid e-mail and one of our roles", () => {
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "examiner", teamId: "" }).success).toBe(true);
    expect(inviteSchema.safeParse({ email: "not-an-email", role: "examiner", teamId: "" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "member", teamId: "" }).success).toBe(false);
  });
});

describe("departments", () => {
  it("names are 2..80 characters", () => {
    expect(departmentSchema.safeParse({ name: "قسم الطوارئ" }).success).toBe(true);
    expect(departmentSchema.safeParse({ name: " " }).success).toBe(false);
    expect(departmentSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });

  it("duplicate names ignore case and extra spaces", () => {
    expect(sameDepartmentName("Emergency  Room", " emergency room")).toBe(true);
    expect(sameDepartmentName("قسم الطوارئ", "قسم  الطوارئ ")).toBe(true);
    expect(sameDepartmentName("ICU", "NICU")).toBe(false);
  });
});
