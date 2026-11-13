import { describe, expect, it, vi } from "vitest";

const users = vi.hoisted(() => new Map<string, { emailVerified: boolean }>([
  ["verified@example.com", { emailVerified: true }],
  ["new@example.com", { emailVerified: false }],
]));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: async ({ where }: { where: { email: string } }) => users.get(where.email) ?? null } },
}));

const { adminRoleRefusal, adminUpdateRefusal, emailVerificationGuard } = await import("./auth-guards");

describe("F1: e-mail verification never signs in a verified address", () => {
  it("skips the send and refuses verify-email for an address that is already verified", async () => {
    expect(await emailVerificationGuard("/email-otp/send-verification-otp", { email: " Verified@Example.com ", type: "email-verification" })).toBe("skip-send");
    expect(await emailVerificationGuard("/email-otp/verify-email", { email: "verified@example.com", otp: "123456" })).toBe("refuse");
  });

  it("leaves unverified and unknown addresses to Better Auth", async () => {
    expect(await emailVerificationGuard("/email-otp/send-verification-otp", { email: "new@example.com", type: "email-verification" })).toBeNull();
    expect(await emailVerificationGuard("/email-otp/verify-email", { email: "new@example.com", otp: "1" })).toBeNull();
    expect(await emailVerificationGuard("/email-otp/verify-email", { email: "nobody@example.com", otp: "1" })).toBeNull();
  });

  it("does not touch password-reset codes or other paths", async () => {
    expect(await emailVerificationGuard("/email-otp/send-verification-otp", { email: "verified@example.com", type: "forget-password" })).toBeNull();
    expect(await emailVerificationGuard("/forget-password/email-otp", { email: "verified@example.com" })).toBeNull();
    expect(await emailVerificationGuard("/sign-in/email", { email: "verified@example.com" })).toBeNull();
    expect(await emailVerificationGuard("/email-otp/verify-email", null)).toBeNull();
    expect(await emailVerificationGuard("/email-otp/verify-email", { email: 42 })).toBeNull();
  });
});

describe("F5: /admin/update-user allow-list", () => {
  it("allows profile fields and confirming an address", () => {
    expect(adminUpdateRefusal({ userId: "u", data: { name: "x", image: null, locale: "en", profession: "nurse", email: "a@b.co" } })).toBeNull();
    expect(adminUpdateRefusal({ userId: "u", data: { emailVerified: true } })).toBeNull();
    expect(adminUpdateRefusal({ userId: "u" })).toBeNull();
  });

  it("refuses role, ban, password and internal flags, and un-verifying an address", () => {
    expect(adminUpdateRefusal({ data: { role: "admin" } })).toBe("role");
    expect(adminUpdateRefusal({ data: { name: "x", banned: true } })).toBe("banned");
    expect(adminUpdateRefusal({ data: { mustChangePassword: false } })).toBe("mustChangePassword");
    expect(adminUpdateRefusal({ data: { password: "x" } })).toBe("password");
    expect(adminUpdateRefusal({ data: { emailVerified: false } })).toBe("emailVerified");
    expect(adminUpdateRefusal({ data: { emailVerified: "yes" } })).toBe("emailVerified");
  });
});

describe("platform roles on /admin/set-role and /admin/create-user", () => {
  it("allows exactly user and admin, as a string, a comma list or an array", () => {
    expect(adminRoleRefusal("/admin/set-role", { userId: "u", role: "user" })).toBeNull();
    expect(adminRoleRefusal("/admin/set-role", { userId: "u", role: "admin" })).toBeNull();
    expect(adminRoleRefusal("/admin/set-role", { userId: "u", role: ["user", "admin"] })).toBeNull();
    expect(adminRoleRefusal("/admin/set-role", { userId: "u", role: "protocol_editor" })).toBeNull();
    expect(adminRoleRefusal("/admin/create-user", { email: "a@b.co", name: "A" })).toBeNull(); // default role
  });

  it("refuses anything else, empty parts and padded values", () => {
    expect(adminRoleRefusal("/admin/set-role", { userId: "u", role: "nonsense" })).toBe("nonsense");
    expect(adminRoleRefusal("/admin/set-role", { userId: "u", role: "user,owner" })).toBe("owner");
    expect(adminRoleRefusal("/admin/set-role", { userId: "u", role: ["admin", " user"] })).toBe(" user");
    expect(adminRoleRefusal("/admin/set-role", { userId: "u", role: "" })).toBe("(empty)");
    expect(adminRoleRefusal("/admin/set-role", { userId: "u", role: [] })).toBe("(empty)");
    expect(adminRoleRefusal("/admin/set-role", { userId: "u" })).toBe("undefined");
    expect(adminRoleRefusal("/admin/create-user", { email: "a@b.co", role: "superadmin" })).toBe("superadmin");
  });

  it("create-user: checks a role sent in data, with Better Auth's precedence (body.role first)", () => {
    // Better Auth admin routes: `const requestedRole = ctx.body.role ?? ctx.body.data?.role` (final review).
    expect(adminRoleRefusal("/admin/create-user", { email: "a@b.co", data: { role: "nonsense" } })).toBe("nonsense");
    expect(adminRoleRefusal("/admin/create-user", { email: "a@b.co", data: { role: ["superadmin", "x"] } })).toBe("superadmin");
    expect(adminRoleRefusal("/admin/create-user", { email: "a@b.co", data: { role: "admin,x" } })).toBe("x");
    expect(adminRoleRefusal("/admin/create-user", { email: "a@b.co", data: { role: "admin" } })).toBeNull();
    expect(adminRoleRefusal("/admin/create-user", { email: "a@b.co", data: { locale: "en" } })).toBeNull(); // default role
    // body.role wins over data.role, as in the library (the stored role is body.role)
    expect(adminRoleRefusal("/admin/create-user", { email: "a@b.co", role: "user", data: { role: "nonsense" } })).toBeNull();
    expect(adminRoleRefusal("/admin/create-user", { email: "a@b.co", role: "nonsense", data: { role: "user" } })).toBe("nonsense");
    // set-role has no data.role
    expect(adminRoleRefusal("/admin/set-role", { userId: "u", data: { role: "admin" } })).toBe("undefined");
  });

  it("ignores other paths", () => {
    expect(adminRoleRefusal("/admin/update-user", { role: "nonsense" })).toBeNull();
    expect(adminRoleRefusal("/organization/update-member-role", { role: "nonsense" })).toBeNull();
  });
});
