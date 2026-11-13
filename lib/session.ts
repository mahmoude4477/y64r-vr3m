import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { isAppLocale, routing, type AppLocale } from "@/i18n/routing";
import { auth } from "@/lib/auth";
import { isContentEditorRole, isPlatformAdminRole, strongestOrgRole, type OrgRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Session helpers for Server Components, layouts, Server Actions and Route Handlers.
 *
 * With cacheComponents ON, every call below reads the request (headers), so the component that calls
 * it MUST sit inside <Suspense> (or be a page/layout segment that is already dynamic). Never call these
 * inside "use cache". All helpers are deduplicated per request with React cache().
 */

/** Raw Better Auth session (or null). One indexed DB query per request. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export type AppSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;
export type AppUser = AppSession["user"];

export type AuthContext = {
  session: AppSession["session"];
  user: AppUser;
  /** Platform super-admin (admin plugin, user.role "admin"). */
  isPlatformAdmin: boolean;
  /** Platform admin or protocol editor (user.role "protocol_editor"): edits global protocols and scenarios. */
  isContentEditor: boolean;
  /** Active organization, only when the user is a member and it is not suspended. */
  organizationId: string | null;
  /** The user's role in the active organization. */
  orgRole: OrgRole | null;
  memberId: string | null;
};

export type OrgAuthContext = AuthContext & { organizationId: string; orgRole: OrgRole; memberId: string };

export { isPlatformAdminRole };

/** Session + active-organization membership, or null for guests. No redirects. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const s = await getSession();
  if (!s) return null;
  let organizationId = s.session.activeOrganizationId ?? null;
  let orgRole: OrgRole | null = null;
  let memberId: string | null = null;
  if (organizationId) {
    const member = await prisma.member.findFirst({
      where: { organizationId, userId: s.user.id },
      select: { id: true, role: true, organization: { select: { suspended: true } } },
    });
    if (member && !member.organization.suspended) {
      orgRole = strongestOrgRole(member.role);
      memberId = member.id;
    }
    if (!orgRole) {
      organizationId = null;
      memberId = null;
    }
  }
  return {
    session: s.session,
    user: s.user,
    isPlatformAdmin: isPlatformAdminRole(s.user.role),
    isContentEditor: isContentEditorRole(s.user.role),
    organizationId,
    orgRole,
    memberId,
  };
});

/**
 * Locale for redirects. Works in Server Components (next/root-params); in Server Actions and Route
 * Handlers root params throw, so it falls back to the user's saved locale, then Arabic.
 */
export async function getRequestLocale(fallback?: string | null): Promise<AppLocale> {
  try {
    const locale = await getLocale();
    if (isAppLocale(locale)) return locale;
  } catch {
    // Server Action / Route Handler
  }
  return isAppLocale(fallback) ? fallback : routing.defaultLocale;
}

const SESSION_COOKIE_NAMES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

async function redirectToSignIn(): Promise<never> {
  const locale = await getRequestLocale();
  const jar = await cookies();
  // A cookie without a valid session (expired, revoked, banned) would bounce between the proxy's
  // guest-only redirect and this one. /api/session/expired clears it first, then goes to sign-in.
  if (SESSION_COOKIE_NAMES.some((n) => jar.has(n))) redirect(`/api/session/expired?locale=${locale}`);
  redirect(`/${locale}/sign-in`);
}

/**
 * Signed-in user or redirect to sign-in. Users with mustChangePassword are sent to
 * /[locale]/settings/password first (only that page passes { allowMustChangePassword: true }).
 */
export async function requireUser(options?: { allowMustChangePassword?: boolean }): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) return redirectToSignIn();
  if (ctx.user.mustChangePassword && !options?.allowMustChangePassword) {
    const locale = await getRequestLocale(ctx.user.locale);
    redirect(`/${locale}/settings/password`);
  }
  return ctx;
}

/**
 * Member of the ACTIVE organization with one of `roles`, else notFound() (the localized not-found UI).
 * Use ORG_MANAGER_ROLES / ORG_STAFF_ROLES from lib/permissions.ts.
 *
 * Under cacheComponents this runs inside <Suspense>, after the static shell was already sent: the denial
 * is a CLIENT-side 404 (HTTP 200 + <meta name="robots" content="noindex">), and the page's static parts
 * are in the HTML. Render everything beyond generic message strings inside the component that calls this;
 * e2e tests assert on the not-found UI, not on the status code.
 */
export async function requireOrgRole(roles: readonly OrgRole[]): Promise<OrgAuthContext> {
  const ctx = await requireUser();
  if (!ctx.organizationId || !ctx.orgRole || !ctx.memberId || !roles.includes(ctx.orgRole)) notFound();
  return ctx as OrgAuthContext;
}

/** Platform super-admin (user.role "admin"), else notFound() (client-side 404, see requireOrgRole). */
export async function requirePlatformAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!ctx.isPlatformAdmin) notFound();
  return ctx;
}

/**
 * Platform admin or protocol editor, else notFound(). Only the global protocol and scenario pages of /admin
 * (/admin/protocols, /admin/scenarios) use it; every other /admin page keeps requirePlatformAdmin().
 */
export async function requireContentEditor(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!ctx.isContentEditor) notFound();
  return ctx;
}

export type ApiAuthResult<T extends AuthContext = AuthContext> = { ok: true; ctx: T } | { ok: false; response: Response };

/**
 * Route Handler variant: never redirects. 401 for guests, 403 for mustChangePassword or a missing role.
 *   const a = await authorizeApi({ roles: ORG_STAFF_ROLES }); if (!a.ok) return a.response;
 */
export async function authorizeApi(options?: {
  roles?: readonly OrgRole[];
  platformAdmin?: boolean;
}): Promise<ApiAuthResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  if (ctx.user.mustChangePassword) {
    return { ok: false, response: Response.json({ error: "must_change_password" }, { status: 403 }) };
  }
  if (options?.platformAdmin && !ctx.isPlatformAdmin) {
    return { ok: false, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  if (options?.roles && (!ctx.orgRole || !options.roles.includes(ctx.orgRole))) {
    return { ok: false, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, ctx };
}
