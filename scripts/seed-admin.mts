/**
 * pnpm db:seed-admin — creates the FIRST platform admin (PRODUCT.md 6a).
 *
 * Reads ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD from the environment (Railway variables or .env.local;
 * never commit them). Creates the user through Better Auth's own internal adapter and password hasher
 * with role "admin", emailVerified true and mustChangePassword true.
 * - Idempotent: if the email already exists, NOTHING is changed (an existing account is never promoted).
 * - Never prints the password.
 * Run once per environment; afterwards delete ADMIN_INITIAL_PASSWORD.
 */
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const { auth, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } = await import("../lib/auth");
const { prisma } = await import("../lib/prisma");

function fail(message: string): never {
  console.error(`seed-admin: ${message}`);
  process.exit(1);
}

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_INITIAL_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || "مدير المنصة";

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("ADMIN_EMAIL is missing or not an email address");
if (!password) fail("ADMIN_INITIAL_PASSWORD is missing");
if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
  fail(`ADMIN_INITIAL_PASSWORD must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`);
}

try {
  const ctx = await auth.$context;
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  if (existing) {
    console.log("seed-admin: a user with ADMIN_EMAIL already exists; left untouched (no promotion).");
  } else {
    const hash = await ctx.password.hash(password);
    const user = await ctx.internalAdapter.createUser(
      {
        email,
        name,
        emailVerified: true,
        role: "admin",
        locale: "ar",
        mustChangePassword: true,
      },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: hash,
    });
    console.log("seed-admin: platform admin created (role admin, email verified, must change password on first sign-in).");
  }
} catch (e) {
  fail(e instanceof Error ? e.message : "unexpected error");
} finally {
  await prisma.$disconnect();
}
