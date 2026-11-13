import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { type Granularity, REPORT_TIME_ZONE, type ReportFilters, rangeBounds } from "./filters";

/**
 * SQL fragments shared by the institution queries (lib/reports/institution.ts). Raw SQL is used only where Prisma
 * cannot aggregate (time buckets in Riyadh time, DISTINCT ON, grouping through joins); every value is a bound
 * parameter (Prisma.sql), and identifiers and enum literals are constants written here, never input.
 *
 * Org scoping: every fragment takes the organization id that institutionScope() (lib/reports/scope.ts) derived from
 * @/lib/authz (isOrgStaff + requireOrgScope), and the first condition of every WHERE is that organization.
 *
 * Time: timestamp columns hold UTC without a zone (Prisma). Range bounds are compared as UTC instants and buckets
 * are computed in Asia/Riyadh: `("col" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Riyadh'` is the local wall time.
 */

/** Table aliases the fragments expect: scan `s`, simulation_attempt `a`. */
const SCAN_TIME = 's."finalizedAt"';
const ATTEMPT_TIME = 'a."completedAt"';

function localTime(column: string): string {
  return `((${column} AT TIME ZONE 'UTC') AT TIME ZONE '${REPORT_TIME_ZONE}')`;
}

/**
 * YYYY-MM-DD of the bucket start in Riyadh time: weeks start on Sunday (date_trunc weeks start on Monday, so shift
 * by one day each way), months on the 1st. Matches bucketOf() in filters.ts.
 */
export function bucketSql(column: "scan" | "attempt", granularity: Granularity): Prisma.Sql {
  const local = localTime(column === "scan" ? SCAN_TIME : ATTEMPT_TIME);
  return Prisma.raw(
    granularity === "week"
      ? `to_char(date_trunc('week', ${local} + interval '1 day') - interval '1 day', 'YYYY-MM-DD')`
      : `to_char(date_trunc('month', ${local}), 'YYYY-MM-DD')`,
  );
}

function rangeParams(filters: Pick<ReportFilters, "from" | "to">) {
  const { start, end } = rangeBounds(filters);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * WHERE conditions for finalised scans of the organization in the range (+ protocol / department).
 * Alias `s` = scan. Served by @@index([organizationId, status]) and @@index([status, finalizedAt]).
 */
export function scanConditions(organizationId: string, filters: ReportFilters): Prisma.Sql {
  const { start, end } = rangeParams(filters);
  const parts: Prisma.Sql[] = [
    Prisma.sql`s."organizationId" = ${organizationId}`,
    Prisma.sql`s."status" = 'finalized'`,
    Prisma.sql`s."finalizedAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')`,
    Prisma.sql`s."finalizedAt" < (${end}::timestamptz AT TIME ZONE 'UTC')`,
  ];
  if (filters.protocolId) parts.push(Prisma.sql`s."protocolId" = ${filters.protocolId}`);
  if (filters.teamId) parts.push(Prisma.sql`s."teamId" = ${filters.teamId}`);
  return Prisma.join(parts, " AND ");
}

/**
 * WHERE conditions for completed simulation attempts made in the organization in the range. Alias `a` =
 * simulation_attempt. Served by @@index([organizationId, completedAt]).
 * - protocol: the attempt's scenario trains that protocol;
 * - department: the trainee is CURRENTLY a member of that department (attempts carry no department of their own).
 */
export function attemptConditions(organizationId: string, filters: ReportFilters): Prisma.Sql {
  const { start, end } = rangeParams(filters);
  const parts: Prisma.Sql[] = [
    Prisma.sql`a."organizationId" = ${organizationId}`,
    Prisma.sql`a."status" = 'completed'`,
    Prisma.sql`a."completedAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')`,
    Prisma.sql`a."completedAt" < (${end}::timestamptz AT TIME ZONE 'UTC')`,
  ];
  if (filters.protocolId) {
    parts.push(Prisma.sql`a."scenarioId" IN (SELECT sc.id FROM "scenario" sc WHERE sc."protocolId" = ${filters.protocolId})`);
  }
  if (filters.teamId) {
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "teamMember" tm WHERE tm."teamId" = ${filters.teamId} AND tm."userId" = a."userId")`,
    );
  }
  return Prisma.join(parts, " AND ");
}

/** count, scored count and score sum (+ risk counts) of the rows in scope; `t` is the table alias. */
export function scoreColumns(alias: "s" | "a"): Prisma.Sql {
  return Prisma.raw(
    `count(*)::int AS "n", count(${alias}."score")::int AS "scored", coalesce(sum(${alias}."score"), 0)::float8 AS "sum", ` +
      `count(*) FILTER (WHERE ${alias}."riskLevel" = 'low')::int AS "low", ` +
      `count(*) FILTER (WHERE ${alias}."riskLevel" = 'medium')::int AS "medium", ` +
      `count(*) FILTER (WHERE ${alias}."riskLevel" = 'high')::int AS "high", ` +
      `count(*) FILTER (WHERE ${alias}."riskLevel" IS NULL)::int AS "notAssessable"`,
  );
}

/**
 * Effective outcome of a scan step (same rule as lib/scoring.ts scanStepOutcome): the examiner's finalVerdict wins,
 * otherwise the AI's compliant / non_compliant stands; not_visible or nothing = not applicable. Alias `r`.
 */
export const SCAN_STEP_VIOLATED = Prisma.raw(
  `(r."finalVerdict" = 'non_compliant' OR (r."finalVerdict" IS NULL AND r."aiVerdict" = 'non_compliant'))`,
);
export const SCAN_STEP_ASSESSED = Prisma.raw(
  `(r."finalVerdict" IN ('compliant', 'non_compliant') OR (r."finalVerdict" IS NULL AND r."aiVerdict" IN ('compliant', 'non_compliant')))`,
);

/** `IN (...)` over a non-empty list of ids. */
export function inList(ids: readonly string[]): Prisma.Sql {
  if (ids.length === 0) throw new Error("inList: empty list");
  return Prisma.sql`(${Prisma.join(ids)})`;
}
