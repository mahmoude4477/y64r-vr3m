import "server-only";
import type { OrgRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { NAME_MAX } from "@/lib/settings-feature/schemas";
import { clipText } from "./display";
import { type InvitationHealth, invitationHealth, isLiveInvitation } from "./invitation-status";
import { countByRole, memberRole } from "./roles";
import { DEPARTMENT_NAME_MAX, ORG_NAME_MAX } from "./schemas";

// Reads behind the /org pages and /invite/[id]. Every function takes the organization id from the caller's gate
// (getOrgAccess() -> ctx.organizationId, never from the URL or the client), so a read can only see the active
// institution. Writes do not live here: they go through Better Auth's organization endpoints (audited by lib/auth.ts).
// Names are clipped to the form limits (clipText): a name stored around the forms cannot make the pages heavy.

export type DepartmentRef = { id: string; name: string };

const personName = (name: string) => clipText(name, NAME_MAX);
const departmentName = (name: string) => clipText(name, DEPARTMENT_NAME_MAX);
const department = (t: DepartmentRef): DepartmentRef => ({ id: t.id, name: departmentName(t.name) });

/** The institution's names as shown on the pages (clipped to the form limit). */
export function orgNames<T extends { name: string; nameEn: string | null }>(org: T): T {
  return { ...org, name: clipText(org.name, ORG_NAME_MAX), nameEn: org.nameEn === null ? null : clipText(org.nameEn, ORG_NAME_MAX) };
}

export type OrgSummary = {
  id: string;
  name: string;
  nameEn: string | null;
  type: string | null;
  createdAt: Date;
  memberCount: number;
  roleCounts: Record<OrgRole, number>;
  /** Members with no Waqaya role (Better Auth's default "member", set around the UI): they have no access. */
  noRoleCount: number;
  departmentCount: number;
  /** Invitations still waiting for an answer: the same rule as the members page list (invitationHealth). */
  pendingInvitationCount: number;
};

export async function getOrgSummary(organizationId: string, now: Date = new Date()): Promise<OrgSummary | null> {
  const [org, members, departmentCount, pending] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, nameEn: true, type: true, createdAt: true },
    }),
    prisma.member.findMany({ where: { organizationId }, select: { role: true, userId: true } }),
    prisma.team.count({ where: { organizationId } }),
    prisma.invitation.findMany({
      where: { organizationId, status: "pending" },
      select: { role: true, expiresAt: true, inviterId: true },
    }),
  ]);
  if (!org) return null;
  const memberIds = new Set(members.map((m) => m.userId));
  const counts = countByRole(members.map((m) => memberRole(m.role)));
  const live = pending.filter((inv) =>
    isLiveInvitation(
      invitationHealth({ expiresAt: inv.expiresAt, inviterIsMember: memberIds.has(inv.inviterId), role: memberRole(inv.role) }, now),
    ),
  );
  return {
    ...orgNames(org),
    memberCount: members.length,
    roleCounts: counts.byRole,
    noRoleCount: counts.noRole,
    departmentCount,
    pendingInvitationCount: live.length,
  };
}

export type OrgMemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  /** null = no Waqaya role (no access): shown as such, and a manager can give a role. */
  role: OrgRole | null;
  joinedAt: Date;
  departments: DepartmentRef[];
};

export async function listMembers(organizationId: string): Promise<OrgMemberRow[]> {
  const rows = await prisma.member.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      createdAt: true,
      userId: true,
      user: {
        select: {
          name: true,
          email: true,
          // Departments are Better Auth teams; a user can be in teams of several institutions: only this one's.
          teammembers: { where: { team: { organizationId } }, select: { team: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: personName(m.user.name),
    email: m.user.email,
    role: memberRole(m.role),
    joinedAt: m.createdAt,
    departments: m.user.teammembers.map((tm) => department(tm.team)),
  }));
}

export type OrgInvitationRow = {
  id: string;
  email: string;
  /** null = no Waqaya role (created around the UI): it can only be canceled. */
  role: OrgRole | null;
  departments: DepartmentRef[];
  createdAt: Date;
  expiresAt: Date;
  inviterName: string | null;
  /** "live" = waiting for the invited person; anything else needs a new invitation (lib/org/invitation-status.ts). */
  health: InvitationHealth;
};

/** Pending invitations (also stale ones, until a manager sends them again or cancels them). */
export async function listPendingInvitations(organizationId: string, now: Date = new Date()): Promise<OrgInvitationRow[]> {
  const [rows, teams, members] = await Promise.all([
    prisma.invitation.findMany({
      where: { organizationId, status: "pending" },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, teamId: true, createdAt: true, expiresAt: true, inviterId: true, user: { select: { name: true } } },
    }),
    prisma.team.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.member.findMany({ where: { organizationId }, select: { userId: true } }),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const memberIds = new Set(members.map((m) => m.userId));
  return rows.map((inv) => {
    const role = memberRole(inv.role);
    return {
      id: inv.id,
      email: inv.email,
      role,
      departments: departmentsOf(inv.teamId, teamById),
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      inviterName: inv.user.name ? personName(inv.user.name) : null,
      health: invitationHealth({ expiresAt: inv.expiresAt, inviterIsMember: memberIds.has(inv.inviterId), role }, now),
    };
  });
}

export type OrgDepartmentRow = {
  id: string;
  name: string;
  createdAt: Date;
  members: Array<{ userId: string; name: string; email: string }>;
};

export async function listDepartments(organizationId: string): Promise<OrgDepartmentRow[]> {
  const rows = await prisma.team.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      // Only people who are still members of the institution (Better Auth removes team rows on remove-member, this
      // also hides anything left over).
      teammembers: {
        where: { user: { members: { some: { organizationId } } } },
        orderBy: { createdAt: "asc" },
        select: { userId: true, user: { select: { name: true, email: true } } },
      },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    name: departmentName(t.name),
    createdAt: t.createdAt,
    members: t.teammembers.map((tm) => ({ userId: tm.userId, name: personName(tm.user.name), email: tm.user.email })),
  }));
}

export async function listDepartmentRefs(organizationId: string): Promise<DepartmentRef[]> {
  const rows = await prisma.team.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  return rows.map(department);
}

/** Better Auth stores several team ids as "a,b". Unknown ids (a deleted department) are dropped. */
export function departmentsOf(teamIdField: string | null | undefined, teamById: Map<string, DepartmentRef>): DepartmentRef[] {
  if (!teamIdField) return [];
  return teamIdField
    .split(",")
    .map((id) => teamById.get(id.trim()))
    .filter((t): t is DepartmentRef => !!t)
    .map(department);
}

export type InvitationForPage = {
  id: string;
  email: string;
  role: OrgRole | null;
  status: string;
  expiresAt: Date;
  inviterName: string | null;
  inviterIsMember: boolean;
  viewerIsMember: boolean;
  departments: DepartmentRef[];
  organization: { id: string; name: string; nameEn: string | null; type: string | null; suspended: boolean };
};

/** Better Auth's invitation ids are 32 characters; anything much longer is not one of ours. */
const MAX_INVITATION_ID = 128;

/**
 * The invitation behind /invite/<id>, with what the page needs to decide its state (lib/org/invite-state.ts).
 * The id is an unguessable random string: knowing it is what lets a person see which institution invited them.
 */
export async function getInvitationForPage(id: string, viewerUserId: string | null): Promise<InvitationForPage | null> {
  if (!id || id.length > MAX_INVITATION_ID) return null;
  const inv = await prisma.invitation.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      teamId: true,
      inviterId: true,
      user: { select: { name: true } },
      organization: { select: { id: true, name: true, nameEn: true, type: true, suspended: true } },
    },
  });
  if (!inv) return null;
  const organizationId = inv.organization.id;
  const [inviter, viewer, teams] = await Promise.all([
    prisma.member.findFirst({ where: { organizationId, userId: inv.inviterId }, select: { id: true } }),
    viewerUserId ? prisma.member.findFirst({ where: { organizationId, userId: viewerUserId }, select: { id: true } }) : null,
    inv.teamId ? prisma.team.findMany({ where: { organizationId }, select: { id: true, name: true } }) : [],
  ]);
  return {
    id: inv.id,
    email: inv.email,
    role: memberRole(inv.role),
    status: inv.status,
    expiresAt: inv.expiresAt,
    inviterName: inv.user.name ? personName(inv.user.name) : null,
    inviterIsMember: !!inviter,
    viewerIsMember: !!viewer,
    departments: departmentsOf(inv.teamId, new Map(teams.map((t) => [t.id, t]))),
    organization: { ...orgNames(inv.organization), suspended: inv.organization.suspended === true },
  };
}
