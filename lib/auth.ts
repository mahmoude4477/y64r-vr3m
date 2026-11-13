// Better Auth server instance. Do NOT add `import "server-only"` anywhere in this file's import graph:
// the `auth` CLI (pnpm auth:generate) loads it in plain Node and refuses it.
import { i18n } from "@better-auth/i18n";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, emailOTP, organization } from "better-auth/plugins";
import { adminRoleRefusal, adminUpdateRefusal, emailVerificationGuard } from "@/lib/account/auth-guards";
import { AccountLockBusyError, ACCOUNT_LOCK_PATHS, lockForRequest, releaseRequestLock } from "@/lib/account/deletion-lock";
import { deletionBlockers, isLastActivePlatformAdmin } from "@/lib/account/deletion-rules";
import { accountLockDecision } from "@/lib/account/lock-scope";
import { purgeUserData } from "@/lib/account/purge";
import { AUTH_TRANSLATIONS, hookError, hookLocale } from "@/lib/auth-hook-errors";
import { authRateLimitStorage, setAuthEndpointPaths } from "@/lib/auth-rate-limit";
import { CLIENT_IP_HEADERS, clientIp, writeAuditRecord } from "@/lib/audit-core";
import {
  authAuditEntry,
  blockedByMustChangePassword,
  IMPERSONATION_AUDITED_PATHS,
  isGatedAuthPath,
  isOrganizationWrite,
  suspendedWriteTarget,
} from "@/lib/auth-hooks";
import {
  deliverAccountDeletedEmail,
  deliverInvitationEmail,
  deliverOtpEmail,
  fireAndForget,
  INVITATION_EXPIRES_SECONDS,
  OTP_EXPIRES_SECONDS,
} from "@/lib/email/auth-mail";
import { isEmailEnabled } from "@/lib/email";
import { betterAuthLogger, log } from "@/lib/log";
import { ac, isPlatformAdminRole, ORGANIZATION_TYPES, orgRoles, platformRoles } from "@/lib/permissions";
import { teamAuthGateRefusal } from "@/lib/org/auth-gates";
import { prisma } from "@/lib/prisma";
import { localeFromHeaders, type RequestLocale } from "@/lib/request-locale";

export const PASSWORD_MIN_LENGTH = 10;

// TEMPORARY (2026-11-06): while email is off (no CLOUDFLARE_EMAIL_API_TOKEN yet), sign-up does not ask for the
// 6-digit code: the account is created unverified and signed in at once. As soon as email is configured and the
// service restarts, verification is required again, and accounts created meanwhile get a code on their next sign-in
// (sendOnSignIn). Read once at start-up, like the rest of this config.
export const EMAIL_VERIFICATION_REQUIRED = isEmailEnabled();
export const PASSWORD_MAX_LENGTH = 128;

// Thrown from hooks.before (translated there, lib/auth-hook-errors.ts) and from deleteUser.beforeDelete (inside the
// endpoint, where the i18n plugin translates it).
function deletionBlockedError(locale: RequestLocale = "en") {
  return hookError("BAD_REQUEST", "ACCOUNT_DELETION_BLOCKED", "This account cannot be deleted yet", locale);
}

function lastPlatformAdminError(locale: RequestLocale) {
  return hookError("BAD_REQUEST", "LAST_PLATFORM_ADMIN", "This is the last active platform admin", locale);
}

function lockBusyError(locale: RequestLocale) {
  return hookError("SERVICE_UNAVAILABLE", "ACCOUNT_LOCK_BUSY", "Please try again in a moment", locale);
}

export const auth = betterAuth({
  appName: "Waqaya",
  // BETTER_AUTH_URL and BETTER_AUTH_SECRET are read from the environment. BETTER_AUTH_TRUSTED_ORIGINS
  // (comma list, no spaces) is also read by Better Auth itself (crosscheck C12); baseURL is always trusted.
  // Never trust *.up.railway.app (crosscheck C9).
  database: prismaAdapter(prisma, { provider: "postgresql", transaction: true }),
  // Better Auth's own warnings ("Invalid password", "User not found", …) as JSON lines (lib/log.ts, PRODUCT 9).
  logger: betterAuthLogger,
  onAPIError: {
    // Without this, Better Auth prints EVERY API error (a wrong password, a blocked delete, …) as a plain-text line
    // with its own global logger whenever logger.level is set. As JSON instead: expected 4xx answers at debug level
    // (the HTTP log already has them), server errors and unexpected throws as errors.
    onError: (error) => {
      if (isAPIError(error)) {
        if (error.statusCode >= 500) log.error("auth.api_error", { status: error.statusCode, err: error });
        // errorCode, not code: lib/log.ts drops every field named "code" (one-time codes).
        else log.debug("auth.api_error", { status: error.statusCode, errorCode: (error.body as { code?: string } | undefined)?.code ?? null });
        return;
      }
      log.error("auth.unexpected_error", { err: error });
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    autoSignIn: !EMAIL_VERIFICATION_REQUIRED, // no session until the email is verified (while email is on)
    requireEmailVerification: EMAIL_VERIFICATION_REQUIRED,
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: EMAIL_VERIFICATION_REQUIRED,
    sendOnSignIn: EMAIL_VERIFICATION_REQUIRED, // signing in with an unverified email sends a fresh code
    autoSignInAfterVerification: true,
  },
  user: {
    additionalFields: {
      locale: { type: ["ar", "en"], required: false, defaultValue: "ar", input: true },
      profession: { type: "string", required: false, input: true },
      // Set by scripts/seed-admin.mts; cleared by the hooks below once the user sets a new password.
      mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
    },
    // Self-service "delete my account" (PRODUCT 9). Enabled for auth.api.deleteUser ONLY: /delete-user and
    // /delete-user/callback are in disabledPaths, so the browser cannot skip the e-mailed code and the password
    // check of lib/account/delete-account.ts (note 08 B1). Better Auth then: checks the password, runs
    // beforeDelete, deletes sessions + accounts, runs databaseHooks.user.delete.before (the purge), deletes the
    // user row, clears the cookies (nextCookies) and runs afterDelete.
    deleteUser: {
      enabled: true,
      // Blockers BEFORE anything is deleted (note 08 F3): never in databaseHooks.user.delete.before.
      beforeDelete: async (user) => {
        if ((await deletionBlockers(user.id)).length > 0) throw deletionBlockedError();
      },
      afterDelete: async (user) => {
        // No personal data: no actor, no name, no IP; the target is the old (now dangling) user id.
        await writeAuditRecord({
          actorId: null,
          actorName: null,
          actorRole: null,
          actorDeleted: true,
          action: "account.delete",
          targetType: "user",
          targetId: user.id,
          ip: null,
        });
        fireAndForget(deliverAccountDeletedEmail({ email: user.email, locale: (user as { locale?: unknown }).locale }));
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // cookieCache stays OFF: a cached session would keep stale role / ban / mustChangePassword data for
    // minutes. Every getSession is one indexed query, deduplicated per request by lib/session.ts.
  },
  rateLimit: {
    enabled: true, // also in development, so the limits can be tested locally
    storage: "database", // the rateLimit model (pnpm auth:generate); shared by replicas, survives redeploys
    // One atomic upsert per request instead of Better Auth's interactive transaction (lib/auth-rate-limit.ts).
    customStorage: authRateLimitStorage,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/email-otp/verify-email": { window: 60, max: 10 },
      "/email-otp/request-password-reset": { window: 60, max: 3 },
      "/forget-password/email-otp": { window: 60, max: 3 },
      "/email-otp/reset-password": { window: 60, max: 10 },
      "/change-password": { window: 60, max: 5 },
    },
  },
  // Passwordless OTP sign-in and OTP email change are not part of Waqaya v1. /delete-user(/callback): only
  // through lib/account/delete-account.ts (auth.api.* still works on the server; disabledPaths is HTTP only).
  disabledPaths: [
    "/sign-in/email-otp",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
    "/delete-user",
    "/delete-user/callback",
  ],
  advanced: {
    // Railway's edge sets X-Real-IP. Better Auth never trusts a multi-hop X-Forwarded-For (no leftmost
    // value). Still to verify on the deployed service: a client-sent X-Real-IP is overwritten (crosscheck G10).
    ipAddress: { ipAddressHeaders: CLIENT_IP_HEADERS },
  },
  databaseHooks: {
    user: {
      delete: {
        // Self-service delete AND admin remove-user: remove personal data no FK covers, de-identify the audit
        // trail, keep the institution's records (lib/account/purge.ts). Never throws on purpose (note 08 F3).
        before: async (user) => {
          await purgeUserData(user.id);
        },
      },
    },
    session: {
      create: {
        // New sessions start in the user's first organization that is not suspended (if any); a suspended
        // one would be dropped by getAuthContext and leave staff with no active organization.
        before: async (session) => {
          const member = await prisma.member.findFirst({
            where: { userId: session.userId, organization: { OR: [{ suspended: null }, { suspended: false }] } },
            orderBy: { createdAt: "asc" },
            select: { organizationId: true },
          });
          return { data: { ...session, activeOrganizationId: member?.organizationId ?? null } };
        },
      },
    },
  },
  hooks: {
    // Gates for Better Auth's own endpoints (the browser can call /api/auth/* directly, so the page-level
    // checks in lib/session.ts do not cover them). The session read here is reused by the endpoint.
    // Every error thrown here goes through hookError(): no after hook runs when a before hook throws, so the i18n
    // plugin never translates it (lib/auth-hook-errors.ts).
    before: createAuthMiddleware(async (ctx) => {
      const headers = ctx.request?.headers ?? ctx.headers;
      // F1 (note 08): the e-mail verification flow never e-mails or signs in an address that is already verified
      // (it would be a sign-in with the mailbox alone, without the password).
      const guard = await emailVerificationGuard(ctx.path, ctx.body);
      if (guard === "skip-send") return ctx.json({ success: true }); // the same answer as a real send
      if (guard === "refuse") throw hookError("BAD_REQUEST", "INVALID_OTP", "Invalid OTP", hookLocale(null, headers));

      if (!isGatedAuthPath(ctx.path)) return;
      const s = await getSessionFromCtx(ctx);
      if (!s) return; // guests: the endpoint itself answers 401 (no query, no answer that depends on the target)
      const user = s.user as typeof s.user & { mustChangePassword?: boolean | null; role?: string | null; locale?: unknown };
      const locale = hookLocale(user.locale, headers);
      if (user.mustChangePassword && blockedByMustChangePassword(ctx.path)) {
        throw hookError("FORBIDDEN", "MUST_CHANGE_PASSWORD", "Set a new password first", locale);
      }
      if (ctx.path === "/delete-user" && (s.session as { impersonatedBy?: string | null }).impersonatedBy) {
        // An admin acting as a user never deletes that user's account (server-side calls pass through here too).
        throw hookError("FORBIDDEN", "NOT_WHILE_IMPERSONATING", "Not while acting as another user", locale);
      }
      const platformAdmin = isPlatformAdminRole(user.role);
      if (isOrganizationWrite(ctx.path) && !platformAdmin) {
        const session = s.session as typeof s.session & { activeOrganizationId?: string | null };
        if (await suspendedWriteTarget(ctx.path, ctx.body, session.activeOrganizationId)) {
          throw hookError("FORBIDDEN", "ORGANIZATION_SUSPENDED", "This institution is suspended", locale);
        }
      }
      // Value and permission rules of the institution and settings endpoints (lib/org/auth-gates.ts,
      // lib/settings-feature/auth-gates.ts): names, types and roles are checked as sent; trainees and examiners cannot
      // read the member list or invitations; only owners cancel an owner invitation; no session revoke while acting
      // as another user. Before the account lock below: nothing may throw while it is held.
      const gate = await teamAuthGateRefusal({
        path: ctx.path,
        body: ctx.body,
        query: ctx.query,
        userId: user.id,
        session: s.session as { activeOrganizationId?: string | null; activeTeamId?: string | null; impersonatedBy?: string | null },
        platformAdmin,
      });
      if (gate) throw hookError(gate.status, gate.code, gate.english, locale);
      // Admin-plugin rules run for platform admins only. Anyone else gets the endpoint's own 403 from Better Auth's
      // admin middleware, never an answer that tells them something about the target account (review round 1).
      if (platformAdmin && ctx.path === "/admin/update-user") {
        const field = adminUpdateRefusal(ctx.body); // F5: role, ban, password, flags have their own endpoints
        if (field) throw hookError("BAD_REQUEST", "FIELD_NOT_ALLOWED", `Field not allowed: ${field}`, locale);
      }
      if (platformAdmin) {
        // Only "user" and "admin" are platform roles; set-role / create-user would store any string (final review).
        const role = adminRoleRefusal(ctx.path, ctx.body);
        if (role !== null) throw hookError("BAD_REQUEST", "ROLE_NOT_ALLOWED", "Role not allowed", locale);
      }
      if (platformAdmin && ctx.path === "/admin/revoke-user-session") {
        // The automatic audit row (after hook) takes its target from body.userId. Name the account whose session ends,
        // looked up by the token before the endpoint deletes it, never an id the caller typed ("" = no such session).
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        const token = typeof body.sessionToken === "string" ? body.sessionToken : null;
        const owner = token ? await prisma.session.findFirst({ where: { token }, select: { userId: true } }) : null;
        return { context: { body: { ...body, userId: owner?.userId ?? "" } } };
      }
      // Last: nothing above may throw while the lock is held. Only calls that can really remove an owner or a
      // platform admin take it (lib/account/lock-scope.ts, review round 2); released by the after hook below or,
      // when the endpoint throws a plain Error, by app/api/auth/[...all]/route.ts.
      if (ACCOUNT_LOCK_PATHS.has(ctx.path)) {
        const session = s.session as typeof s.session & { activeOrganizationId?: string | null };
        const decision = await accountLockDecision(ctx.path, ctx.body, {
          userId: user.id,
          activeOrganizationId: session.activeOrganizationId,
          platformAdmin,
        });
        if (!decision.lock) return;
        try {
          await lockForRequest(ctx);
        } catch (e) {
          // AccountLockBusyError, Postgres' lock timeout or no connection: "try again", never a 500.
          log.warn("account.lock.busy", { path: ctx.path, busy: e instanceof AccountLockBusyError, err: e });
          throw lockBusyError(locale);
        }
        try {
          // Same rules as the self-service delete, under the same lock, before Better Auth changes anything (F3).
          if (decision.check === "deletion" && (await deletionBlockers(decision.targetUserId)).length > 0) {
            throw deletionBlockedError(locale);
          }
          if (decision.check === "last_admin" && (await isLastActivePlatformAdmin(decision.targetUserId))) {
            throw lastPlatformAdminError(locale);
          }
        } catch (e) {
          releaseRequestLock(ctx);
          throw e;
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      releaseRequestLock(ctx); // the account lock of the before hook (lib/account/deletion-lock.ts), success or APIError
      const returned = ctx.context.returned;
      if (!returned || returned instanceof APIError || returned instanceof Error) return;

      // Every admin / organization change is audited here, so calling the endpoint directly cannot skip it.
      const session = ctx.context.session as Parameters<typeof authAuditEntry>[0]["session"] | undefined;
      const entry = authAuditEntry({ path: ctx.path, body: ctx.body, returned, session: session ?? null });
      if (entry) {
        await writeAuditRecord({ ...entry, ip: clientIp(ctx.request?.headers ?? ctx.headers) });
        if (!IMPERSONATION_AUDITED_PATHS.has(ctx.path)) return; // /change-password still clears mustChangePassword below
      }

      // mustChangePassword is cleared only after a successful password change or OTP reset.
      if (ctx.path !== "/change-password" && ctx.path !== "/email-otp/reset-password") return;
      if (ctx.path === "/change-password") {
        const userId = ctx.context.session?.user.id;
        if (userId) await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
      } else {
        const email = typeof ctx.body?.email === "string" ? ctx.body.email.toLowerCase() : null;
        if (email) await prisma.user.updateMany({ where: { email }, data: { mustChangePassword: false } });
      }
    }),
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_EXPIRES_SECONDS,
      allowedAttempts: 5,
      storeOTP: "hashed",
      sendVerificationOnSignUp: EMAIL_VERIFICATION_REQUIRED,
      overrideDefaultEmailVerification: true, // verification uses the 6-digit code, not a link
      disableSignUp: true, // OTP never creates accounts
      sendVerificationOTP: async ({ email, otp, type }, ctx) => {
        fireAndForget(deliverOtpEmail({ email, otp, type, headers: ctx?.request?.headers ?? ctx?.headers }));
      },
    }),
    // Platform super-admin = user.role "admin". Not the same as member.role "admin" (institution admin).
    // "protocol_editor" is a platform role with no admin-plugin permission (lib/permissions.ts).
    admin({
      roles: platformRoles,
      defaultRole: "user",
      adminRoles: ["admin"],
      impersonationSessionDuration: 60 * 60,
    }),
    organization({
      ac,
      roles: orgRoles,
      creatorRole: "owner",
      // Institutions are created by platform admins (admin panel), not by self-service users.
      allowUserToCreateOrganization: async (user) => user.role === "admin",
      invitationExpiresIn: INVITATION_EXPIRES_SECONDS,
      cancelPendingInvitationsOnReInvite: true,
      requireEmailVerificationOnInvitation: true,
      // Better Auth's defaults (100 members, 100 pending invitations) are too low for a hospital.
      membershipLimit: 5000,
      invitationLimit: 500,
      // teams = departments. An institution may delete its last department (there is no product reason to keep one).
      teams: { enabled: true, defaultTeam: { enabled: false }, allowRemovingAllTeams: true, maximumTeams: 200 },
      // /organization/delete answers 404 ORGANIZATION_DELETION_DISABLED for everyone. Deleting an institution
      // wipes its scans, photos and audit history, so only platform admins do it, from the admin panel, through
      // deleteOrganizationWithData() (lib/data-lifecycle.ts). Institution owners cannot (PRODUCT 2, 6a).
      disableOrganizationDeletion: true,
      schema: {
        organization: {
          additionalFields: {
            // `name` holds the Arabic name (crosscheck D13); nameEn is the English one.
            nameEn: { type: "string", required: false, input: true },
            type: { type: [...ORGANIZATION_TYPES], required: false, input: true },
            // Platform admins can suspend an institution (PRODUCT 6a); features hide suspended orgs.
            suspended: { type: "boolean", required: false, defaultValue: false, input: false },
          },
        },
      },
      sendInvitationEmail: async ({ id, email, role, organization: org, inviter }, request) => {
        fireAndForget(
          deliverInvitationEmail({
            invitationId: id,
            email,
            role,
            organizationName: org.name,
            inviterName: inviter.user.name,
            headers: request?.headers,
          }),
        );
      },
    }),
    i18n({
      defaultLocale: "ar",
      // User's saved locale first, then the page the request came from (/ar/... or /en/...).
      // Never Accept-Language: a hospital PC sending "en" would get English errors on /ar (crosscheck C5).
      detection: ["session", "callback"],
      userLocaleField: "locale",
      getLocale: (ctx) => localeFromHeaders(ctx.request?.headers ?? ctx.headers),
      translations: AUTH_TRANSLATIONS,
    }),
    nextCookies(), // must stay LAST
  ],
});

// Requests to paths that are not endpoints share one rate-limit row per client and rule (lib/auth-rate-limit.ts).
setAuthEndpointPaths(Object.values(auth.api).map((endpoint) => (endpoint as { path?: unknown }).path));

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
