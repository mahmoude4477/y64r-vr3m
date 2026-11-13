import "server-only";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import { TIME_ZONE } from "@/i18n/formats";
import { clipText } from "@/lib/org/display";
import { inviteState } from "@/lib/org/invite-state";
import { memberRole } from "@/lib/org/roles";
import { ORG_NAME_MAX } from "@/lib/org/schemas";
import type { OrgRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/session";
import { type SessionView, toSessionView } from "./sessions";

// Reads behind /settings. Everything is scoped to the signed-in user (ctx from requireUser(), never an id from the
// URL or the client). Session rows are read without `token` and `ipAddress`: the page shows device and dates only.

/** Other sessions listed by name (newest activity first); "sign out other sessions" covers the rest too. */
export const OTHER_SESSIONS_SHOWN = 20;
/** Invitations to the user's address listed on the page (the e-mail has each link too). */
export const INVITATIONS_SHOWN = 10;

/** Institution names as shown (clipped to the form limit, lib/org/display.ts clipText). */
const orgName = (name: string) => clipText(name, ORG_NAME_MAX);

export type SettingsProfile = {
  name: string;
  email: string;
  emailVerified: boolean;
  profession: string | null;
  /** The saved language, null when the column holds something else (old rows). */
  locale: AppLocale | null;
  createdAt: Date;
  isPlatformAdmin: boolean;
};

export type SettingsMembership = {
  organizationId: string;
  name: string;
  nameEn: string | null;
  type: string | null;
  /** null = no Waqaya role in that institution (no access there). */
  role: OrgRole | null;
  joinedAt: Date;
  /** Suspended by the platform: it cannot be the active institution (lib/auth.ts refuses set-active). */
  suspended: boolean;
  /** The active institution of this session (getAuthContext: a member, not suspended). */
  active: boolean;
};

export type SettingsInvitation = {
  id: string;
  organizationName: string;
  organizationNameEn: string | null;
  role: OrgRole;
  expiresAt: Date;
};

export type SettingsData = {
  profile: SettingsProfile;
  /** When the password was last set (the credential account row), null without one. */
  passwordUpdatedAt: Date | null;
  sessions: {
    current: SessionView;
    others: SessionView[];
    /** Other active sessions beyond OTHER_SESSIONS_SHOWN. */
    hiddenCount: number;
  };
  /** This request is a platform admin acting as the user. */
  impersonating: boolean;
  memberships: SettingsMembership[];
  /** Invitations to the user's address that can be accepted now (lib/org/invite-state.ts "open"). */
  invitations: SettingsInvitation[];
};

export async function getSettingsData(ctx: AuthContext, now: Date = new Date()): Promise<SettingsData> {
  const userId = ctx.user.id;
  const active = { userId, expiresAt: { gt: now } };
  const [credential, otherSessions, otherCount, memberships, invitationRows] = await Promise.all([
    prisma.account.findFirst({ where: { userId, providerId: "credential" }, select: { updatedAt: true } }),
    prisma.session.findMany({
      where: { ...active, id: { not: ctx.session.id } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: OTHER_SESSIONS_SHOWN,
      select: { id: true, createdAt: true, updatedAt: true, userAgent: true, impersonatedBy: true },
    }),
    prisma.session.count({ where: { ...active, id: { not: ctx.session.id } } }),
    prisma.member.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        createdAt: true,
        organization: { select: { id: true, name: true, nameEn: true, type: true, suspended: true } },
      },
    }),
    prisma.invitation.findMany({
      // Better Auth stores invitation addresses in lower case; the account address may not be.
      where: { email: { equals: ctx.user.email, mode: "insensitive" }, status: "pending", expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      take: INVITATIONS_SHOWN,
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        inviterId: true,
        organization: { select: { id: true, name: true, nameEn: true, suspended: true } },
      },
    }),
  ]);

  // Whether each inviter is still a member (Better Auth refuses an invitation whose inviter left), in one query.
  const inviters = invitationRows.length
    ? await prisma.member.findMany({
        where: { OR: invitationRows.map((inv) => ({ organizationId: inv.organization.id, userId: inv.inviterId })) },
        select: { organizationId: true, userId: true },
      })
    : [];
  const inviterKeys = new Set(inviters.map((m) => `${m.organizationId}:${m.userId}`));
  const memberOf = new Set(memberships.map((m) => m.organization.id));

  const view = { currentId: ctx.session.id, now, timeZone: TIME_ZONE };
  const s = ctx.session as AuthContext["session"] & { impersonatedBy?: string | null; userAgent?: string | null };
  const user = ctx.user as AuthContext["user"] & { profession?: string | null; locale?: string | null };

  return {
    profile: {
      name: user.name,
      email: user.email,
      emailVerified: !!user.emailVerified,
      profession: user.profession?.trim() ? user.profession : null,
      locale: isAppLocale(user.locale) ? user.locale : null,
      createdAt: user.createdAt,
      isPlatformAdmin: ctx.isPlatformAdmin,
    },
    passwordUpdatedAt: credential?.updatedAt ?? null,
    sessions: {
      current: toSessionView(
        { id: s.id, createdAt: s.createdAt, updatedAt: s.updatedAt, userAgent: s.userAgent ?? null, impersonatedBy: s.impersonatedBy ?? null },
        view,
      ),
      others: otherSessions.map((row) => toSessionView(row, view)),
      hiddenCount: Math.max(0, otherCount - otherSessions.length),
    },
    impersonating: !!s.impersonatedBy,
    memberships: memberships.map((m) => ({
      organizationId: m.organization.id,
      name: orgName(m.organization.name),
      nameEn: m.organization.nameEn === null ? null : orgName(m.organization.nameEn),
      type: m.organization.type,
      role: memberRole(m.role),
      joinedAt: m.createdAt,
      suspended: m.organization.suspended === true,
      active: m.organization.id === ctx.organizationId,
    })),
    // Only invitations the user can accept now (the same rule as /invite/<id>), so each has a Waqaya role.
    invitations: invitationRows.flatMap((inv) => {
      const role = memberRole(inv.role);
      const state = inviteState(
        {
          status: inv.status,
          expiresAt: inv.expiresAt,
          email: inv.email,
          inviterIsMember: inviterKeys.has(`${inv.organization.id}:${inv.inviterId}`),
          organizationSuspended: inv.organization.suspended === true,
          roleKnown: role !== null,
        },
        { email: ctx.user.email, isMember: memberOf.has(inv.organization.id) },
        now,
      );
      if (state !== "open" || role === null) return [];
      return [
        {
          id: inv.id,
          organizationName: orgName(inv.organization.name),
          organizationNameEn: inv.organization.nameEn === null ? null : orgName(inv.organization.nameEn),
          role,
          expiresAt: inv.expiresAt,
        },
      ];
    }),
  };
}
