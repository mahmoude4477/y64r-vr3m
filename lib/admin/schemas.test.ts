import { describe, expect, it } from "vitest";
import {
  banExpiresInSeconds,
  banSchema,
  confirmationMatches,
  createOrganizationSchema,
  inviteSchema,
  memberRoleSchema,
  setRoleSchema,
} from "./schemas";

describe("admin schemas", () => {
  it("creates an institution with both names, a type and an optional owner address", () => {
    const ok = createOrganizationSchema.safeParse({ nameAr: " مستشفى الاختبار ", nameEn: "Test Hospital", type: "hospital", ownerEmail: " Owner@Example.COM " });
    expect(ok.success && ok.data).toEqual({ nameAr: "مستشفى الاختبار", nameEn: "Test Hospital", type: "hospital", ownerEmail: "owner@example.com" });
    expect(createOrganizationSchema.safeParse({ nameAr: "مستشفى", nameEn: "Hospital", type: "hospital", ownerEmail: "" }).success).toBe(true);
    expect(createOrganizationSchema.safeParse({ nameAr: "م", nameEn: "Hospital", type: "hospital", ownerEmail: "" }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ nameAr: "مستشفى", nameEn: "Hospital", type: "clinic", ownerEmail: "" }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ nameAr: "مستشفى", nameEn: "Hospital", type: "hospital", ownerEmail: "not-an-email" }).success).toBe(false);
  });

  it("accepts only the platform roles and the institution roles", () => {
    expect(setRoleSchema.safeParse({ userId: "u1", role: "admin" }).success).toBe(true);
    expect(setRoleSchema.safeParse({ userId: "u1", role: "owner" }).success).toBe(false);
    expect(memberRoleSchema.safeParse({ organizationId: "o", memberId: "m", role: "examiner" }).success).toBe(true);
    expect(memberRoleSchema.safeParse({ organizationId: "o", memberId: "m", role: "member" }).success).toBe(false);
    expect(inviteSchema.safeParse({ organizationId: "o", email: "a@b.co", role: "owner" }).success).toBe(true);
  });

  it("needs a ban reason and a known length", () => {
    expect(banSchema.safeParse({ userId: "u", reason: "Spam accounts", duration: "7" }).success).toBe(true);
    expect(banSchema.safeParse({ userId: "u", reason: "  ", duration: "7" }).success).toBe(false);
    expect(banSchema.safeParse({ userId: "u", reason: "Spam", duration: "365" }).success).toBe(false);
    expect(banExpiresInSeconds("1")).toBe(86_400);
    expect(banExpiresInSeconds("30")).toBe(30 * 86_400);
    expect(banExpiresInSeconds("permanent")).toBeUndefined();
  });

  it("matches typed confirmations without case or surrounding spaces", () => {
    expect(confirmationMatches("  Huda@Example.com ", "huda@example.com")).toBe(true);
    expect(confirmationMatches("King Fahd", "مستشفى", "king fahd")).toBe(true);
    expect(confirmationMatches("", "")).toBe(false);
    expect(confirmationMatches("huda@example.co", "huda@example.com")).toBe(false);
    expect(confirmationMatches("x", null, undefined)).toBe(false);
  });
});
