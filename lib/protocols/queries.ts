import "server-only";
import type { Locale } from "next-intl";
import type { Prisma } from "@/generated/prisma/client";
import { protocolsReadable, type Scope, scenariosReadable } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { prisma } from "@/lib/prisma";
import { SLUG_PATTERN } from "@/lib/validation/protocol";
import {
  filterLibrary,
  type LibraryEntry,
  type LibraryFilters,
  type LibraryResult,
  type ProtocolCategoryValue,
  searchIndex,
} from "./search";
import { type StepSummary, summarizeSteps } from "./steps";
import { loadGlobalVersionEdges, newerVersions, type VersionEdge, versionFamily } from "./versions";

/**
 * Reads of the protocol library (/protocols, /protocols/[slug]). Every where-clause starts from
 * protocolsReadable / scenariosReadable (lib/authz.ts), AND the library shows published protocols only: an
 * institution's drafts live in its editor (/org/protocols), never here.
 */

/** Published protocols the user may read: global ones + the active institution's own. */
function libraryWhere(scope: Scope, extra?: Prisma.ProtocolWhereInput): Prisma.ProtocolWhereInput {
  return { AND: [protocolsReadable(scope), { isPublished: true }, ...(extra ? [extra] : [])] };
}

export type LibraryCard = {
  id: string;
  slug: string;
  category: ProtocolCategoryValue;
  icon: string;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  /** The active institution's own protocol (a custom copy or its own). */
  own: boolean;
  /** Title of the protocol it was copied from, when the user may read that one too. */
  source: { slug: string; titleAr: string; titleEn: string } | null;
  steps: StepSummary;
};

export async function getProtocolLibrary(scope: Scope, filters: LibraryFilters, locale: Locale): Promise<LibraryResult<LibraryCard>> {
  const rows = await prisma.protocol.findMany({
    where: libraryWhere(scope),
    select: {
      id: true,
      slug: true,
      organizationId: true,
      sourceProtocolId: true,
      category: true,
      icon: true,
      titleAr: true,
      titleEn: true,
      summaryAr: true,
      summaryEn: true,
      descriptionAr: true,
      descriptionEn: true,
      steps: { select: { textAr: true, textEn: true, isMandatory: true, isCritical: true, visualCheck: true } },
    },
  });
  // The fetched set IS everything the user may read, so a source outside it stays unnamed.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const hasOwnCopy = rows.some((r) => r.organizationId !== null && r.organizationId === scope.organizationId && r.sourceProtocolId !== null);
  const replaced = replacedSources(rows, scope.organizationId, hasOwnCopy ? await loadGlobalVersionEdges() : []);
  const entries: Array<LibraryEntry<LibraryCard>> = rows.filter((row) => !replaced.has(row.id)).map((row) => {
    const source = row.sourceProtocolId ? byId.get(row.sourceProtocolId) : undefined;
    const own = row.organizationId !== null && row.organizationId === scope.organizationId;
    return {
      category: row.category,
      own,
      title: pick(row, "title", locale),
      index: searchIndex(row),
      item: {
        id: row.id,
        slug: row.slug,
        category: row.category,
        icon: row.icon,
        titleAr: row.titleAr,
        titleEn: row.titleEn,
        summaryAr: row.summaryAr,
        summaryEn: row.summaryEn,
        own,
        source: source ? { slug: source.slug, titleAr: source.titleAr, titleEn: source.titleEn } : null,
        steps: summarizeSteps(row.steps),
      },
    };
  });
  return filterLibrary(entries, filters, locale);
}

/**
 * Global protocols the active institution has replaced with a published copy of its own: its members follow the
 * institution's version, so the library lists that one only (it names its source, and the copy's page links to it).
 * Every version of the copied protocol counts (`edges`, lib/protocols/versions.ts): a newer global version does not
 * bring the same protocol back next to the copy; the institution's managers are told about it instead.
 * Pure, unit-tested. `rows` are the published protocols the user may read.
 */
export function replacedSources(
  rows: ReadonlyArray<{ organizationId: string | null; sourceProtocolId: string | null }>,
  organizationId: string | null,
  edges: readonly VersionEdge[] = [],
): Set<string> {
  const out = new Set<string>();
  if (!organizationId) return out;
  for (const row of rows) {
    if (row.organizationId !== organizationId || !row.sourceProtocolId || out.has(row.sourceProtocolId)) continue;
    for (const id of versionFamily(edges, row.sourceProtocolId)) out.add(id);
  }
  return out;
}

const detailSelect = {
  id: true,
  slug: true,
  organizationId: true,
  sourceProtocolId: true,
  category: true,
  icon: true,
  titleAr: true,
  titleEn: true,
  summaryAr: true,
  summaryEn: true,
  descriptionAr: true,
  descriptionEn: true,
  steps: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      key: true,
      order: true,
      textAr: true,
      textEn: true,
      rationaleAr: true,
      rationaleEn: true,
      criteriaAr: true,
      criteriaEn: true,
      referenceLabel: true,
      referenceUrl: true,
      isMandatory: true,
      isCritical: true,
      weight: true,
      visualCheck: true,
    },
  },
} satisfies Prisma.ProtocolSelect;

export type ProtocolDetail = Prisma.ProtocolGetPayload<{ select: typeof detailSelect }>;
export type ProtocolDetailStep = ProtocolDetail["steps"][number];

/** A slug that can exist (same rule as the editors); anything else is not found without a query. */
function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 80 && SLUG_PATTERN.test(slug);
}

/** One published protocol the user may read, with its ordered steps; null = not found for this user. */
export async function getProtocolDetail(scope: Scope, slug: string): Promise<ProtocolDetail | null> {
  if (!isValidSlug(slug)) return null;
  return prisma.protocol.findFirst({ where: libraryWhere(scope, { slug }), select: detailSelect });
}

/** Just the titles, for the page title (generateMetadata). Same visibility rule as the page. */
export async function getProtocolTitles(scope: Scope, slug: string): Promise<{ titleAr: string; titleEn: string } | null> {
  if (!isValidSlug(slug)) return null;
  return prisma.protocol.findFirst({ where: libraryWhere(scope, { slug }), select: { titleAr: true, titleEn: true } });
}

export type ProtocolSource = { id: string; slug: string; titleAr: string; titleEn: string };

/** The protocol an institution's copy was made from, when the user may read it (else null: shown unnamed). */
export async function getReadableSource(scope: Scope, sourceProtocolId: string | null): Promise<ProtocolSource | null> {
  if (!sourceProtocolId) return null;
  return prisma.protocol.findFirst({
    where: libraryWhere(scope, { id: sourceProtocolId }),
    select: { id: true, slug: true, titleAr: true, titleEn: true },
  });
}

export type TrainingScenario = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  introAr: string;
  introEn: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  stages: number;
  /** The active institution's own scenario. */
  own: boolean;
};

export type TrainingScenarios = {
  scenarios: TrainingScenario[];
  /** The list comes from the protocol this copy was made from (the copy has none of its own). */
  fromSource: boolean;
};

/**
 * Published scenarios the user may play for this protocol: the institution's own first, then global ones,
 * easiest first. A custom copy with no scenario of its own shows the scenarios of its source protocol (the rule of
 * lib/recommendations.ts), as long as that source is published and readable too; when the source has none (they were
 * moved to a newer version, or the source is unpublished), those of the newest published newer version of it.
 */
export async function getTrainingScenarios(
  scope: Scope,
  protocolId: string,
  sourceProtocolId: string | null,
): Promise<TrainingScenarios> {
  const fallback = sourceProtocolId ? [sourceProtocolId, ...newerVersions(await loadGlobalVersionEdges(), sourceProtocolId)] : [];
  const protocolIds = [protocolId, ...fallback.filter((id) => id !== protocolId)];
  const rows = await prisma.scenario.findMany({
    where: {
      AND: [scenariosReadable(scope), { protocolId: { in: protocolIds } }, { protocol: { is: { isPublished: true } } }],
    },
    orderBy: [{ difficulty: "asc" }, { estimatedMinutes: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      protocolId: true,
      organizationId: true,
      titleAr: true,
      titleEn: true,
      introAr: true,
      introEn: true,
      difficulty: true,
      estimatedMinutes: true,
      _count: { select: { stages: true } },
    },
  });
  return pickTrainingScenarios(rows, protocolId, scope.organizationId, fallback);
}

type ScenarioRow = {
  id: string;
  slug: string;
  protocolId: string;
  organizationId: string | null;
  titleAr: string;
  titleEn: string;
  introAr: string;
  introEn: string;
  difficulty: TrainingScenario["difficulty"];
  estimatedMinutes: number;
  _count: { stages: number };
};

/**
 * Pure part (unit-tested): the protocol's own scenarios, else those of the first protocol in `fallback` that has any
 * (a copy's source, then its newer versions, newest first); the institution's own first.
 */
export function pickTrainingScenarios(
  rows: readonly ScenarioRow[],
  protocolId: string,
  organizationId: string | null,
  fallback: readonly string[] = [],
): TrainingScenarios {
  const own = rows.filter((r) => r.protocolId === protocolId);
  const from = own.length > 0 ? null : fallback.find((id) => rows.some((r) => r.protocolId === id));
  const chosen = own.length > 0 ? own : from ? rows.filter((r) => r.protocolId === from) : [];
  const isOwn = (r: ScenarioRow) => organizationId !== null && r.organizationId === organizationId;
  const scenarios = chosen
    .map((r, position) => ({ r, position }))
    .sort((a, b) => Number(isOwn(b.r)) - Number(isOwn(a.r)) || a.position - b.position)
    .map(({ r }) => ({
      id: r.id,
      slug: r.slug,
      titleAr: r.titleAr,
      titleEn: r.titleEn,
      introAr: r.introAr,
      introEn: r.introEn,
      difficulty: r.difficulty,
      estimatedMinutes: r.estimatedMinutes,
      stages: r._count.stages,
      own: isOwn(r),
    }));
  return { scenarios, fromSource: own.length === 0 && scenarios.length > 0 };
}
