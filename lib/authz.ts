/**
 * Organization scoping for Prisma queries. Features build EVERY read/write where-clause from these
 * helpers so no query forgets organizationId. Pure functions (no DB, no session) and unit-tested.
 *
 *   const ctx = await requireUser();                     // lib/session.ts
 *   const scope = scopeOf(ctx);
 *   prisma.protocol.findMany({ where: protocolsReadable(scope) })
 *   prisma.scan.findFirst({ where: { id, ...scansReadable(scope) } })   // by-id reads too!
 *
 * Platform-admin pages (/admin) intentionally query without these filters, after requirePlatformAdmin().
 */
import type { Prisma } from "@/generated/prisma/client";
import { ORG_MANAGER_ROLES, ORG_STAFF_ROLES, type OrgRole } from "@/lib/permissions";

export type Scope = {
  userId: string;
  /** Active organization (null = individual user). */
  organizationId: string | null;
  orgRole: OrgRole | null;
  isPlatformAdmin: boolean;
  /** Platform admin or protocol editor: may edit global protocols (lib/protocols/editor-scope.ts). */
  isContentEditor?: boolean;
};

export function scopeOf(ctx: {
  user: { id: string };
  organizationId: string | null;
  orgRole: OrgRole | null;
  isPlatformAdmin: boolean;
  isContentEditor?: boolean;
}): Scope {
  return {
    userId: ctx.user.id,
    organizationId: ctx.organizationId,
    orgRole: ctx.organizationId ? ctx.orgRole : null,
    isPlatformAdmin: ctx.isPlatformAdmin,
    isContentEditor: ctx.isContentEditor ?? ctx.isPlatformAdmin,
  };
}

export class ForbiddenError extends Error {
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Owner or admin of the active organization. */
export function isOrgManager(scope: Scope): boolean {
  return !!scope.organizationId && !!scope.orgRole && (ORG_MANAGER_ROLES as readonly string[]).includes(scope.orgRole);
}

/** Owner, admin or examiner of the active organization (sees institution-wide data). */
export function isOrgStaff(scope: Scope): boolean {
  return !!scope.organizationId && !!scope.orgRole && (ORG_STAFF_ROLES as readonly string[]).includes(scope.orgRole);
}

/** { organizationId } of the active org, or throws ForbiddenError (use for org-owned creates/updates). */
export function requireOrgScope(scope: Scope): { organizationId: string } {
  if (!scope.organizationId) throw new ForbiddenError("no active organization");
  return { organizationId: scope.organizationId };
}

/** Throws unless `organizationId` (of a row you loaded) is the active org. Global rows (null) fail too. */
export function assertSameOrg(scope: Scope, organizationId: string | null | undefined): void {
  if (!scope.organizationId || organizationId !== scope.organizationId) throw new ForbiddenError("other organization");
}

// A where-clause that matches nothing (Prisma has no literal false).
const NOTHING = { id: { in: [] as string[] } };

/**
 * Protocols a user may read: published global ones + their active org's protocols
 * (managers also see the org's unpublished drafts).
 */
export function protocolsReadable(scope: Scope): Prisma.ProtocolWhereInput {
  const or: Prisma.ProtocolWhereInput[] = [{ organizationId: null, isPublished: true }];
  if (scope.organizationId) {
    or.push(isOrgManager(scope) ? { organizationId: scope.organizationId } : { organizationId: scope.organizationId, isPublished: true });
  }
  return { OR: or };
}

/** Org custom protocols the user may edit (managers of the active org only). */
export function protocolsEditable(scope: Scope): Prisma.ProtocolWhereInput {
  return isOrgManager(scope) ? { organizationId: scope.organizationId } : NOTHING;
}

/** Scenarios a user may play: published global ones + published ones of the active org. */
export function scenariosReadable(scope: Scope): Prisma.ScenarioWhereInput {
  const or: Prisma.ScenarioWhereInput[] = [{ organizationId: null, isPublished: true }];
  if (scope.organizationId) or.push({ organizationId: scope.organizationId, isPublished: true });
  return { OR: or, protocol: { is: protocolsReadable(scope) } };
}

/** The user's own attempts (personal history). */
export function attemptsOwn(scope: Scope): Prisma.SimulationAttemptWhereInput {
  return { userId: scope.userId };
}

/** Attempts visible in institution views: staff see the active org's attempts; others only their own. */
export function attemptsReadable(scope: Scope): Prisma.SimulationAttemptWhereInput {
  if (isOrgStaff(scope)) return { OR: [{ organizationId: scope.organizationId }, { userId: scope.userId }] };
  return { userId: scope.userId };
}

/** The active organization when the user is staff there (owner/admin/examiner), else null. */
function staffOrganizationId(scope: Scope): string | null {
  return isOrgStaff(scope) ? scope.organizationId : null;
}

/**
 * Scans visible to the user: staff (owner/admin/examiner) of the ACTIVE organization see its scans; nobody
 * else sees any. Scans always belong to an organization (no personal scans), and there is deliberately no
 * "scans I examined" fallback: an examiner who is removed or demoted to trainee loses access, and staff of
 * org B never see their old org A scans in org B views (PRODUCT 7: membership + role on every read).
 * "My scans" = add `examinerId: scope.userId` on top of this.
 */
export function scansReadable(scope: Scope): Prisma.ScanWhereInput {
  const organizationId = staffOrganizationId(scope);
  return organizationId ? { organizationId } : NOTHING;
}

/** Scans the user may create / review / finalise / delete: staff of the active organization only. */
export function scansWritable(scope: Scope): Prisma.ScanWhereInput {
  const organizationId = staffOrganizationId(scope);
  return organizationId ? { organizationId } : NOTHING;
}

/**
 * Photos the user may view (the photo-view 302 route checks this): staff of the active organization see
 * its photos, including their own not-yet-attached uploads. Same rule as scansReadable.
 */
export function photosReadable(scope: Scope): Prisma.ScanPhotoWhereInput {
  const organizationId = staffOrganizationId(scope);
  return organizationId ? { organizationId } : NOTHING;
}

/** Departments (Better Auth teams) of the active organization. */
export function teamsReadable(scope: Scope): Prisma.TeamWhereInput {
  return scope.organizationId ? { organizationId: scope.organizationId } : NOTHING;
}
