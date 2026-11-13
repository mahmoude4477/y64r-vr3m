import "server-only";
import type { RiskLevel } from "@/generated/prisma/enums";
import { attemptsReadable, teamsReadable } from "@/lib/authz";
import { type OrgRole, strongestOrgRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { aggOf, averageScore, num, type PageInfo, pageInfo, topStepsByUser } from "./aggregate";
import type { ReportFilters } from "./filters";
import type { InstitutionScope } from "./scope";
import { attemptConditions, inList } from "./sql";

/**
 * Trainee progress (institution staff): one row per CURRENT member of the active organization who is a trainee or
 * has completed attempts here in the range, with attempts, average and latest score and the steps they miss most.
 * Former members' attempts still count in the institution totals but get no row. Sorted by name, paged.
 */

export type TraineeRow = {
  userId: string;
  name: string;
  role: OrgRole | null;
  departments: string[];
  attempts: number;
  average: number | null;
  latest: { id: string; score: number | null; riskLevel: RiskLevel | null; completedAt: Date } | null;
  weakSteps: Array<{ id: string; textAr: string; textEn: string }>;
};

export const TRAINEE_PAGE_SIZE = 20;

type MemberInfo = { userId: string; name: string; role: OrgRole | null; departments: string[]; teamIds: string[] };

/** Current members with their strongest role and their departments in this organization. */
async function membersWithDepartments(inst: InstitutionScope): Promise<MemberInfo[]> {
  const [members, teamMembers] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId: inst.organizationId },
      select: { userId: true, role: true, user: { select: { name: true } } },
    }),
    prisma.teamMember.findMany({
      where: { team: { is: teamsReadable(inst.scope) } },
      select: { userId: true, teamId: true, team: { select: { name: true } } },
    }),
  ]);
  const teamsOf = new Map<string, Array<{ id: string; name: string }>>();
  for (const tm of teamMembers) {
    const list = teamsOf.get(tm.userId) ?? [];
    list.push({ id: tm.teamId, name: tm.team.name });
    teamsOf.set(tm.userId, list);
  }
  return members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    role: strongestOrgRole(m.role),
    departments: (teamsOf.get(m.userId) ?? []).map((t) => t.name).sort(),
    teamIds: (teamsOf.get(m.userId) ?? []).map((t) => t.id),
  }));
}

export async function traineeProgress(
  inst: InstitutionScope,
  filters: ReportFilters,
  options: { rawPage?: string; locale: string; pageSize?: number },
): Promise<{ rows: TraineeRow[]; info: PageInfo }> {
  const pageSize = options.pageSize ?? TRAINEE_PAGE_SIZE;
  const org = inst.organizationId;
  const [members, perUser] = await Promise.all([
    membersWithDepartments(inst),
    prisma.$queryRaw<Array<{ userId: string; n: unknown; scored: unknown; sum: unknown }>>`
      SELECT a."userId" AS "userId", count(*)::int AS "n", count(a."score")::int AS "scored",
             coalesce(sum(a."score"), 0)::float8 AS "sum"
      FROM "simulation_attempt" a WHERE ${attemptConditions(org, filters)}
      GROUP BY a."userId"`,
  ]);
  const aggBy = new Map(perUser.map((r) => [r.userId, aggOf(r)]));
  const collator = new Intl.Collator(options.locale === "en" ? "en" : "ar");
  const candidates = members
    .filter((m) => m.role === "trainee" || (aggBy.get(m.userId)?.n ?? 0) > 0)
    .filter((m) => !filters.teamId || m.teamIds.includes(filters.teamId))
    .sort((a, b) => collator.compare(a.name, b.name) || (a.userId < b.userId ? -1 : 1));
  const info = pageInfo(options.rawPage, candidates.length, pageSize);
  const page = candidates.slice(info.offset, info.offset + pageSize);
  const withAttempts = page.filter((m) => (aggBy.get(m.userId)?.n ?? 0) > 0).map((m) => m.userId);

  const [latestRows, weakRows] =
    withAttempts.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.$queryRaw<Array<{ userId: string; id: string; score: number | null; riskLevel: string | null; completedAt: string }>>`
            SELECT DISTINCT ON (a."userId") a."userId" AS "userId", a.id AS "id", a."score" AS "score",
                   a."riskLevel"::text AS "riskLevel",
                   to_char(a."completedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "completedAt"
            FROM "simulation_attempt" a
            WHERE ${attemptConditions(org, filters)} AND a."userId" IN ${inList(withAttempts)}
            ORDER BY a."userId", a."completedAt" DESC, a.id`,
          prisma.$queryRaw<Array<{ userId: string; stepId: string; violated: unknown }>>`
            SELECT a."userId" AS "userId", r."stepId" AS "stepId", count(*)::int AS "violated"
            FROM "simulation_step_result" r JOIN "simulation_attempt" a ON a.id = r."attemptId"
            WHERE ${attemptConditions(org, filters)} AND a."userId" IN ${inList(withAttempts)} AND NOT r."compliant"
            GROUP BY a."userId", r."stepId"`,
        ]);
  const latestBy = new Map(latestRows.map((r) => [r.userId, r]));
  const weakBy = topStepsByUser(
    weakRows.map((r) => ({ userId: r.userId, stepId: r.stepId, violated: num(r.violated) })),
    2,
  );
  const stepIds = [...new Set([...weakBy.values()].flat())];
  const steps =
    stepIds.length === 0
      ? []
      : await prisma.protocolStep.findMany({ where: { id: { in: stepIds } }, select: { id: true, textAr: true, textEn: true } });
  const stepBy = new Map(steps.map((s) => [s.id, s]));

  const rows: TraineeRow[] = page.map((m) => {
    const agg = aggBy.get(m.userId);
    const latest = latestBy.get(m.userId);
    return {
      userId: m.userId,
      name: m.name,
      role: m.role,
      departments: m.departments,
      attempts: agg?.n ?? 0,
      average: agg ? averageScore(agg) : null,
      latest: latest
        ? {
            id: latest.id,
            score: latest.score === null ? null : num(latest.score),
            riskLevel: (latest.riskLevel as RiskLevel | null) ?? null,
            completedAt: new Date(latest.completedAt),
          }
        : null,
      weakSteps: (weakBy.get(m.userId) ?? []).flatMap((id) => {
        const s = stepBy.get(id);
        return s ? [s] : [];
      }),
    };
  });
  return { rows, info };
}

/**
 * The trainee a staff member opened (/reports/trainees/<id>): a current member of the active organization, or a
 * former member who still has attempts here. null = nothing to show (another organization's user, unknown id).
 */
export async function traineeInOrganization(
  inst: InstitutionScope,
  userId: string,
): Promise<{ userId: string; name: string; role: OrgRole | null; departments: string[]; isMember: boolean } | null> {
  const [member, attempts] = await Promise.all([
    prisma.member.findFirst({
      where: { organizationId: inst.organizationId, userId },
      select: { role: true, user: { select: { name: true } } },
    }),
    prisma.simulationAttempt.findFirst({
      where: { AND: [attemptsReadable(inst.scope), { organizationId: inst.organizationId, userId }] },
      select: { user: { select: { name: true } } },
    }),
  ]);
  if (!member && !attempts) return null;
  const departments = member
    ? (
        await prisma.teamMember.findMany({
          where: { userId, team: { is: teamsReadable(inst.scope) } },
          select: { team: { select: { name: true } } },
        })
      )
        .map((t) => t.team.name)
        .sort()
    : [];
  return {
    userId,
    name: member?.user.name ?? attempts?.user.name ?? "",
    role: member ? strongestOrgRole(member.role) : null,
    departments,
    isMember: !!member,
  };
}
