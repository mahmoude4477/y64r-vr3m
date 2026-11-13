import "server-only";
import { protocolsReadable, teamsReadable } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { recommendationsFor, type RecommendedScenario } from "@/lib/recommendations";
import {
  addAgg,
  addRisk,
  aggOf,
  averageScore,
  buildTrend,
  type GapRow,
  type MergedGap,
  mergeGaps,
  num,
  type RiskCounts,
  type ScoreAgg,
  type TrendPoint,
  type TrendRow,
} from "./aggregate";
import { bucketStarts, type ReportFilters } from "./filters";
import type { InstitutionScope } from "./scope";
import { attemptConditions, bucketSql, SCAN_STEP_ASSESSED, SCAN_STEP_VIOLATED, scanConditions, scoreColumns } from "./sql";

/**
 * Institution analytics (PRODUCT 1.3): finalised scans and completed simulation attempts of the ACTIVE organization,
 * for its staff only (InstitutionScope from lib/reports/scope.ts). Aggregated in SQL; each function runs one or two
 * grouped queries whatever the size of the tables. The dashboard reuses these for its summary cards.
 */

type ScoreRow = { n: unknown; scored: unknown; sum: unknown };
type ScoreRiskRow = ScoreRow & { low: unknown; medium: unknown; high: unknown; notAssessable: unknown };

function riskOf(row: Partial<ScoreRiskRow> | undefined): RiskCounts {
  return {
    low: num(row?.low),
    medium: num(row?.medium),
    high: num(row?.high),
    notAssessable: num(row?.notAssessable),
  };
}

export type SourceSummary = ScoreAgg & { average: number | null; risk: RiskCounts; people: number };

export type InstitutionSummary = {
  scans: SourceSummary;
  simulations: SourceSummary;
  /** Scans and attempts together (see aggregate.ts for the combined average). */
  combined: ScoreAgg & { average: number | null; risk: RiskCounts };
};

export async function institutionSummary(inst: InstitutionScope, filters: ReportFilters): Promise<InstitutionSummary> {
  const [scanRows, attemptRows] = await Promise.all([
    prisma.$queryRaw<Array<ScoreRiskRow & { people: unknown }>>`
      SELECT ${scoreColumns("s")}, count(DISTINCT s."examinerId")::int AS "people"
      FROM "scan" s WHERE ${scanConditions(inst.organizationId, filters)}`,
    prisma.$queryRaw<Array<ScoreRiskRow & { people: unknown }>>`
      SELECT ${scoreColumns("a")}, count(DISTINCT a."userId")::int AS "people"
      FROM "simulation_attempt" a WHERE ${attemptConditions(inst.organizationId, filters)}`,
  ]);
  const source = (row: (ScoreRiskRow & { people: unknown }) | undefined): SourceSummary => {
    const agg = aggOf(row ?? {});
    return { ...agg, average: averageScore(agg), risk: riskOf(row), people: num(row?.people) };
  };
  const scans = source(scanRows[0]);
  const simulations = source(attemptRows[0]);
  const combined = addAgg(scans, simulations);
  return { scans, simulations, combined: { ...combined, average: averageScore(combined), risk: addRisk(scans.risk, simulations.risk) } };
}

/** Average score per week or month (Riyadh time), for scans, attempts and both; empty buckets included. */
export async function complianceTrend(inst: InstitutionScope, filters: ReportFilters): Promise<TrendPoint[]> {
  const g = filters.granularity;
  const [scanRows, attemptRows] = await Promise.all([
    prisma.$queryRaw<Array<{ bucket: string } & ScoreRow>>`
      SELECT ${bucketSql("scan", g)} AS "bucket", count(*)::int AS "n", count(s."score")::int AS "scored",
             coalesce(sum(s."score"), 0)::float8 AS "sum"
      FROM "scan" s WHERE ${scanConditions(inst.organizationId, filters)}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ bucket: string } & ScoreRow>>`
      SELECT ${bucketSql("attempt", g)} AS "bucket", count(*)::int AS "n", count(a."score")::int AS "scored",
             coalesce(sum(a."score"), 0)::float8 AS "sum"
      FROM "simulation_attempt" a WHERE ${attemptConditions(inst.organizationId, filters)}
      GROUP BY 1 ORDER BY 1`,
  ]);
  const rows = (list: Array<{ bucket: string } & ScoreRow>): TrendRow[] => list.map((r) => ({ bucket: String(r.bucket), ...aggOf(r) }));
  return buildTrend(bucketStarts(filters.from, filters.to, g), rows(scanRows), rows(attemptRows));
}

export type ProtocolMeta = { id: string; slug: string; titleAr: string; titleEn: string; icon: string };

export type BreakdownRow<K> = {
  key: K;
  scans: SourceSummary;
  simulations: SourceSummary;
  combined: { n: number; average: number | null };
};

function summaryOf(row: (ScoreRiskRow & { people?: unknown }) | undefined): SourceSummary {
  const agg = aggOf(row ?? {});
  return { ...agg, average: averageScore(agg), risk: riskOf(row), people: num(row?.people) };
}

function breakdown<K>(key: K, scanRow: ScoreRiskRow | undefined, attemptRow: (ScoreRiskRow & { people?: unknown }) | undefined): BreakdownRow<K> {
  const scans = summaryOf(scanRow);
  const simulations = summaryOf(attemptRow);
  const both = addAgg(scans, simulations);
  return { key, scans, simulations, combined: { n: both.n, average: averageScore(both) } };
}

/** Weakest first (lowest combined average; nothing scored last), then the most results. */
function byWeakness<K>(a: BreakdownRow<K>, b: BreakdownRow<K>): number {
  const av = a.combined.average ?? Number.POSITIVE_INFINITY;
  const bv = b.combined.average ?? Number.POSITIVE_INFINITY;
  return av - bv || b.combined.n - a.combined.n;
}

/** Scans and attempts per protocol (an attempt counts for the protocol its scenario trains). */
export async function complianceByProtocol(inst: InstitutionScope, filters: ReportFilters): Promise<Array<BreakdownRow<ProtocolMeta>>> {
  const [scanRows, attemptRows] = await Promise.all([
    prisma.$queryRaw<Array<{ protocolId: string } & ScoreRiskRow>>`
      SELECT s."protocolId" AS "protocolId", ${scoreColumns("s")}
      FROM "scan" s WHERE ${scanConditions(inst.organizationId, filters)}
      GROUP BY s."protocolId"`,
    prisma.$queryRaw<Array<{ protocolId: string } & ScoreRiskRow & { people: unknown }>>`
      SELECT sc."protocolId" AS "protocolId", ${scoreColumns("a")}, count(DISTINCT a."userId")::int AS "people"
      FROM "simulation_attempt" a JOIN "scenario" sc ON sc.id = a."scenarioId"
      WHERE ${attemptConditions(inst.organizationId, filters)}
      GROUP BY sc."protocolId"`,
  ]);
  const ids = [...new Set([...scanRows, ...attemptRows].map((r) => r.protocolId))];
  if (ids.length === 0) return [];
  // Only protocols this organization's own rows point at (global ones or its custom copies).
  const protocols = await prisma.protocol.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, titleAr: true, titleEn: true, icon: true },
  });
  const scanBy = new Map(scanRows.map((r) => [r.protocolId, r]));
  const attemptBy = new Map(attemptRows.map((r) => [r.protocolId, r]));
  return protocols.map((p) => breakdown(p, scanBy.get(p.id), attemptBy.get(p.id))).sort(byWeakness);
}

export type DepartmentKey = { id: string; name: string } | null;

/**
 * Scans per department (Scan.teamId) and attempts per department of the trainee (their CURRENT departments in this
 * organization; a trainee in two departments counts in both, one with none under "no department"). `null` key =
 * no department (also scans whose department was deleted).
 */
export async function complianceByDepartment(inst: InstitutionScope, filters: ReportFilters): Promise<Array<BreakdownRow<DepartmentKey>>> {
  const org = inst.organizationId;
  const [scanRows, attemptRows, teams] = await Promise.all([
    prisma.$queryRaw<Array<{ teamId: string | null } & ScoreRiskRow>>`
      SELECT s."teamId" AS "teamId", ${scoreColumns("s")}
      FROM "scan" s WHERE ${scanConditions(org, filters)}
      GROUP BY s."teamId"`,
    prisma.$queryRaw<Array<{ teamId: string | null } & ScoreRiskRow & { people: unknown }>>`
      SELECT d."teamId" AS "teamId", ${scoreColumns("a")}, count(DISTINCT a."userId")::int AS "people"
      FROM "simulation_attempt" a
      LEFT JOIN LATERAL (
        SELECT tm."teamId" FROM "teamMember" tm JOIN "team" t ON t.id = tm."teamId"
        WHERE tm."userId" = a."userId" AND t."organizationId" = ${org}
      ) d ON true
      WHERE ${attemptConditions(org, filters)}
      GROUP BY d."teamId"`,
    prisma.team.findMany({ where: teamsReadable(inst.scope), select: { id: true, name: true } }),
  ]);
  const teamBy = new Map(teams.map((t) => [t.id, t]));
  const scanBy = new Map<string | null, ScoreRiskRow>();
  for (const r of scanRows) {
    // A team id that is not one of this organization's departments (deleted meanwhile) counts as none.
    const key = r.teamId && teamBy.has(r.teamId) ? r.teamId : null;
    const prev = scanBy.get(key);
    scanBy.set(key, prev ? sumRiskRows(prev, r) : r);
  }
  const attemptBy = new Map<string | null, ScoreRiskRow & { people: unknown }>();
  for (const r of attemptRows) {
    const key = r.teamId && teamBy.has(r.teamId) ? r.teamId : null;
    const prev = attemptBy.get(key);
    attemptBy.set(key, prev ? { ...sumRiskRows(prev, r), people: num(prev.people) + num(r.people) } : r);
  }
  const keys = new Set<string | null>([...scanBy.keys(), ...attemptBy.keys()]);
  if (filters.teamId) {
    // Filtered to one department: show that row only (a trainee's other departments are not the question).
    for (const k of [...keys]) if (k !== filters.teamId) keys.delete(k);
  }
  const rows = [...keys].map((k) => breakdown<DepartmentKey>(k ? (teamBy.get(k) ?? null) : null, scanBy.get(k), attemptBy.get(k)));
  return rows.sort((a, b) => (a.key === null ? 1 : 0) - (b.key === null ? 1 : 0) || byWeakness(a, b));
}

function sumRiskRows(a: ScoreRiskRow, b: ScoreRiskRow): ScoreRiskRow {
  const keys = ["n", "scored", "sum", "low", "medium", "high", "notAssessable"] as const;
  return Object.fromEntries(keys.map((k) => [k, num(a[k]) + num(b[k])])) as unknown as ScoreRiskRow;
}

export type GapStep = {
  id: string;
  textAr: string;
  textEn: string;
  rationaleAr: string;
  rationaleEn: string;
  weight: number;
  isMandatory: boolean;
  isCritical: boolean;
  protocolId: string;
  protocol: { titleAr: string; titleEn: string; icon: string; slug: string };
};

export type GapItem = MergedGap & { step: GapStep; critical: boolean; scenario: RecommendedScenario | null };

/**
 * The most violated protocol steps (finalised scans + completed attempts), most violations first, each with the
 * scenario that trains it (recommendationsFor, the shared rule: the organization's own scenario first).
 */
export async function topGaps(inst: InstitutionScope, filters: ReportFilters, limit = 8): Promise<GapItem[]> {
  const org = inst.organizationId;
  const [scanRows, attemptRows] = await Promise.all([
    prisma.$queryRaw<Array<{ stepId: string; violated: unknown; assessed: unknown }>>`
      SELECT r."stepId" AS "stepId",
             count(*) FILTER (WHERE ${SCAN_STEP_VIOLATED})::int AS "violated",
             count(*) FILTER (WHERE ${SCAN_STEP_ASSESSED})::int AS "assessed"
      FROM "scan_step_result" r JOIN "scan" s ON s.id = r."scanId"
      WHERE ${scanConditions(org, filters)}
      GROUP BY r."stepId"`,
    prisma.$queryRaw<Array<{ stepId: string; violated: unknown; assessed: unknown; critical: unknown }>>`
      SELECT r."stepId" AS "stepId",
             count(*) FILTER (WHERE NOT r."compliant")::int AS "violated",
             count(*)::int AS "assessed",
             count(*) FILTER (WHERE r."critical")::int AS "critical"
      FROM "simulation_step_result" r JOIN "simulation_attempt" a ON a.id = r."attemptId"
      WHERE ${attemptConditions(org, filters)}
      GROUP BY r."stepId"`,
  ]);
  const toGap = (r: { stepId: string; violated: unknown; assessed: unknown; critical?: unknown }): GapRow => ({
    stepId: r.stepId,
    violated: num(r.violated),
    assessed: num(r.assessed),
    critical: num(r.critical),
  });
  const gaps = mergeGaps(scanRows.map(toGap), attemptRows.map(toGap), limit);
  if (gaps.length === 0) return [];
  const steps = await prisma.protocolStep.findMany({
    where: { id: { in: gaps.map((g) => g.stepId) } },
    select: {
      id: true,
      textAr: true,
      textEn: true,
      rationaleAr: true,
      rationaleEn: true,
      weight: true,
      isMandatory: true,
      isCritical: true,
      protocolId: true,
      protocol: { select: { titleAr: true, titleEn: true, icon: true, slug: true } },
    },
  });
  const criticalIds = gaps.filter((g) => g.criticalChoices > 0).map((g) => g.stepId);
  const recs = await recommendationsFor(inst.scope, steps, criticalIds);
  const recBy = new Map(recs.map((r) => [r.step.id, r]));
  return gaps.flatMap((gap) => {
    const rec = recBy.get(gap.stepId);
    return rec ? [{ ...gap, step: rec.step, critical: rec.critical, scenario: rec.scenario }] : [];
  });
}

export type FilterOptions = {
  protocols: Array<{ id: string; titleAr: string; titleEn: string }>;
  departments: Array<{ id: string; name: string }>;
};

/**
 * Choices for the filter bar: protocols the user may read plus any protocol this organization already has results
 * for (an unpublished one keeps its history), and the organization's departments.
 */
export async function reportFilterOptions(inst: InstitutionScope): Promise<FilterOptions> {
  const org = inst.organizationId;
  const [readable, used, departments] = await Promise.all([
    prisma.protocol.findMany({ where: protocolsReadable(inst.scope), select: { id: true } }),
    prisma.$queryRaw<Array<{ protocolId: string }>>`
      SELECT DISTINCT s."protocolId" AS "protocolId" FROM "scan" s WHERE s."organizationId" = ${org}
      UNION
      SELECT DISTINCT sc."protocolId" FROM "simulation_attempt" a JOIN "scenario" sc ON sc.id = a."scenarioId"
      WHERE a."organizationId" = ${org}`,
    prisma.team.findMany({ where: teamsReadable(inst.scope), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const ids = [...new Set([...readable.map((p) => p.id), ...used.map((r) => r.protocolId)])];
  const protocols =
    ids.length === 0
      ? []
      : await prisma.protocol.findMany({ where: { id: { in: ids } }, select: { id: true, titleAr: true, titleEn: true } });
  return { protocols, departments };
}

/** Drops a protocol or department from the filters that is not one of the options (another organization's id). */
export function resolveFilters(filters: ReportFilters, options: FilterOptions): ReportFilters {
  const protocolOk = !filters.protocolId || options.protocols.some((p) => p.id === filters.protocolId);
  const teamOk = !filters.teamId || options.departments.some((d) => d.id === filters.teamId);
  return { ...filters, protocolId: protocolOk ? filters.protocolId : null, teamId: teamOk ? filters.teamId : null };
}

/** The active organization's display fields (Arabic name + optional English name). */
export async function organizationLabel(inst: InstitutionScope): Promise<{ name: string; nameEn: string | null }> {
  const org = await prisma.organization.findFirst({
    where: { id: inst.organizationId },
    select: { name: true, nameEn: true },
  });
  return { name: org?.name ?? "", nameEn: org?.nameEn ?? null };
}

/** Whether the organization has any finalised scan or completed attempt at all (first-run empty state). */
export async function institutionHasResults(inst: InstitutionScope): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ any: boolean }>>`
    SELECT (EXISTS (SELECT 1 FROM "scan" s WHERE s."organizationId" = ${inst.organizationId} AND s."status" = 'finalized')
         OR EXISTS (SELECT 1 FROM "simulation_attempt" a WHERE a."organizationId" = ${inst.organizationId} AND a."status" = 'completed')) AS "any"`;
  return rows[0]?.any === true;
}
