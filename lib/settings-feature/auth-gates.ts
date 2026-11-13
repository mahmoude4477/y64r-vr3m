// Server rules for Better Auth's account endpoints that the settings page uses. The settings Server Actions validate
// their own input, but the same endpoints can be called straight through /api/auth/*:
// - /update-user (SEC-3) checks neither the length of `name` and `profession` nor the value of `locale` (an enum
//   additionalField is not validated by Better Auth 1.7.14). The endpoint cannot be disabled: the header's
//   LocaleSwitcher calls authClient.updateUser({ locale }).
// - /revoke-session, /revoke-sessions and /revoke-other-sessions (SEC-4) also work in a platform admin's
//   impersonation session, where they would sign the user's own devices out with no audit row. The settings actions
//   refuse that ("impersonating"); the admin panel has its own audited revoke.
// lib/auth.ts (foundation) calls these through teamAuthGateRefusal (lib/org/auth-gates.ts) from `hooks.before` and
// throws hookError(r.status, r.code, r.english, locale). Pure, client-safe and CLI-safe (zod and the locale list only).
import { isAppLocale } from "@/i18n/routing";
import type { GateRefusal } from "@/lib/org/auth-gates";
import { isStoredForm } from "@/lib/org/schemas";
import { profileSchema } from "./schemas";

/** What a user may change about themselves through /update-user. Everything else has its own endpoint. */
const UPDATE_USER_FIELDS = new Set(["name", "profession", "locale", "image"]);

const invalid = (field: string): GateRefusal => ({ status: "BAD_REQUEST", code: "INVALID_INPUT", english: `Invalid value: ${field}` });

/**
 * A refusal for an /update-user body, or null. name: the profile form's rules (2..100 characters, no control
 * characters, so also no U+0000 that Postgres cannot store); profession: up to 100 characters or null; locale: one of
 * the app's locales; image: only null (Waqaya shows initials, never a picture URL). Names are checked as sent, not
 * only after trimming (isStoredForm): Better Auth stores the raw body, so padding must not get past the limits.
 */
export function updateUserRefusal(body: unknown): GateRefusal | null {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  for (const key of Object.keys(b)) {
    if (!UPDATE_USER_FIELDS.has(key)) return { status: "BAD_REQUEST", code: "FIELD_NOT_ALLOWED", english: `Field not allowed: ${key}` };
  }
  if ("image" in b && b.image !== null && b.image !== undefined) {
    return { status: "BAD_REQUEST", code: "FIELD_NOT_ALLOWED", english: "Field not allowed: image" };
  }
  if ("name" in b && !isStoredForm(profileSchema.shape.name, b.name)) return invalid("name");
  if ("profession" in b && b.profession !== null && !isStoredForm(profileSchema.shape.profession, b.profession)) {
    return invalid("profession");
  }
  if ("locale" in b && !isAppLocale(b.locale)) return invalid("locale");
  return null;
}

/** Better Auth's endpoints that sign sessions of the signed-in user out (other than /sign-out itself). */
const SESSION_REVOKE_PATHS = new Set(["/revoke-session", "/revoke-sessions", "/revoke-other-sessions"]);

/**
 * SEC-4: in an impersonation session (session.impersonatedBy is set) these endpoints are refused, the same rule as
 * the settings actions and /delete-user. The admin stops impersonating and uses the admin panel's revoke instead.
 */
export function sessionRevokeRefusal(path: string, session: { impersonatedBy?: string | null }): GateRefusal | null {
  if (!SESSION_REVOKE_PATHS.has(path) || !session.impersonatedBy) return null;
  return { status: "FORBIDDEN", code: "NOT_WHILE_IMPERSONATING", english: "Not while acting as another user" };
}
