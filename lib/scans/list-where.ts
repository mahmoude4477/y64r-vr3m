import type { Prisma } from "@/generated/prisma/client";
import { scansReadable, type Scope } from "@/lib/authz";
import { ANALYSIS_STALE_MS } from "./constants";
import type { ScanFilters } from "./filters";

/**
 * Where-clause of the scan list: ALWAYS scansReadable(scope) (staff of the active institution), narrowed by the
 * URL filters. "Mine" = scans the user examined (CONVENTIONS 4). Pure, unit-tested.
 *
 * The status filter works on the status the pages show (review-core effectiveStatus): a scan left in "analyzing" for
 * longer than ANALYSIS_STALE_MS is a crashed analysis, listed and filtered as "failed", never as "analyzing".
 */
export function scanListWhere(scope: Scope, filters: ScanFilters, now: Date = new Date()): Prisma.ScanWhereInput {
  const and: Prisma.ScanWhereInput[] = [scansReadable(scope)];
  if (filters.status) and.push(statusWhere(filters.status, now));
  if (filters.protocol) and.push({ protocolId: filters.protocol });
  if (filters.department) and.push({ teamId: filters.department });
  if (filters.risk) and.push({ riskLevel: filters.risk });
  if (filters.mine) and.push({ examinerId: scope.userId });
  if (filters.q) and.push({ areaLabel: { contains: filters.q, mode: "insensitive" } });
  return { AND: and };
}

/** Same cut-off as isStaleAnalysis: stale when updatedAt is more than ANALYSIS_STALE_MS before now. */
function statusWhere(status: NonNullable<ScanFilters["status"]>, now: Date): Prisma.ScanWhereInput {
  const staleBefore = new Date(now.getTime() - ANALYSIS_STALE_MS);
  if (status === "failed") return { OR: [{ status: "failed" }, { status: "analyzing", updatedAt: { lt: staleBefore } }] };
  if (status === "analyzing") return { status: "analyzing", updatedAt: { gte: staleBefore } };
  return { status };
}
