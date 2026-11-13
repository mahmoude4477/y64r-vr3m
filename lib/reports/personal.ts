import "server-only";
import type { AttemptStatus, RiskLevel } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { attemptsOwn, attemptsReadable, type Scope } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { recommendationsFor, type RecommendedScenario } from "@/lib/recommendations";
import { averageScore, type PageInfo, pageInfo, type RiskCounts } from "./aggregate";
import type { InstitutionScope } from "./scope";

/**
 * Simulation results of one person: the signed-in user's own history (attemptsOwn: every attempt they made, in any
 * institution or none), or, for institution staff, one trainee's attempts made in the active institution
 * (attemptsReadable + organizationId). Both go through the same functions, so "my results" and a trainee's page
 * agree. Steps come from the stored SimulationStepResult rows (@@index([stepId, compliant])).
 */
export type AttemptSubject = { scope: Scope; where: Prisma.SimulationAttemptWhereInput };

export function ownAttempts(scope: Scope): AttemptSubject {
  return { scope, where: attemptsOwn(scope) };
}

export function traineeAttempts(inst: InstitutionScope, userId: string): AttemptSubject {
  return {
    scope: inst.scope,
    where: { AND: [attemptsReadable(inst.scope), { organizationId: inst.organizationId, userId }] },
  };
}

function completed(subject: AttemptSubject): Prisma.SimulationAttemptWhereInput {
  return { AND: [subject.where, { status: "completed" }] };
}

const scenarioSelect = {
  slug: true,
  titleAr: true,
  titleEn: true,
  protocol: { select: { titleAr: true, titleEn: true, icon: true } },
} as const;

export type AttemptSummary = {
  completed: number;
  inProgress: number;
  average: number | null;
  best: number | null;
  risk: RiskCounts;
  latest: {
    id: string;
    score: number | null;
    riskLevel: RiskLevel | null;
    completedAt: Date;
    scenario: { slug: string; titleAr: string; titleEn: string };
  } | null;
};

export async function attemptSummary(subject: AttemptSubject): Promise<AttemptSummary> {
  const where = completed(subject);
  const [agg, risk, inProgress, latest] = await Promise.all([
    prisma.simulationAttempt.aggregate({ where, _count: { _all: true, score: true }, _sum: { score: true }, _max: { score: true } }),
    prisma.simulationAttempt.groupBy({ by: ["riskLevel"], where, _count: { _all: true } }),
    prisma.simulationAttempt.count({ where: { AND: [subject.where, { status: "in_progress" }] } }),
    prisma.simulationAttempt.findFirst({
      where: { AND: [where, { completedAt: { not: null } }] },
      orderBy: { completedAt: "desc" },
      select: { id: true, score: true, riskLevel: true, completedAt: true, scenario: { select: { slug: true, titleAr: true, titleEn: true } } },
    }),
  ]);
  const counts: RiskCounts = { low: 0, medium: 0, high: 0, notAssessable: 0 };
  for (const r of risk) counts[r.riskLevel ?? "notAssessable"] += r._count._all;
  return {
    completed: agg._count._all,
    inProgress,
    average: averageScore({ scored: agg._count.score, sum: agg._sum.score ?? 0 }),
    best: agg._max.score ?? null,
    risk: counts,
    latest: latest?.completedAt ? { ...latest, completedAt: latest.completedAt } : null,
  };
}

export type ScorePoint = { id: string; completedAt: Date; score: number; titleAr: string; titleEn: string };

/** The latest `limit` scored attempts, oldest first (for the score trend). */
export async function attemptScoreHistory(subject: AttemptSubject, limit = 20): Promise<ScorePoint[]> {
  const rows = await prisma.simulationAttempt.findMany({
    where: { AND: [completed(subject), { score: { not: null } }, { completedAt: { not: null } }] },
    orderBy: { completedAt: "desc" },
    take: limit,
    select: { id: true, completedAt: true, score: true, scenario: { select: { titleAr: true, titleEn: true } } },
  });
  return rows
    .flatMap((r) =>
      r.completedAt && r.score !== null
        ? [{ id: r.id, completedAt: r.completedAt, score: r.score, titleAr: r.scenario.titleAr, titleEn: r.scenario.titleEn }]
        : [],
    )
    .reverse();
}

export type WeakStep = {
  step: {
    id: string;
    textAr: string;
    textEn: string;
    rationaleAr: string;
    rationaleEn: string;
    weight: number;
    isMandatory: boolean;
    isCritical: boolean;
    protocolId: string;
    protocol: { titleAr: string; titleEn: string; icon: string };
  };
  violated: number;
  assessed: number;
  critical: boolean;
  scenario: RecommendedScenario | null;
};

/** Steps missed most often in completed attempts (most misses first), with the scenario that trains each. */
export async function weakSteps(subject: AttemptSubject, limit = 5): Promise<WeakStep[]> {
  const groups = await prisma.simulationStepResult.groupBy({
    by: ["stepId", "compliant", "critical"],
    where: { attempt: { is: completed(subject) } },
    _count: { _all: true },
  });
  const byStep = new Map<string, { violated: number; assessed: number; critical: number }>();
  for (const g of groups) {
    const s = byStep.get(g.stepId) ?? { violated: 0, assessed: 0, critical: 0 };
    s.assessed += g._count._all;
    if (!g.compliant) s.violated += g._count._all;
    if (g.critical) s.critical += g._count._all;
    byStep.set(g.stepId, s);
  }
  const top = [...byStep.entries()]
    .filter(([, s]) => s.violated > 0)
    .sort(([ia, a], [ib, b]) => b.violated - a.violated || b.violated / b.assessed - a.violated / a.assessed || (ia < ib ? -1 : 1))
    .slice(0, limit);
  if (top.length === 0) return [];
  const steps = await prisma.protocolStep.findMany({
    where: { id: { in: top.map(([id]) => id) } },
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
      protocol: { select: { titleAr: true, titleEn: true, icon: true } },
    },
  });
  const criticalIds = top.filter(([, s]) => s.critical > 0).map(([id]) => id);
  const recs = await recommendationsFor(subject.scope, steps, criticalIds);
  const recBy = new Map(recs.map((r) => [r.step.id, r]));
  return top.flatMap(([id, s]) => {
    const rec = recBy.get(id);
    return rec ? [{ step: rec.step, violated: s.violated, assessed: s.assessed, critical: rec.critical, scenario: rec.scenario }] : [];
  });
}

export type HistoryRow = {
  id: string;
  status: AttemptStatus;
  startedAt: Date;
  completedAt: Date | null;
  score: number | null;
  riskLevel: RiskLevel | null;
  durationSec: number | null;
  scenario: { slug: string; titleAr: string; titleEn: string; protocol: { titleAr: string; titleEn: string; icon: string } };
};

export const HISTORY_PAGE_SIZE = 20;

/** Every attempt (any status), newest first, one page at a time. */
export async function attemptHistory(
  subject: AttemptSubject,
  rawPage: string | undefined,
  pageSize = HISTORY_PAGE_SIZE,
): Promise<{ rows: HistoryRow[]; info: PageInfo }> {
  const total = await prisma.simulationAttempt.count({ where: subject.where });
  const info = pageInfo(rawPage, total, pageSize);
  const rows =
    total === 0
      ? []
      : await prisma.simulationAttempt.findMany({
          where: subject.where,
          orderBy: [{ startedAt: "desc" }, { id: "asc" }],
          skip: info.offset,
          take: pageSize,
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            score: true,
            riskLevel: true,
            durationSec: true,
            scenario: { select: scenarioSelect },
          },
        });
  return { rows, info };
}
