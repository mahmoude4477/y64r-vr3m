import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { deletionBlockers, type DeletionBlocker } from "@/lib/account/deletion-rules";
import { auditImpersonating } from "@/lib/admin/audit-display";
import { PAGE_SIZE, pageOffset } from "@/lib/admin/params";
import { daysAgo, riyadhDayStart, riyadhMonthStart } from "@/lib/admin/time";
import { strongestOrgRole, type OrgRole, type OrganizationType, ORGANIZATION_TYPES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Read queries of the platform admin panel. Platform-admin pages query WITHOUT the org scoping of lib/authz.ts
// (CONVENTIONS 4): every caller must have called requirePlatformAdmin() first. Nothing here selects a password
// hash, a session token or an account secret. All numbers come from the database (no mock data).
//
// Queries run one after another, never as a Promise.all fan-out: the page's Suspense boundaries already load in
// parallel, and a fan-out of twenty counts per page view held the whole pool (DATABASE_POOL_MAX, 10 by default) and
// timed out under load in the e2e run. The overview's numbers come from one query (overviewTotals).

const notSuspended: Prisma.OrganizationWhereInput = { OR: [{ suspended: false }, { suspended: null }] };
const hasOwner: Prisma.MemberWhereInput = { role: { contains: "owner" } };

/** A ban that is in force now (Better Auth lifts an expired ban at the next sign-in). */
function activeBanWhere(now: Date): Prisma.UserWhereInput {
  return { banned: true, OR: [{ banExpires: null }, { banExpires: { gt: now } }] };
}
function noActiveBanWhere(now: Date): Prisma.UserWhereInput {
  return { OR: [{ banned: false }, { banned: null }, { banExpires: { lte: now } }] };
}

export function orgTypeOf(value: string | null | undefined): OrganizationType | null {
  return (ORGANIZATION_TYPES as readonly string[]).includes(value ?? "") ? (value as OrganizationType) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------------------------------------------

type AiPeriod = { calls: number; costUsd: number; failed: number };

export type OverviewTotals = {
  users: { total: number; newThisMonth: number; admins: number; banned: number; unverified: number };
  organizations: { total: number; suspended: number; withoutOwner: number };
  attempts: { completed: number; thisMonth: number; inProgress: number };
  scans: { finalized: number; thisMonth: number; inReview: number };
  ai: { today: AiPeriod; month: AiPeriod };
};

type TotalsRow = Record<
  | "usersTotal"
  | "usersNew"
  | "usersAdmins"
  | "usersBanned"
  | "usersUnverified"
  | "orgsTotal"
  | "orgsSuspended"
  | "orgsNoOwner"
  | "attemptsCompleted"
  | "attemptsMonth"
  | "attemptsInProgress"
  | "scansFinalized"
  | "scansMonth"
  | "scansInReview"
  | "aiTodayCalls"
  | "aiTodayFailed"
  | "aiMonthCalls"
  | "aiMonthFailed",
  bigint | number
> & { aiTodayCost: unknown; aiMonthCost: unknown };

const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));

/**
 * Every number of the overview cards in ONE query (scalar sub-selects): one pooled connection and one round trip per
 * page view instead of about twenty counts. Days and months are Riyadh calendar periods (lib/admin/time.ts), the same
 * rule as the daily AI limit. Same rules as the list filters: a ban in force has no end or ends later; an
 * institution without an owner has no member whose role list contains "owner". Column names are the Prisma field
 * names (no @map on these models).
 */
export async function overviewTotals(now = new Date()): Promise<OverviewTotals> {
  const day = riyadhDayStart(now);
  const month = riyadhMonthStart(now);
  const [row] = await prisma.$queryRaw<TotalsRow[]>`
    SELECT
      (SELECT count(*) FROM "user") AS "usersTotal",
      (SELECT count(*) FROM "user" WHERE "createdAt" >= ${month}) AS "usersNew",
      (SELECT count(*) FROM "user" WHERE "role" LIKE '%admin%') AS "usersAdmins",
      (SELECT count(*) FROM "user" WHERE "banned" = true AND ("banExpires" IS NULL OR "banExpires" > ${now})) AS "usersBanned",
      (SELECT count(*) FROM "user" WHERE "emailVerified" = false) AS "usersUnverified",
      (SELECT count(*) FROM "organization") AS "orgsTotal",
      (SELECT count(*) FROM "organization" WHERE "suspended" = true) AS "orgsSuspended",
      (SELECT count(*) FROM "organization" o
        WHERE NOT EXISTS (SELECT 1 FROM "member" m WHERE m."organizationId" = o."id" AND m."role" LIKE '%owner%')) AS "orgsNoOwner",
      (SELECT count(*) FROM "simulation_attempt" WHERE "status" = 'completed') AS "attemptsCompleted",
      (SELECT count(*) FROM "simulation_attempt" WHERE "status" = 'completed' AND "completedAt" >= ${month}) AS "attemptsMonth",
      (SELECT count(*) FROM "simulation_attempt" WHERE "status" = 'in_progress') AS "attemptsInProgress",
      (SELECT count(*) FROM "scan" WHERE "status" = 'finalized') AS "scansFinalized",
      (SELECT count(*) FROM "scan" WHERE "status" = 'finalized' AND "finalizedAt" >= ${month}) AS "scansMonth",
      (SELECT count(*) FROM "scan" WHERE "status" = 'review') AS "scansInReview",
      (SELECT count(*) FROM "ai_call" WHERE "createdAt" >= ${day}) AS "aiTodayCalls",
      (SELECT coalesce(sum("costUsd"), 0) FROM "ai_call" WHERE "createdAt" >= ${day}) AS "aiTodayCost",
      (SELECT count(*) FROM "ai_call" WHERE "createdAt" >= ${day} AND "status" IN ('error', 'refused')) AS "aiTodayFailed",
      (SELECT count(*) FROM "ai_call" WHERE "createdAt" >= ${month}) AS "aiMonthCalls",
      (SELECT coalesce(sum("costUsd"), 0) FROM "ai_call" WHERE "createdAt" >= ${month}) AS "aiMonthCost",
      (SELECT count(*) FROM "ai_call" WHERE "createdAt" >= ${month} AND "status" IN ('error', 'refused')) AS "aiMonthFailed"
  `;
  return {
    users: {
      total: num(row.usersTotal),
      newThisMonth: num(row.usersNew),
      admins: num(row.usersAdmins),
      banned: num(row.usersBanned),
      unverified: num(row.usersUnverified),
    },
    organizations: { total: num(row.orgsTotal), suspended: num(row.orgsSuspended), withoutOwner: num(row.orgsNoOwner) },
    attempts: { completed: num(row.attemptsCompleted), thisMonth: num(row.attemptsMonth), inProgress: num(row.attemptsInProgress) },
    scans: { finalized: num(row.scansFinalized), thisMonth: num(row.scansMonth), inReview: num(row.scansInReview) },
    ai: {
      today: { calls: num(row.aiTodayCalls), costUsd: num(row.aiTodayCost), failed: num(row.aiTodayFailed) },
      month: { calls: num(row.aiMonthCalls), costUsd: num(row.aiMonthCost), failed: num(row.aiMonthFailed) },
    },
  };
}

export type RiskCounts = { low: number; medium: number; high: number; notAssessable: number; total: number };

function riskCounts(rows: Array<{ riskLevel: "low" | "medium" | "high" | null; _count: { _all: number } }>): RiskCounts {
  const out: RiskCounts = { low: 0, medium: 0, high: 0, notAssessable: 0, total: 0 };
  for (const row of rows) {
    const n = row._count._all;
    if (row.riskLevel === null) out.notAssessable += n;
    else out[row.riskLevel] += n;
    out.total += n;
  }
  return out;
}

/** Risk levels of every completed simulation attempt and every finalised scan on the platform. */
/** How many institutions this user (the viewing platform admin) is a member of: access that is separate from the platform role. */
export async function membershipCount(userId: string): Promise<number> {
  const rows = await prisma.member.findMany({ where: { userId }, distinct: ["organizationId"], select: { organizationId: true } });
  return rows.length;
}

export async function riskDistribution() {
  const attempts = await prisma.simulationAttempt.groupBy({ by: ["riskLevel"], where: { status: "completed" }, _count: { _all: true } });
  const scans = await prisma.scan.groupBy({ by: ["riskLevel"], where: { status: "finalized" }, _count: { _all: true } });
  return { attempts: riskCounts(attempts), scans: riskCounts(scans) };
}

export type ActivityRow = {
  id: string;
  action: string;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  actorDeleted: boolean;
  actor: { name: string } | null;
  meta: Prisma.JsonValue;
  target:
    | { type: "user" | "organization"; id: string; name: string | null; nameEn?: string | null; exists: boolean }
    | { type: "other"; label: string }
    | null;
  /** The user the admin was acting as (meta.impersonating); name null when that account no longer exists. */
  impersonating: { id: string; name: string | null; exists: boolean } | null;
};

type ActivitySource = {
  id: string;
  action: string;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  actorDeleted: boolean;
  targetType: string | null;
  targetId: string | null;
  meta: Prisma.JsonValue;
  actor: { name: string } | null;
};

/** The user and institution ids a page of audit rows points at (targets and meta.impersonating). */
export function activityLookups(rows: readonly ActivitySource[]): { userIds: string[]; orgIds: string[] } {
  const userIds = new Set<string>();
  const orgIds = new Set<string>();
  for (const r of rows) {
    if (r.targetType === "user" && r.targetId) userIds.add(r.targetId);
    if (r.targetType === "organization" && r.targetId) orgIds.add(r.targetId);
    const imp = auditImpersonating(r.meta);
    if (imp) userIds.add(imp);
  }
  return { userIds: [...userIds], orgIds: [...orgIds] };
}

/**
 * Audit rows as overview activity, with the names they point at. A row whose target is its own actor while acting as
 * someone (stop-impersonating: the admin ends their own impersonation) shows only the user they were acting as: the
 * actor is already named at the start of the line.
 */
export function toActivityRows(
  rows: readonly ActivitySource[],
  userName: ReadonlyMap<string, string>,
  orgById: ReadonlyMap<string, { name: string; nameEn: string | null }>,
): ActivityRow[] {
  return rows.map((r) => {
    const impId = auditImpersonating(r.meta);
    const impersonating = impId ? { id: impId, name: userName.get(impId) ?? null, exists: userName.has(impId) } : null;
    let target: ActivityRow["target"] = null;
    if (r.targetType === "user" && r.targetId) {
      const self = impersonating !== null && r.targetId === r.actorId;
      target = self ? null : { type: "user", id: r.targetId, name: userName.get(r.targetId) ?? null, exists: userName.has(r.targetId) };
    } else if (r.targetType === "organization" && r.targetId) {
      const org = orgById.get(r.targetId);
      target = { type: "organization", id: r.targetId, name: org?.name ?? null, nameEn: org?.nameEn ?? null, exists: !!org };
    } else if (r.targetType) {
      target = { type: "other", label: r.targetType };
    }
    return {
      id: r.id,
      action: r.action,
      createdAt: r.createdAt,
      actorId: r.actorId,
      actorName: r.actorName,
      actorDeleted: r.actorDeleted,
      actor: r.actor,
      meta: r.meta,
      target,
      impersonating,
    };
  });
}

/** The newest audit rows, with the names of the users / institutions they point at (when those still exist). */
export async function latestActivity(take = 8): Promise<ActivityRow[]> {
  const rows = await prisma.auditLog.findMany({
    take,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      action: true,
      createdAt: true,
      actorId: true,
      actorName: true,
      actorDeleted: true,
      targetType: true,
      targetId: true,
      meta: true,
      actor: { select: { name: true } },
    },
  });
  const { userIds, orgIds } = activityLookups(rows);
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const orgs = orgIds.length
    ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, nameEn: true } })
    : [];
  return toActivityRows(rows, new Map(users.map((u) => [u.id, u.name])), new Map(orgs.map((o) => [o.id, o])));
}

// ---------------------------------------------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------------------------------------------

export const USER_ROLE_FILTERS = ["all", "admin", "user"] as const;
export type UserRoleFilter = (typeof USER_ROLE_FILTERS)[number];
export const USER_STATUS_FILTERS = ["all", "active", "banned", "unverified"] as const;
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];

export type UserListFilters = { q: string; role: UserRoleFilter; status: UserStatusFilter; page: number };

export function userListWhere(filters: Omit<UserListFilters, "page">, now = new Date()): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];
  if (filters.q) {
    and.push({
      OR: [{ name: { contains: filters.q, mode: "insensitive" } }, { email: { contains: filters.q, mode: "insensitive" } }],
    });
  }
  if (filters.role === "admin") and.push({ role: { contains: "admin" } });
  if (filters.role === "user") and.push({ OR: [{ role: null }, { NOT: { role: { contains: "admin" } } }] });
  if (filters.status === "banned") and.push(activeBanWhere(now));
  if (filters.status === "unverified") and.push({ emailVerified: false });
  if (filters.status === "active") and.push({ emailVerified: true }, noActiveBanWhere(now));
  return and.length ? { AND: and } : {};
}

export type UserListRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  bannedNow: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  memberships: number;
};

export async function listUsers(filters: UserListFilters, now = new Date()) {
  const where = userListWhere(filters, now);
  const total = await prisma.user.count({ where });
  const { page, skip } = pageOffset(filters.page, total);
  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      role: true,
      banned: true,
      banExpires: true,
      mustChangePassword: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });
  const users: UserListRow[] = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified,
    role: u.role,
    bannedNow: !!u.banned && (!u.banExpires || u.banExpires > now),
    mustChangePassword: !!u.mustChangePassword,
    createdAt: u.createdAt,
    memberships: u._count.members,
  }));
  return { users, total, page };
}

export type UserSessionRow = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  impersonated: boolean;
};

export async function getUserDetail(userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      banned: true,
      banReason: true,
      banExpires: true,
      locale: true,
      profession: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) return null;
  const members = await prisma.member.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      createdAt: true,
      organization: { select: { id: true, name: true, nameEn: true, suspended: true } },
    },
  });
  // Never the token: the admin revokes a session by its id (the action looks the token up on the server).
  const sessionRows = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, createdAt: true, updatedAt: true, expiresAt: true, ipAddress: true, userAgent: true, impersonatedBy: true },
  });
  const passwordAccounts = await prisma.account.count({ where: { userId, providerId: "credential" } });

  const last30 = daysAgo(30, now);
  const attempts = await prisma.simulationAttempt.count({ where: { userId, status: "completed" } });
  const attempts30 = await prisma.simulationAttempt.count({ where: { userId, status: "completed", completedAt: { gte: last30 } } });
  const scans = await prisma.scan.count({ where: { examinerId: userId } });
  const scans30 = await prisma.scan.count({ where: { examinerId: userId, createdAt: { gte: last30 } } });
  const aiCalls30 = await prisma.aiCall.count({ where: { userId, createdAt: { gte: last30 } } });
  const blockers = await deletionBlockers(userId);

  const sessions: UserSessionRow[] = sessionRows.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    expiresAt: s.expiresAt,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    impersonated: !!s.impersonatedBy,
  }));

  return {
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      role: user.role,
      banned: !!user.banned,
      bannedNow: !!user.banned && (!user.banExpires || user.banExpires > now),
      banReason: user.banReason,
      banExpires: user.banExpires,
      locale: user.locale,
      profession: user.profession,
      mustChangePassword: !!user.mustChangePassword,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      hasPassword: passwordAccounts > 0,
    },
    memberships: members.map((m) => ({
      id: m.id,
      role: strongestOrgRole(m.role),
      joinedAt: m.createdAt,
      organization: { ...m.organization, suspended: !!m.organization.suspended },
    })),
    sessions,
    activity: { attempts, attempts30, scans, scans30, aiCalls30 },
    blockers: blockers satisfies DeletionBlocker[],
  };
}

export type UserDetail = NonNullable<Awaited<ReturnType<typeof getUserDetail>>>;

// ---------------------------------------------------------------------------------------------------------------
// Institutions
// ---------------------------------------------------------------------------------------------------------------

/** "mine": the institutions the viewing platform admin is a member of (from creating or joining them). */
export const ORG_STATUS_FILTERS = ["all", "active", "suspended", "no_owner", "mine"] as const;
export type OrgStatusFilter = (typeof ORG_STATUS_FILTERS)[number];

export type OrgListFilters = { q: string; status: OrgStatusFilter; page: number };

export function organizationListWhere(filters: Omit<OrgListFilters, "page">, viewerUserId: string): Prisma.OrganizationWhereInput {
  const and: Prisma.OrganizationWhereInput[] = [];
  if (filters.q) {
    and.push({
      OR: [
        { name: { contains: filters.q, mode: "insensitive" } },
        { nameEn: { contains: filters.q, mode: "insensitive" } },
        { slug: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.status === "active") and.push(notSuspended);
  if (filters.status === "suspended") and.push({ suspended: true });
  if (filters.status === "no_owner") and.push({ members: { none: hasOwner } });
  if (filters.status === "mine") and.push({ members: { some: { userId: viewerUserId } } });
  return and.length ? { AND: and } : {};
}

export type OrgListRow = {
  id: string;
  name: string;
  nameEn: string | null;
  type: OrganizationType | null;
  suspended: boolean;
  createdAt: Date;
  members: number;
  departments: number;
  hasOwner: boolean;
  pendingInvitations: number;
  /** The viewing platform admin's own role there, when they are a member (null: not a member). */
  viewerRole: OrgRole | null;
};

export async function listOrganizations(filters: OrgListFilters, viewerUserId: string, now = new Date()) {
  const where = organizationListWhere(filters, viewerUserId);
  const total = await prisma.organization.count({ where });
  const { page, skip } = pageOffset(filters.page, total);
  const rows = await prisma.organization.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      nameEn: true,
      type: true,
      suspended: true,
      createdAt: true,
      _count: { select: { members: true, teams: true } },
    },
  });
  const ids = rows.map((o) => o.id);
  const owned = ids.length
    ? await prisma.member.findMany({
        where: { organizationId: { in: ids }, ...hasOwner },
        distinct: ["organizationId"],
        select: { organizationId: true },
      })
    : [];
  const pending = ids.length
    ? await prisma.invitation.groupBy({
        by: ["organizationId"],
        where: { organizationId: { in: ids }, status: "pending", expiresAt: { gt: now } },
        _count: { _all: true },
      })
    : [];
  const own = ids.length
    ? await prisma.member.findMany({ where: { organizationId: { in: ids }, userId: viewerUserId }, select: { organizationId: true, role: true } })
    : [];
  const withOwner = new Set(owned.map((m) => m.organizationId));
  const pendingByOrg = new Map(pending.map((p) => [p.organizationId, p._count._all]));
  // Every role of the viewer there (a duplicate member row of the same person counts too): the strongest one is shown.
  const viewerRoles = new Map<string, string>();
  for (const m of own) viewerRoles.set(m.organizationId, [viewerRoles.get(m.organizationId), m.role].filter(Boolean).join(","));
  const organizations: OrgListRow[] = rows.map((o) => ({
    id: o.id,
    name: o.name,
    nameEn: o.nameEn,
    type: orgTypeOf(o.type),
    suspended: !!o.suspended,
    createdAt: o.createdAt,
    members: o._count.members,
    departments: o._count.teams,
    hasOwner: withOwner.has(o.id),
    pendingInvitations: pendingByOrg.get(o.id) ?? 0,
    viewerRole: strongestOrgRole(viewerRoles.get(o.id)),
  }));
  return { organizations, total, page };
}

export type OrgMemberRow = {
  id: string;
  role: OrgRole | null;
  rawRole: string;
  joinedAt: Date;
  user: { id: string; name: string; email: string; bannedNow: boolean };
  /** Pending invitations this member sent here: they stop working when the member leaves (Better Auth rule). */
  pendingInvitationsSent: number;
};

export type OrgInvitationRow = {
  id: string;
  email: string;
  role: OrgRole | null;
  createdAt: Date;
  expiresAt: Date;
  expired: boolean;
  inviter: { id: string; name: string } | null;
  /** get-invitation refuses an invitation whose inviter is no longer a member (INVITER_IS_NO_LONGER_A_MEMBER). */
  inviterIsMember: boolean;
};

export async function getOrganizationDetail(organizationId: string, viewerUserId: string, now = new Date()) {
  // One query after another (each with at most one relation): a nested select of every relation made Prisma load
  // them in parallel, several pooled connections for one page view.
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, nameEn: true, slug: true, type: true, suspended: true, createdAt: true },
  });
  if (!org) return null;
  const memberRows = await prisma.member.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true, banned: true, banExpires: true } } },
  });
  const invitationRows = await prisma.invitation.findMany({
    where: { organizationId, status: "pending" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, email: true, role: true, createdAt: true, expiresAt: true, inviterId: true, user: { select: { id: true, name: true } } },
  });
  const teams = await prisma.team.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, memberCount: true, createdAt: true },
  });
  const scans = await prisma.scan.count({ where: { organizationId } });
  const attempts = await prisma.simulationAttempt.count({ where: { organizationId } });

  // Pending invitations each member sent here: they stop working when that member leaves (Better Auth rule).
  const sentByMember = new Map<string, number>();
  for (const i of invitationRows) {
    if (i.expiresAt > now) sentByMember.set(i.inviterId, (sentByMember.get(i.inviterId) ?? 0) + 1);
  }
  const memberUserIds = new Set(memberRows.map((m) => m.user.id));
  const members: OrgMemberRow[] = memberRows.map((m) => ({
    id: m.id,
    role: strongestOrgRole(m.role),
    rawRole: m.role,
    joinedAt: m.createdAt,
    user: {
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      bannedNow: !!m.user.banned && (!m.user.banExpires || m.user.banExpires > now),
    },
    pendingInvitationsSent: sentByMember.get(m.user.id) ?? 0,
  }));
  const invitations: OrgInvitationRow[] = invitationRows.map((i) => ({
    id: i.id,
    email: i.email,
    role: strongestOrgRole(i.role),
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    expired: i.expiresAt <= now,
    inviter: { id: i.user.id, name: i.user.name },
    inviterIsMember: memberUserIds.has(i.inviterId),
  }));
  const viewer = members.find((m) => m.user.id === viewerUserId) ?? null;

  return {
    organization: { ...org, type: orgTypeOf(org.type), suspended: !!org.suspended },
    members,
    invitations,
    departments: teams,
    counts: {
      members: members.length,
      owners: members.filter((m) => m.rawRole.split(",").some((r) => r.trim() === "owner")).length,
      pendingInvitations: invitations.filter((i) => !i.expired).length,
      departments: teams.length,
      scans,
      attempts,
    },
    viewer: viewer ? { memberId: viewer.id, role: viewer.role } : null,
  };
}

export type OrganizationDetail = NonNullable<Awaited<ReturnType<typeof getOrganizationDetail>>>;
