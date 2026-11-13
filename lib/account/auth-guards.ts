// Account-safety rules for Better Auth's own endpoints (note 08 F1, F5). CLI-safe: lib/auth.ts hooks call them
// and the `auth` CLI loads lib/auth.ts in plain Node.
import { prisma } from "@/lib/prisma";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * F1 (high): the e-mail VERIFICATION flow must never e-mail or sign in an address that is already verified.
 * Without this, `/email-otp/send-verification-otp { type: "email-verification" }` sends a code to any verified
 * account and `/email-otp/verify-email` then creates a session (autoSignInAfterVerification): a sign-in with the
 * mailbox alone, without the password. Returns "skip-send" (answer like a real send, send nothing), "refuse"
 * (answer INVALID_OTP) or null (not this flow / not verified yet: Better Auth handles it).
 * Codes sent on sign-in of an unverified user (sendOnSignIn) and password-reset codes are not affected.
 */
export async function emailVerificationGuard(path: string, body: unknown): Promise<"skip-send" | "refuse" | null> {
  if (path !== "/email-otp/send-verification-otp" && path !== "/email-otp/verify-email") return null;
  const b = asRecord(body);
  if (path === "/email-otp/send-verification-otp" && b.type !== "email-verification") return null;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!email) return null;
  const user = await prisma.user.findUnique({ where: { email }, select: { emailVerified: true } });
  if (!user?.emailVerified) return null;
  return path === "/email-otp/send-verification-otp" ? "skip-send" : "refuse";
}

/**
 * F5: `/admin/update-user` writes `body.data` as is. Only profile fields may change there; role, ban, password and
 * the mustChangePassword flag have their own audited endpoints (set-role, ban-user, set-user-password) or are never
 * set by hand. An admin may confirm an address (emailVerified: true) but never un-verify one.
 */
export const ADMIN_UPDATE_ALLOWED = new Set(["name", "image", "locale", "profession", "email", "emailVerified"]);

/** The first field of an /admin/update-user body that is not allowed, else null. */
export function adminUpdateRefusal(body: unknown): string | null {
  const data = asRecord(asRecord(body).data);
  for (const key of Object.keys(data)) if (!ADMIN_UPDATE_ALLOWED.has(key)) return key;
  if ("emailVerified" in data && data.emailVerified !== true) return "emailVerified";
  return null;
}

/**
 * The only values `user.role` may hold (admin plugin: defaultRole "user", adminRoles ["admin"]), plus
 * "protocol_editor" (lib/permissions.ts), which has no admin-plugin permission.
 */
export const PLATFORM_ROLES: ReadonlySet<string> = new Set(["user", "admin", "protocol_editor"]);

/**
 * `/admin/set-role` and `/admin/create-user` store the role as given (a string, a comma list or an array, joined
 * with ","): without this check a typo or a crafted call saves a role like "nonsense" that neither the "user" nor the
 * "admin" logic expects (final review). Returns the first part that is not one of PLATFORM_ROLES, else null.
 * create-user takes the role the way Better Auth does (admin routes: `ctx.body.role ?? ctx.body.data.role`), so a role
 * moved into `data` is checked too; without either it gets the default "user".
 */
export function adminRoleRefusal(path: string, body: unknown): string | null {
  if (path !== "/admin/set-role" && path !== "/admin/create-user") return null;
  const b = asRecord(body);
  const role = path === "/admin/create-user" ? (b.role ?? asRecord(b.data).role) : b.role;
  if (role === undefined && path === "/admin/create-user") return null;
  const parts = (Array.isArray(role) ? role : [role]).flatMap((r) => (typeof r === "string" ? r.split(",") : [String(r)]));
  if (parts.length === 0) return "(empty)";
  for (const part of parts) if (!PLATFORM_ROLES.has(part)) return part || "(empty)";
  return null;
}
