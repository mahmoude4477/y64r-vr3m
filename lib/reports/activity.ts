import "server-only";
import type { Difficulty, RiskLevel, ScanStatus } from "@/generated/prisma/enums";
import { attemptsReadable, scansReadable, scenariosReadable, type Scope } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { AttemptSubject } from "./personal";
import type { InstitutionScope } from "./scope";

/**
 * Recent activity for the dashboard (/dashboard): open scans, the latest finalised scans and completed attempts of the
 * ACTIVE institution (staff only, through InstitutionScope), a person's unfinished attempt, a scenario they have not
 * tried yet and the institution's headcount. Every where-clause starts from @/lib/authz. The aggregated numbers of the
 * dashboard (this month's compliance, risk, top gaps, weak steps) come from institution.ts and personal.ts, the same
 * functions /reports uses.
 */

/** Scans not finalised yet, the ones an examiner can act on now first (AI done, or AI failed: review by hand). */
export const ACTIONABLE_SCAN_STATUSES = ["review", "failed"] as const satisfies readonly ScanStatus[];
/** Still being prepared: photos being added, or the AI analysis running. */
export const PREPARING_SCAN_STATUSES = ["draft", "analyzing"] as const satisfies readonly ScanStatus[];
export const OPEN_SCAN_STATUSES = [...ACTIONABLE_SCAN_STATUSES, ...PREPARING_SCAN_STATUSES] as const;
export type OpenScanStatus = (typeof OPEN_SCAN_STATUSES)[number];

export type OpenScanCounts = Record<OpenScanStatus, number> & { total: number };

const openScanSelect = {
  id: true,
  areaLabel: true,
  status: true,
  updatedAt: true,
  examinerId: true,
  examiner: { select: { name: true } },
  protocol: { select: { titleAr: true, titleEn: true, icon: true } },
} as const;

export type OpenScanRow = {
  id: string;
  areaLabel: string;
  status: ScanStatus;
  updatedAt: Date;
  examinerId: string | null;
  examiner: { name: string } | null;
  protocol: { titleAr: string; titleEn: string; icon: string };
};

/** Counts per open status and the `limit` most recently touched open scans (actionable ones first). */
export async function openScans(inst: InstitutionScope, limit = 5): Promise<{ counts: OpenScanCounts; rows: OpenScanRow[] }> {
  const readable = scansReadable(inst.scope);
  const order = [{ updatedAt: "desc" as const }, { id: "asc" as const }];
  const [groups, actionable, preparing] = await Promise.all([
    prisma.scan.groupBy({
      by: ["status"],
      where: { AND: [readable, { status: { in: [...OPEN_SCAN_STATUSES] } }] },
      _count: { _all: true },
    }),
    prisma.scan.findMany({
      where: { AND: [readable, { status: { in: [...ACTIONABLE_SCAN_STATUSES] } }] },
      orderBy: order,
      take: limit,
      select: openScanSelect,
    }),
    prisma.scan.findMany({
      where: { AND: [readable, { status: { in: [...PREPARING_SCAN_STATUSES] } }] },
      orderBy: order,
      take: limit,
      select: openScanSelect,
    }),
  ]);
  const counts: OpenScanCounts = { review: 0, failed: 0, draft: 0, analyzing: 0, total: 0 };
  for (const g of groups) {
    if ((OPEN_SCAN_STATUSES as readonly string[]).includes(g.status)) {
      counts[g.status as OpenScanStatus] += g._count._all;
      counts.total += g._count._all;
    }
  }
  return { counts, rows: [...actionable, ...preparing].slice(0, Math.max(0, limit)) };
}

export type FinalizedScanRow = {
  id: string;
  areaLabel: string;
  score: number | null;
  riskLevel: RiskLevel | null;
  finalizedAt: Date | null;
  protocol: { titleAr: string; titleEn: string; icon: string };
  team: { name: string } | null;
};

/** The latest finalised scans of the institution, newest first. */
export async function latestFinalizedScans(inst: InstitutionScope, limit = 5): Promise<FinalizedScanRow[]> {
  return prisma.scan.findMany({
    where: { AND: [scansReadable(inst.scope), { status: "finalized", finalizedAt: { not: null } }] },
    orderBy: [{ finalizedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: {
      id: true,
      areaLabel: true,
      score: true,
      riskLevel: true,
      finalizedAt: true,
      protocol: { select: { titleAr: true, titleEn: true, icon: true } },
      team: { select: { name: true } },
    },
  });
}

export type CompletedAttemptRow = {
  id: string;
  userId: string;
  score: number | null;
  riskLevel: RiskLevel | null;
  completedAt: Date | null;
  user: { name: string };
  scenario: { slug: string; titleAr: string; titleEn: string; protocol: { icon: string } };
};

/** The latest simulation attempts completed in the institution (by anyone, while a member), newest first. */
export async function latestCompletedAttempts(inst: InstitutionScope, limit = 5): Promise<CompletedAttemptRow[]> {
  return prisma.simulationAttempt.findMany({
    where: {
      AND: [attemptsReadable(inst.scope), { organizationId: inst.organizationId, status: "completed", completedAt: { not: null } }],
    },
    orderBy: [{ completedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: {
      id: true,
      userId: true,
      score: true,
      riskLevel: true,
      completedAt: true,
      user: { select: { name: true } },
      scenario: { select: { slug: true, titleAr: true, titleEn: true, protocol: { select: { icon: true } } } },
    },
  });
}

export type UnfinishedAttempt = { id: string; startedAt: Date; scenario: { slug: string; titleAr: string; titleEn: string } };

/** The subject's most recently started attempt that is still in progress (to continue it), or null. */
export async function latestUnfinishedAttempt(subject: AttemptSubject): Promise<UnfinishedAttempt | null> {
  return prisma.simulationAttempt.findFirst({
    where: { AND: [subject.where, { status: "in_progress" }] },
    orderBy: [{ startedAt: "desc" }, { id: "asc" }],
    select: { id: true, startedAt: true, scenario: { select: { slug: true, titleAr: true, titleEn: true } } },
  });
}

export type ScenarioSuggestion = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  protocol: { titleAr: string; titleEn: string; icon: string };
};

/**
 * A published scenario the user may play (scenariosReadable) and has never completed: the active institution's own
 * first, then the easiest, then the oldest. For a first-time user it is the suggested first scenario; later it is the
 * next one to try when the weak steps give no recommendation. null when every playable scenario was completed.
 */
export async function untriedScenario(scope: Scope): Promise<ScenarioSuggestion | null> {
  // scenariosReadable allows global scenarios (organizationId null) and the active institution's own, so sorting the
  // organization with nulls last puts the institution's own first, in the same single query.
  return prisma.scenario.findFirst({
    where: { AND: [scenariosReadable(scope), { attempts: { none: { userId: scope.userId, status: "completed" } } }] },
    orderBy: [{ organizationId: { sort: "asc", nulls: "last" } }, { difficulty: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      slug: true,
      titleAr: true,
      titleEn: true,
      difficulty: true,
      estimatedMinutes: true,
      protocol: { select: { titleAr: true, titleEn: true, icon: true } },
    },
  });
}

/** Members of the institution and invitations still waiting for an answer (not expired). */
export async function institutionHeadcount(inst: InstitutionScope, now: Date = new Date()): Promise<{ members: number; pendingInvitations: number }> {
  const [members, pendingInvitations] = await Promise.all([
    prisma.member.count({ where: { organizationId: inst.organizationId } }),
    prisma.invitation.count({ where: { organizationId: inst.organizationId, status: "pending", expiresAt: { gt: now } } }),
  ]);
  return { members, pendingInvitations };
}

/**
 * The active institution of any member (a trainee too: they have no InstitutionScope), for the greeting line. The
 * session helpers already checked the membership and that the institution is not suspended (scope.organizationId).
 */
export async function activeInstitutionName(scope: Scope): Promise<{ name: string; nameEn: string | null } | null> {
  if (!scope.organizationId) return null;
  return prisma.organization.findFirst({ where: { id: scope.organizationId }, select: { name: true, nameEn: true } });
}
