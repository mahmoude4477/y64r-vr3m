import "server-only";
import { attemptListWhere, NO_ORGANIZATION, scanListWhere, type AssessmentFilters } from "@/lib/admin/assessment-filters";
import { PAGE_SIZE, pageOffset } from "@/lib/admin/params";
import { prisma } from "@/lib/prisma";

// Read queries of /admin/assessments (PRODUCT 6a): every scan and simulation attempt on the platform. Platform-admin
// pages query WITHOUT the org scoping of lib/authz.ts (CONVENTIONS 4): every caller has called requirePlatformAdmin().
// Queries run one after another, each with at most one level of selection (no fan-out over the pool, see
// lib/admin/queries.ts); related names are loaded once per page by id. All numbers come from the database.

type Named = { id: string; name: string };
type OrgName = { id: string; name: string; nameEn: string | null };
type Titled = { id: string; titleAr: string; titleEn: string };

async function usersById(ids: Array<string | null | undefined>): Promise<Map<string, Named>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(rows.map((u) => [u.id, u]));
}

async function orgsById(ids: Array<string | null | undefined>): Promise<Map<string, OrgName>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.organization.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, nameEn: true } });
  return new Map(rows.map((o) => [o.id, o]));
}

/** Institutions offered in the filters (sorted by name; a very large platform still filters by link). */
export const FILTER_ORGANIZATIONS_MAX = 500;

export async function organizationOptions(): Promise<OrgName[]> {
  return prisma.organization.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: FILTER_ORGANIZATIONS_MAX,
    select: { id: true, name: true, nameEn: true },
  });
}

/** Global protocols, plus the selected institution's own protocols. */
export async function protocolOptions(org: string): Promise<Array<Titled & { organizationId: string | null }>> {
  const scoped = org && org !== NO_ORGANIZATION;
  return prisma.protocol.findMany({
    where: scoped ? { OR: [{ organizationId: null }, { organizationId: org }] } : { organizationId: null },
    orderBy: [{ organizationId: { sort: "asc", nulls: "first" } }, { titleEn: "asc" }],
    take: 300,
    select: { id: true, titleAr: true, titleEn: true, organizationId: true },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------------------------------------------

export type ScanListRow = {
  id: string;
  areaLabel: string;
  status: "draft" | "analyzing" | "review" | "finalized" | "failed";
  score: number | null;
  riskLevel: "low" | "medium" | "high" | null;
  createdAt: Date;
  finalizedAt: Date | null;
  photos: number;
  organization: OrgName | null;
  protocol: Titled | null;
  examiner: Named | null;
};

export async function listScans(filters: AssessmentFilters) {
  const where = scanListWhere(filters);
  const total = await prisma.scan.count({ where });
  const { page, skip } = pageOffset(filters.page, total);
  const rows = await prisma.scan.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip,
    take: PAGE_SIZE,
    select: {
      id: true,
      areaLabel: true,
      status: true,
      score: true,
      riskLevel: true,
      createdAt: true,
      finalizedAt: true,
      organizationId: true,
      protocolId: true,
      examinerId: true,
      _count: { select: { photos: true } },
    },
  });
  const orgs = await orgsById(rows.map((r) => r.organizationId));
  const protocolIds = [...new Set(rows.map((r) => r.protocolId))];
  const protocols = protocolIds.length
    ? await prisma.protocol.findMany({ where: { id: { in: protocolIds } }, select: { id: true, titleAr: true, titleEn: true } })
    : [];
  const protocolById = new Map(protocols.map((p) => [p.id, p]));
  const people = await usersById(rows.map((r) => r.examinerId));
  const scans: ScanListRow[] = rows.map((r) => ({
    id: r.id,
    areaLabel: r.areaLabel,
    status: r.status,
    score: r.score,
    riskLevel: r.riskLevel,
    createdAt: r.createdAt,
    finalizedAt: r.finalizedAt,
    photos: r._count.photos,
    organization: orgs.get(r.organizationId) ?? null,
    protocol: protocolById.get(r.protocolId) ?? null,
    examiner: r.examinerId ? (people.get(r.examinerId) ?? null) : null,
  }));
  return { scans, total, page };
}

export type AttemptListRow = {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  score: number | null;
  riskLevel: "low" | "medium" | "high" | null;
  startedAt: Date;
  completedAt: Date | null;
  durationSec: number | null;
  /** null: an individual trainee's attempt (or the institution was deleted: the FK sets it null). */
  organization: OrgName | null;
  scenario: (Titled & { protocol: Titled | null }) | null;
  user: Named | null;
};

export async function listAttempts(filters: AssessmentFilters) {
  const where = attemptListWhere(filters);
  const total = await prisma.simulationAttempt.count({ where });
  const { page, skip } = pageOffset(filters.page, total);
  const rows = await prisma.simulationAttempt.findMany({
    where,
    orderBy: [{ startedAt: "desc" }, { id: "asc" }],
    skip,
    take: PAGE_SIZE,
    select: {
      id: true,
      status: true,
      score: true,
      riskLevel: true,
      startedAt: true,
      completedAt: true,
      durationSec: true,
      organizationId: true,
      scenarioId: true,
      userId: true,
    },
  });
  const orgs = await orgsById(rows.map((r) => r.organizationId));
  const scenarioIds = [...new Set(rows.map((r) => r.scenarioId))];
  const scenarios = scenarioIds.length
    ? await prisma.scenario.findMany({
        where: { id: { in: scenarioIds } },
        select: { id: true, titleAr: true, titleEn: true, protocolId: true },
      })
    : [];
  const protocolIds = [...new Set(scenarios.map((s) => s.protocolId))];
  const protocols = protocolIds.length
    ? await prisma.protocol.findMany({ where: { id: { in: protocolIds } }, select: { id: true, titleAr: true, titleEn: true } })
    : [];
  const protocolById = new Map(protocols.map((p) => [p.id, p]));
  const scenarioById = new Map(
    scenarios.map((s) => [s.id, { id: s.id, titleAr: s.titleAr, titleEn: s.titleEn, protocol: protocolById.get(s.protocolId) ?? null }]),
  );
  const people = await usersById(rows.map((r) => r.userId));
  const attempts: AttemptListRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    score: r.score,
    riskLevel: r.riskLevel,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    durationSec: r.durationSec,
    organization: r.organizationId ? (orgs.get(r.organizationId) ?? null) : null,
    scenario: scenarioById.get(r.scenarioId) ?? null,
    user: people.get(r.userId) ?? null,
  }));
  return { attempts, total, page };
}

// ---------------------------------------------------------------------------------------------------------------
// Details (read only)
// ---------------------------------------------------------------------------------------------------------------

export type AiCallSummary = {
  id: string;
  kind: "scan_analysis" | "simulation_debrief" | "insight";
  status: "pending" | "ok" | "refused" | "error";
  model: string;
  errorCode: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  createdAt: Date;
};

async function aiCallsFor(targetType: string, targetId: string): Promise<AiCallSummary[]> {
  const rows = await prisma.aiCall.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      kind: true,
      status: true,
      model: true,
      errorCode: true,
      latencyMs: true,
      inputTokens: true,
      outputTokens: true,
      costUsd: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({ ...r, costUsd: r.costUsd === null ? null : Number(r.costUsd) }));
}

export async function getScanDetail(scanId: string) {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: {
      id: true,
      organizationId: true,
      teamId: true,
      examinerId: true,
      protocolId: true,
      areaLabel: true,
      status: true,
      aiModel: true,
      overallNotesAr: true,
      overallNotesEn: true,
      score: true,
      riskLevel: true,
      startedAt: true,
      analyzedAt: true,
      finalizedAt: true,
      finalizedById: true,
      notes: true,
      createdAt: true,
    },
  });
  if (!scan) return null;
  const organization = await prisma.organization.findUnique({
    where: { id: scan.organizationId },
    select: { id: true, name: true, nameEn: true, suspended: true },
  });
  const team = scan.teamId ? await prisma.team.findUnique({ where: { id: scan.teamId }, select: { id: true, name: true } }) : null;
  const protocol = await prisma.protocol.findUnique({
    where: { id: scan.protocolId },
    select: { id: true, slug: true, titleAr: true, titleEn: true, organizationId: true },
  });
  const results = await prisma.scanStepResult.findMany({
    where: { scanId },
    select: {
      id: true,
      stepId: true,
      aiVerdict: true,
      aiConfidence: true,
      evidenceAr: true,
      evidenceEn: true,
      finalVerdict: true,
      overriddenById: true,
      note: true,
    },
  });
  const steps = results.length
    ? await prisma.protocolStep.findMany({
        where: { id: { in: results.map((r) => r.stepId) } },
        select: { id: true, order: true, textAr: true, textEn: true, isMandatory: true, isCritical: true, weight: true, visualCheck: true },
      })
    : [];
  const photos = await prisma.scanPhoto.findMany({
    where: { scanId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, width: true, height: true, bytes: true, createdAt: true },
  });
  const people = await usersById([scan.examinerId, scan.finalizedById, ...results.map((r) => r.overriddenById)]);
  const aiCalls = await aiCallsFor("scan", scan.id);

  const stepById = new Map(steps.map((s) => [s.id, s]));
  const stepResults = results
    .flatMap((r) => {
      const step = stepById.get(r.stepId);
      if (!step) return [];
      return [
        {
          id: r.id,
          step,
          aiVerdict: r.aiVerdict,
          aiConfidence: r.aiConfidence,
          evidenceAr: r.evidenceAr,
          evidenceEn: r.evidenceEn,
          finalVerdict: r.finalVerdict,
          overriddenBy: r.overriddenById ? (people.get(r.overriddenById) ?? null) : null,
          note: r.note,
        },
      ];
    })
    .sort((a, b) => a.step.order - b.step.order);

  return {
    scan,
    organization: organization ? { ...organization, suspended: !!organization.suspended } : null,
    team,
    protocol,
    examiner: scan.examinerId ? (people.get(scan.examinerId) ?? null) : null,
    finalizedBy: scan.finalizedById ? (people.get(scan.finalizedById) ?? null) : null,
    stepResults,
    photos,
    aiCalls,
  };
}

export type ScanDetail = NonNullable<Awaited<ReturnType<typeof getScanDetail>>>;

export async function getAttemptDetail(attemptId: string) {
  const attempt = await prisma.simulationAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      scenarioId: true,
      status: true,
      startedAt: true,
      completedAt: true,
      durationSec: true,
      score: true,
      riskLevel: true,
      debriefAr: true,
      debriefEn: true,
    },
  });
  if (!attempt) return null;
  const user = await prisma.user.findUnique({ where: { id: attempt.userId }, select: { id: true, name: true } });
  const organization = attempt.organizationId
    ? await prisma.organization.findUnique({ where: { id: attempt.organizationId }, select: { id: true, name: true, nameEn: true } })
    : null;
  const scenario = await prisma.scenario.findUnique({
    where: { id: attempt.scenarioId },
    select: { id: true, slug: true, titleAr: true, titleEn: true, difficulty: true, organizationId: true, protocolId: true },
  });
  const protocol = scenario
    ? await prisma.protocol.findUnique({ where: { id: scenario.protocolId }, select: { id: true, slug: true, titleAr: true, titleEn: true } })
    : null;
  const stages = await prisma.scenarioStage.findMany({
    where: { scenarioId: attempt.scenarioId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true, order: true, kind: true, promptAr: true, promptEn: true },
  });
  const options = stages.length
    ? await prisma.scenarioOption.findMany({
        where: { stageId: { in: stages.map((s) => s.id) } },
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: { id: true, stageId: true, textAr: true, textEn: true, isCorrect: true, isCritical: true, feedbackAr: true, feedbackEn: true },
      })
    : [];
  const answers = await prisma.simulationAnswer.findMany({
    where: { attemptId },
    select: { stageId: true, optionIds: true, isCorrect: true, answeredAt: true },
  });
  const results = await prisma.simulationStepResult.findMany({
    where: { attemptId },
    select: { stepId: true, compliant: true, critical: true },
  });
  const steps = results.length
    ? await prisma.protocolStep.findMany({
        where: { id: { in: results.map((r) => r.stepId) } },
        select: { id: true, order: true, textAr: true, textEn: true, isMandatory: true, isCritical: true, weight: true },
      })
    : [];
  const aiCalls = await aiCallsFor("simulation_attempt", attempt.id);

  const answerByStage = new Map(answers.map((a) => [a.stageId, a]));
  const optionsByStage = new Map<string, typeof options>();
  for (const o of options) optionsByStage.set(o.stageId, [...(optionsByStage.get(o.stageId) ?? []), o]);
  const stepById = new Map(steps.map((s) => [s.id, s]));

  return {
    attempt,
    user,
    organization,
    scenario,
    protocol,
    stages: stages.map((s) => {
      const answer = answerByStage.get(s.id) ?? null;
      const chosen = new Set(answer?.optionIds ?? []);
      return {
        ...s,
        answer: answer ? { isCorrect: answer.isCorrect, answeredAt: answer.answeredAt } : null,
        options: (optionsByStage.get(s.id) ?? []).map((o) => ({ ...o, chosen: chosen.has(o.id) })),
      };
    }),
    stepResults: results
      .flatMap((r) => {
        const step = stepById.get(r.stepId);
        return step ? [{ step, compliant: r.compliant, critical: r.critical }] : [];
      })
      .sort((a, b) => a.step.order - b.step.order),
    aiCalls,
  };
}

export type AttemptDetail = NonNullable<Awaited<ReturnType<typeof getAttemptDetail>>>;
