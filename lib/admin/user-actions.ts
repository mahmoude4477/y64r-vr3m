"use server";

import { headers } from "next/headers";
import { attempt, badLocale, DB_FAILED, failure, fromAuthError, revalidateAdmin, type ActionResult } from "@/lib/admin/action-result";
import {
  banExpiresInSeconds,
  banSchema,
  confirmationMatches,
  removeUserSchema,
  revokeSessionSchema,
  setRoleSchema,
  userIdSchema,
} from "@/lib/admin/schemas";
import { isAppLocale } from "@/i18n/routing";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/session";

// Platform-admin actions on user accounts. Each one goes through Better Auth's admin endpoint (auth.api.*), so
// lib/auth.ts applies the same rules as a direct /api/auth/admin/* call (last platform admin, deletion blockers,
// allowed roles, the account lock) and writes the audit row automatically (auth.admin.<endpoint>, real actor and
// IP). Nothing here writes a second audit row. The admin's own account is managed in Settings, never here.
//
// Order in every action: locale, input, platform admin (requirePlatformAdmin: not-found for anyone else), then the
// endpoint. Failures come back translated (admin.errors.*).

export async function setUserRoleAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = setRoleSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  if (parsed.data.userId === ctx.user.id) return failure(locale, "self");
  try {
    await auth.api.setRole({ headers: await headers(), body: { userId: parsed.data.userId, role: parsed.data.role } });
  } catch (e) {
    return fromAuthError(locale, e, "admin.user.set_role_failed");
  }
  revalidateAdmin(locale);
  return { ok: true };
}

export async function banUserAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = banSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  if (parsed.data.userId === ctx.user.id) return failure(locale, "self");
  try {
    await auth.api.banUser({
      headers: await headers(),
      body: {
        userId: parsed.data.userId,
        // The reason stays on the user row only (lib/auth-hooks.ts keeps it out of the audit meta).
        banReason: parsed.data.reason,
        banExpiresIn: banExpiresInSeconds(parsed.data.duration),
      },
    });
  } catch (e) {
    return fromAuthError(locale, e, "admin.user.ban_failed");
  }
  revalidateAdmin(locale);
  return { ok: true };
}

export async function unbanUserAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  await requirePlatformAdmin();
  try {
    await auth.api.unbanUser({ headers: await headers(), body: { userId: parsed.data.userId } });
  } catch (e) {
    return fromAuthError(locale, e, "admin.user.unban_failed");
  }
  revalidateAdmin(locale);
  return { ok: true };
}

/** Signs the user out everywhere (every session row is deleted). */
export async function revokeUserSessionsAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  if (parsed.data.userId === ctx.user.id) return failure(locale, "self");
  try {
    await auth.api.revokeUserSessions({ headers: await headers(), body: { userId: parsed.data.userId } });
  } catch (e) {
    return fromAuthError(locale, e, "admin.user.revoke_sessions_failed");
  }
  revalidateAdmin(locale);
  return { ok: true };
}

/**
 * The body for Better Auth's revoke-user-session. The endpoint needs only the token, so its automatic audit row
 * (lib/auth.ts after hook, lib/auth-hooks.ts authAuditEntry, which takes the target from body.userId) would name
 * nobody. The account's id rides along (checked by the caller: the session belongs to it), so that one row says whose
 * session ended, like the "sign out everywhere" row. Better Auth's body schema drops the extra field before the
 * endpoint runs. Until the foundation resolves the session's owner itself (requested), this keeps the row from being
 * anonymous without writing a second one (CONVENTIONS 8).
 */
function revokeSessionBody(sessionToken: string, userId: string): { sessionToken: string } {
  const body: { sessionToken: string; userId: string } = { sessionToken, userId };
  return body;
}

/** Ends one session. The browser only knows the session id; the token is looked up here and never leaves the server. */
export async function revokeUserSessionAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = revokeSessionSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  if (parsed.data.userId === ctx.user.id) return failure(locale, "self");
  const session = await attempt("admin.user.revoke_session_failed", () =>
    prisma.session.findFirst({ where: { id: parsed.data.sessionId, userId: parsed.data.userId }, select: { token: true } }),
  );
  if (session === DB_FAILED) return failure(locale, "generic");
  if (!session) return failure(locale, "notFound");
  try {
    await auth.api.revokeUserSession({ headers: await headers(), body: revokeSessionBody(session.token, parsed.data.userId) });
  } catch (e) {
    return fromAuthError(locale, e, "admin.user.revoke_session_failed");
  }
  revalidateAdmin(locale);
  return { ok: true };
}

/**
 * Deletes the account (Better Auth remove-user). lib/auth.ts checks the deletion blockers under the account lock
 * first (ACCOUNT_DELETION_BLOCKED, LAST_PLATFORM_ADMIN, ACCOUNT_LOCK_BUSY), then lib/account/purge.ts removes the
 * personal data and de-identifies the audit trail; institution records stay. The admin types the address to confirm.
 */
export async function removeUserAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = removeUserSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  if (parsed.data.userId === ctx.user.id) return failure(locale, "self");
  const user = await attempt("admin.user.remove_failed", () =>
    prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { email: true } }),
  );
  if (user === DB_FAILED) return failure(locale, "generic");
  if (!user) return failure(locale, "notFound");
  if (!confirmationMatches(parsed.data.confirmEmail, user.email)) return failure(locale, "confirmMismatch");
  try {
    await auth.api.removeUser({ headers: await headers(), body: { userId: parsed.data.userId } });
  } catch (e) {
    return fromAuthError(locale, e, "admin.user.remove_failed");
  }
  revalidateAdmin(locale);
  return { ok: true };
}
