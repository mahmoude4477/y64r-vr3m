import "server-only";
import type { Locale } from "next-intl";
import type { Difficulty, RiskLevel } from "@/generated/prisma/enums";
import { attemptsOwn, attemptsReadable, type Scope, scenariosReadable } from "@/lib/authz";
import { pick, pickOrNull } from "@/lib/i18n-content";
import { prisma } from "@/lib/prisma";
import { inFamily, versionInfo } from "./admin/content";
import { attemptsContinuable, resumableAttempt } from "./attempt-scope";
import type { StageKindValue } from "./engine";

/**
 * Read models of the three simulation pages. Every query is built from @/lib/authz (scenariosReadable,
 * attemptsOwn, attemptsReadable) and returns plain, already-localised data the components can render or pass to
 * the browser. Correct answers and feedback never leave the server before an attempt is completed.
 */

// ---------------------------------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------------------------------

export type CatalogueItem = {
  id: string;
  slug: string;
  title: string;
  intro: string;
  difficulty: Difficulty;
  minutes: number;
  stages: number;
  protocol: { slug: string; title: string; icon: string };
  /** The user's own completed attempts on this scenario. */
  completed: number;
  /** Best stored score (null: no assessable attempt yet). */
  bestScore: number | null;
  last: { id: string; score: number | null; riskLevel: RiskLevel | null; completedAt: string } | null;
  /** The open attempt the user can continue here (./attempt-scope.ts), if any: answered stages out of `stages`. */
  inProgress: { id: string; answered: number } | null;
};

export async function catalogueItems(scope: Scope, locale: Locale): Promise<CatalogueItem[]> {
  const scenarios = await prisma.scenario.findMany({
    where: scenariosReadable(scope),
    orderBy: [{ difficulty: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      titleAr: true,
      titleEn: true,
      introAr: true,
      introEn: true,
      difficulty: true,
      estimatedMinutes: true,
      protocol: { select: { slug: true, titleAr: true, titleEn: true, icon: true } },
      _count: { select: { stages: true } },
    },
  });
  if (scenarios.length === 0) return [];
  const ids = scenarios.map((s) => s.id);
  const own = { ...attemptsOwn(scope), scenarioId: { in: ids } };
  const [stats, latest, open] = await Promise.all([
    prisma.simulationAttempt.groupBy({
      by: ["scenarioId"],
      where: { ...own, status: "completed" },
      _count: { _all: true },
      _max: { score: true },
    }),
    prisma.simulationAttempt.findMany({
      where: { ...own, status: "completed" },
      orderBy: [{ scenarioId: "asc" }, { completedAt: "desc" }],
      distinct: ["scenarioId"],
      select: { id: true, scenarioId: true, score: true, riskLevel: true, completedAt: true },
    }),
    // At most two per scenario (one of the active institution, one of none): resumableAttempt picks as the player does.
    prisma.simulationAttempt.findMany({
      where: { AND: [attemptsContinuable(scope), { scenarioId: { in: ids } }] },
      orderBy: { startedAt: "desc" },
      select: { id: true, scenarioId: true, organizationId: true, _count: { select: { answers: true } } },
    }),
  ]);
  const statsBy = new Map(stats.map((s) => [s.scenarioId, s]));
  const latestBy = new Map(latest.map((a) => [a.scenarioId, a]));
  const openBy = new Map<string, (typeof open)[number]>();
  for (const id of ids) {
    const current = resumableAttempt(open.filter((a) => a.scenarioId === id), scope);
    if (current) openBy.set(id, current);
  }

  const items = scenarios.map((s): CatalogueItem => {
    const stat = statsBy.get(s.id);
    const last = latestBy.get(s.id);
    const current = openBy.get(s.id);
    return {
      id: s.id,
      slug: s.slug,
      title: pick(s, "title", locale),
      intro: pick(s, "intro", locale),
      difficulty: s.difficulty,
      minutes: s.estimatedMinutes,
      stages: s._count.stages,
      protocol: { slug: s.protocol.slug, title: pick(s.protocol, "title", locale), icon: s.protocol.icon },
      completed: stat?._count._all ?? 0,
      bestScore: stat?._max.score ?? null,
      last: last
        ? { id: last.id, score: last.score, riskLevel: last.riskLevel, completedAt: (last.completedAt ?? new Date()).toISOString() }
        : null,
      inProgress: current ? { id: current.id, answered: Math.min(current._count.answers, s._count.stages) } : null,
    };
  });
  // Easiest first, then by title in the reader's language (Arabic collation for Arabic).
  const order = { beginner: 0, intermediate: 1, advanced: 2 } as const;
  const collator = new Intl.Collator(locale);
  return items.sort((a, b) => order[a.difficulty] - order[b.difficulty] || collator.compare(a.title, b.title));
}

// ---------------------------------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------------------------------

export type PlayerStage = {
  id: string;
  kind: StageKindValue;
  prompt: string;
  context: string | null;
  /** Database order; the player shuffles per attempt (engine.shuffleOptions). No correctness, no feedback. */
  options: Array<{ id: string; text: string }>;
};

export type PlayerData = {
  scenario: {
    id: string;
    slug: string;
    title: string;
    intro: string;
    setting: string;
    difficulty: Difficulty;
    minutes: number;
    protocol: { slug: string; title: string; icon: string };
  };
  stages: PlayerStage[];
  attempt: { id: string; answeredStageIds: string[] } | null;
  history: { completed: number; bestScore: number | null; lastAttemptId: string | null };
};

export async function playerData(scope: Scope, slug: string, locale: Locale): Promise<PlayerData | null> {
  const scenario = await prisma.scenario.findFirst({
    where: { AND: [{ slug }, scenariosReadable(scope)] },
    select: {
      id: true,
      slug: true,
      titleAr: true,
      titleEn: true,
      introAr: true,
      introEn: true,
      settingAr: true,
      settingEn: true,
      difficulty: true,
      estimatedMinutes: true,
      protocol: { select: { slug: true, titleAr: true, titleEn: true, icon: true } },
      stages: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          kind: true,
          promptAr: true,
          promptEn: true,
          contextAr: true,
          contextEn: true,
          options: { orderBy: { order: "asc" }, select: { id: true, textAr: true, textEn: true } },
        },
      },
    },
  });
  if (!scenario) return null;
  const own = { ...attemptsOwn(scope), scenarioId: scenario.id };
  const [open, stats, last] = await Promise.all([
    prisma.simulationAttempt.findMany({
      where: { AND: [attemptsContinuable(scope), { scenarioId: scenario.id }] },
      orderBy: { startedAt: "desc" },
      select: { id: true, organizationId: true, answers: { select: { stageId: true } } },
    }),
    prisma.simulationAttempt.aggregate({ where: { ...own, status: "completed" }, _count: { _all: true }, _max: { score: true } }),
    prisma.simulationAttempt.findFirst({ where: { ...own, status: "completed" }, orderBy: { completedAt: "desc" }, select: { id: true } }),
  ]);
  const current = resumableAttempt(open, scope);
  return {
    scenario: {
      id: scenario.id,
      slug: scenario.slug,
      title: pick(scenario, "title", locale),
      intro: pick(scenario, "intro", locale),
      setting: pick(scenario, "setting", locale),
      difficulty: scenario.difficulty,
      minutes: scenario.estimatedMinutes,
      protocol: { slug: scenario.protocol.slug, title: pick(scenario.protocol, "title", locale), icon: scenario.protocol.icon },
    },
    stages: scenario.stages.map((stage) => ({
      id: stage.id,
      kind: stage.kind,
      prompt: pick(stage, "prompt", locale),
      context: pickOrNull(stage, "context", locale),
      options: stage.options.map((o) => ({ id: o.id, text: pick(o, "text", locale) })),
    })),
    attempt: current ? { id: current.id, answeredStageIds: current.answers.map((a) => a.stageId) } : null,
    history: { completed: stats._count._all, bestScore: stats._max.score ?? null, lastAttemptId: last?.id ?? null },
  };
}

/**
 * The slug of the version of this scenario the user may play now, when `slug` itself is not playable (an older
 * version was unpublished when a new one was published, lib/simulations/admin): old links, bookmarks and "Try again"
 * on an old result then open the current version. Null when there is none.
 */
export async function playableVersionSlug(scope: Scope, slug: string): Promise<string | null> {
  const { base } = versionInfo(slug);
  const rows = await prisma.scenario.findMany({
    where: { AND: [{ OR: [{ slug: base }, { slug: { startsWith: `${base}-v` } }] }, scenariosReadable(scope)] },
    select: { slug: true },
  });
  const playable = rows.map((r) => r.slug).filter((s) => s !== slug && inFamily(base, s));
  playable.sort((a, b) => versionInfo(b).version - versionInfo(a).version);
  return playable[0] ?? null;
}

/**
 * Where "Try again" / "Continue" of a result page leads: the scenario itself while the user may play it, else the
 * version published now (playableVersionSlug), else nowhere (null: the page shows no such button).
 */
export async function playableSlug(scope: Scope, scenario: { id: string; slug: string }): Promise<string | null> {
  const readable = await prisma.scenario.findFirst({ where: { AND: [{ id: scenario.id }, scenariosReadable(scope)] }, select: { slug: true } });
  return readable ? readable.slug : playableVersionSlug(scope, scenario.slug);
}

/**
 * The id of the open attempt the player continues on this scenario in the active context (resumableAttempt), or null.
 * The result page of another open attempt uses it to tell whether "Continue" really leads back to that attempt.
 */
export async function resumableAttemptId(scope: Scope, scenarioId: string): Promise<string | null> {
  const open = await prisma.simulationAttempt.findMany({
    where: { AND: [attemptsContinuable(scope), { scenarioId }] },
    orderBy: { startedAt: "desc" },
    select: { id: true, organizationId: true },
  });
  return resumableAttempt(open, scope)?.id ?? null;
}

/** The scenario title for the player page title (null when the user may not play it: the generic title is used). */
export async function playerTitle(scope: Scope, slug: string, locale: Locale): Promise<string | null> {
  const row = await prisma.scenario.findFirst({ where: { AND: [{ slug }, scenariosReadable(scope)] }, select: { titleAr: true, titleEn: true } });
  return row ? pick(row, "title", locale) : null;
}

// ---------------------------------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------------------------------

/** The scenario title of an attempt for the result page title, with the same visibility as the page (attemptsReadable). */
export async function attemptTitle(scope: Scope, id: string, locale: Locale): Promise<string | null> {
  const row = await prisma.simulationAttempt.findFirst({
    where: { AND: [{ id }, attemptsReadable(scope)] },
    select: { scenario: { select: { titleAr: true, titleEn: true } } },
  });
  return row ? pick(row.scenario, "title", locale) : null;
}

const resultSelect = {
  id: true,
  userId: true,
  organizationId: true,
  status: true,
  startedAt: true,
  completedAt: true,
  durationSec: true,
  score: true,
  riskLevel: true,
  debriefAr: true,
  debriefEn: true,
  user: { select: { name: true } },
  scenario: {
    select: {
      id: true,
      slug: true,
      titleAr: true,
      titleEn: true,
      protocol: { select: { id: true, slug: true, titleAr: true, titleEn: true, icon: true } },
      stages: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          kind: true,
          promptAr: true,
          promptEn: true,
          contextAr: true,
          contextEn: true,
          options: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              textAr: true,
              textEn: true,
              isCorrect: true,
              isCritical: true,
              feedbackAr: true,
              feedbackEn: true,
              step: { select: { id: true, textAr: true, textEn: true, isCritical: true, referenceLabel: true, referenceUrl: true } },
            },
          },
        },
      },
    },
  },
  answers: { select: { stageId: true, optionIds: true } },
  stepResults: {
    select: {
      compliant: true,
      critical: true,
      step: {
        select: {
          id: true,
          protocolId: true,
          order: true,
          textAr: true,
          textEn: true,
          rationaleAr: true,
          rationaleEn: true,
          referenceLabel: true,
          referenceUrl: true,
          weight: true,
          isMandatory: true,
          isCritical: true,
        },
      },
    },
  },
} as const;

/** The attempt for its result page: the owner, or staff of the attempt's institution (attemptsReadable). */
export async function attemptForResult(scope: Scope, id: string) {
  return prisma.simulationAttempt.findFirst({ where: { AND: [{ id }, attemptsReadable(scope)] }, select: resultSelect });
}

export type AttemptForResult = NonNullable<Awaited<ReturnType<typeof attemptForResult>>>;
