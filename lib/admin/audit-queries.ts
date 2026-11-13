import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { auditOrganizationId, auditImpersonating } from "@/lib/admin/audit-display";
import { AUDIT_PAGE_SIZE, auditWhere, type AuditFilters } from "@/lib/admin/audit-filters";
import { pageOffset } from "@/lib/admin/params";
import { prisma } from "@/lib/prisma";

// Read queries of /admin/audit (PRODUCT 6a): the audit log, newest first, with the names of the users and
// institutions the rows point at while those still exist. Every caller has called requirePlatformAdmin(). Queries
// run one after another (no fan-out over the pool, see lib/admin/queries.ts). meta holds ids, codes and numbers only
// (CONVENTIONS 8: never secrets or e-mail addresses); the page still renders it as text.

export type AuditRow = {
  id: string;
  action: string;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  actorDeleted: boolean;
  actor: { name: string } | null;
  targetType: string;
  targetId: string | null;
  /** The target's current name for a user or an institution (null when it no longer exists, or another type). */
  targetName: string | null;
  targetNameEn: string | null;
  targetExists: boolean;
  /** The institution the row is about (target or meta.organizationId), when it still exists. */
  organization: { id: string; name: string; nameEn: string | null } | null;
  /** The user an admin was acting as (meta.impersonating), when that account still exists. */
  impersonating: { id: string; name: string } | null;
  impersonatingId: string | null;
  meta: Prisma.JsonValue;
  ip: string | null;
};

export async function listAudit(filters: AuditFilters) {
  const where = auditWhere(filters);
  const total = await prisma.auditLog.count({ where });
  const { page, skip } = pageOffset(filters.page, total, AUDIT_PAGE_SIZE);
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take: AUDIT_PAGE_SIZE,
    select: {
      id: true,
      action: true,
      createdAt: true,
      actorId: true,
      actorName: true,
      actorRole: true,
      actorDeleted: true,
      targetType: true,
      targetId: true,
      meta: true,
      ip: true,
      actor: { select: { name: true } },
    },
  });

  const userIds = new Set<string>();
  const orgIds = new Set<string>();
  for (const r of rows) {
    if (r.targetType === "user" && r.targetId) userIds.add(r.targetId);
    const imp = auditImpersonating(r.meta);
    if (imp) userIds.add(imp);
    const org = auditOrganizationId(r);
    if (org) orgIds.add(org);
  }
  const users = userIds.size ? await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } }) : [];
  const orgs = orgIds.size
    ? await prisma.organization.findMany({ where: { id: { in: [...orgIds] } }, select: { id: true, name: true, nameEn: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const orgById = new Map(orgs.map((o) => [o.id, o]));

  const entries: AuditRow[] = rows.map((r) => {
    const orgId = auditOrganizationId(r);
    const organization = orgId ? (orgById.get(orgId) ?? null) : null;
    const impersonatingId = auditImpersonating(r.meta);
    let targetName: string | null = null;
    let targetNameEn: string | null = null;
    let targetExists = false;
    if (r.targetType === "user" && r.targetId) {
      const user = userById.get(r.targetId);
      targetName = user?.name ?? null;
      targetExists = !!user;
    } else if (r.targetType === "organization" && r.targetId) {
      targetName = organization?.name ?? null;
      targetNameEn = organization?.nameEn ?? null;
      targetExists = !!organization;
    }
    return {
      id: r.id,
      action: r.action,
      createdAt: r.createdAt,
      actorId: r.actorId,
      actorName: r.actorName,
      actorRole: r.actorRole,
      actorDeleted: r.actorDeleted,
      actor: r.actor,
      targetType: r.targetType,
      targetId: r.targetId,
      targetName,
      targetNameEn,
      targetExists,
      organization,
      impersonating: impersonatingId ? (userById.get(impersonatingId) ?? null) : null,
      impersonatingId,
      meta: r.meta,
      ip: r.ip,
    };
  });
  return { entries, total, page };
}

/** Every action code in the log (the action filter offers only what exists), with how often it occurs. */
export async function auditActions(): Promise<Array<{ action: string; count: number }>> {
  const groups = await prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true }, orderBy: { action: "asc" }, take: 300 });
  return groups.map((g) => ({ action: g.action, count: g._count._all }));
}

/** The name behind an actor filter (the chip above the list), or null when that account no longer exists. */
export async function auditActorName(actorId: string): Promise<string | null> {
  if (!actorId) return null;
  const user = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
  return user?.name ?? null;
}
