// Filters of /admin/audit (?action=&q=&actor=&org=&from=&to=&page=). Pure (Prisma types only), unit-tested; the
// queries in lib/admin/audit-queries.ts run them after requirePlatformAdmin().
import type { Prisma } from "@/generated/prisma/client";
import { dayRange, first, parseDay, parseId, parsePage, parseQuery, type RawSearchParams } from "@/lib/admin/params";

export const AUDIT_PAGE_SIZE = 25;

export type AuditFilters = {
  /** An exact action code ("auth.admin.ban-user", "scan.delete"), or "" for all. */
  action: string;
  /** Text in the actor's name (the current name, or the snapshot kept on the row). */
  q: string;
  /** An exact actor id (links from a user's page), or "". */
  actor: string;
  /** An institution id: rows about it (target) or done inside it (meta.organizationId), or "". */
  org: string;
  from: string;
  to: string;
  page: number;
};

/** Action codes are dotted lower-case words (CONVENTIONS 8: "area.verb", Better Auth "auth.<plugin>.<endpoint>"). */
export function parseAction(raw: string | string[] | undefined): string {
  const value = first(raw) ?? "";
  return /^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+){0,4}$/.test(value) && value.length <= 100 ? value : "";
}

export function parseAuditFilters(raw: RawSearchParams): AuditFilters {
  return {
    action: parseAction(raw.action) === "all" ? "" : parseAction(raw.action),
    q: parseQuery(raw.q),
    actor: parseId(raw.actor),
    org: parseId(raw.org) === "all" ? "" : parseId(raw.org), // "all": the select's "no filter" value
    from: parseDay(raw.from),
    to: parseDay(raw.to),
    page: parsePage(raw.page),
  };
}

export function isAuditFiltered(f: AuditFilters): boolean {
  return f.action !== "" || f.q !== "" || f.actor !== "" || f.org !== "" || f.from !== "" || f.to !== "";
}

export function auditParams(f: AuditFilters): Record<string, string> {
  return { action: f.action, q: f.q, actor: f.actor, org: f.org, from: f.from, to: f.to };
}

export function auditWhere(f: Omit<AuditFilters, "page">): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (f.action) and.push({ action: f.action });
  if (f.q) {
    and.push({
      OR: [{ actorName: { contains: f.q, mode: "insensitive" } }, { actor: { name: { contains: f.q, mode: "insensitive" } } }],
    });
  }
  if (f.actor) and.push({ actorId: f.actor });
  if (f.org) {
    and.push({ OR: [{ targetType: "organization", targetId: f.org }, { meta: { path: ["organizationId"], equals: f.org } }] });
  }
  const range = dayRange(f.from, f.to);
  if (range) and.push({ createdAt: range });
  return and.length ? { AND: and } : {};
}
