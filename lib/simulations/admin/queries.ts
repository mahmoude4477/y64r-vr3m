import "server-only";
import type { Locale } from "next-intl";
import type { Prisma } from "@/generated/prisma/client";
import type { Difficulty } from "@/generated/prisma/enums";
import { pick, pickOrNull } from "@/lib/i18n-content";
import { prisma } from "@/lib/prisma";
import type { StageKindValue } from "../engine";
import { safeExternalUrl } from "../engine";
import { type ContentRow, formValuesFromRow, inFamily, type ScenarioFormValues, versionInfo } from "./content";
import { type AdminListFilters, PAGE_SIZE, pageCount } from "./list-filters";

/**
 * Read models of the platform-admin scenario pages. Platform-admin pages query without the @/lib/authz scope helpers
 * on purpose (CONVENTIONS 4): every caller runs requireContentEditor() first, inside its Suspense'd data component.
 */

/** An institution's name in the reader's language (`name` is Arabic, `nameEn` optional). */
export function organizationName(org: { name: string; nameEn: string | null }, locale: Locale): string {
  return locale === "en" ? org.nameEn?.trim() || org.name : org.name;
}

export type ScenarioOwner = { id: string; name: string } | null;

// ---------------------------------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------------------------------

export type AdminScenarioRow = {
  id: string;
  slug: string;
  version: number;
  title: string;
  isPublished: boolean;
  difficulty: Difficulty;
  minutes: number;
  stages: number;
  attempts: number;
  updatedAt: Date;
  owner: ScenarioOwner;
  protocol: { title: string; icon: string; isPublished: boolean };
};

export type AdminScenarioList = {
  rows: AdminScenarioRow[];
  total: number;
  page: number;
  pages: number;
  /** Protocols that have at least one scenario (the protocol filter). */
  protocols: Array<{ id: string; title: string }>;
};

function listWhere(filters: AdminListFilters): Prisma.ScenarioWhereInput {
  const and: Prisma.ScenarioWhereInput[] = [];
  if (filters.owner === "global") and.push({ organizationId: null });
  if (filters.owner === "institutions") and.push({ organizationId: { not: null } });
  if (filters.status !== "all") and.push({ isPublished: filters.status === "published" });
  if (filters.protocol) and.push({ protocolId: filters.protocol });
  if (filters.q) {
    and.push({
      OR: [
        { titleAr: { contains: filters.q, mode: "insensitive" } },
        { titleEn: { contains: filters.q, mode: "insensitive" } },
        { slug: { contains: filters.q.toLowerCase() } },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

export async function adminScenarioList(filters: AdminListFilters, locale: Locale): Promise<AdminScenarioList> {
  const where = listWhere(filters);
  const [total, protocols] = await Promise.all([
    prisma.scenario.count({ where }),
    prisma.protocol.findMany({
      where: { scenarios: { some: {} } },
      select: { id: true, titleAr: true, titleEn: true, organization: { select: { name: true, nameEn: true } } },
    }),
  ]);
  const pages = pageCount(total);
  const page = Math.min(filters.page, pages);
  const rows = await prisma.scenario.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      slug: true,
      titleAr: true,
      titleEn: true,
      isPublished: true,
      difficulty: true,
      estimatedMinutes: true,
      updatedAt: true,
      organization: { select: { id: true, name: true, nameEn: true } },
      protocol: { select: { titleAr: true, titleEn: true, icon: true, isPublished: true } },
      _count: { select: { stages: true, attempts: true } },
    },
  });
  const collator = new Intl.Collator(locale);
  return {
    total,
    page,
    pages,
    protocols: protocols
      .map((p) => ({
        id: p.id,
        title: p.organization ? `${pick(p, "title", locale)} · ${organizationName(p.organization, locale)}` : pick(p, "title", locale),
      }))
      .sort((a, b) => collator.compare(a.title, b.title)),
    rows: rows.map((s) => ({
      id: s.id,
      slug: s.slug,
      version: versionInfo(s.slug).version,
      title: pick(s, "title", locale),
      isPublished: s.isPublished,
      difficulty: s.difficulty,
      minutes: s.estimatedMinutes,
      stages: s._count.stages,
      attempts: s._count.attempts,
      updatedAt: s.updatedAt,
      owner: s.organization ? { id: s.organization.id, name: organizationName(s.organization, locale) } : null,
      protocol: { title: pick(s.protocol, "title", locale), icon: s.protocol.icon, isPublished: s.protocol.isPublished },
    })),
  };
}

// ---------------------------------------------------------------------------------------------------
// Protocols a scenario of a given owner may use
// ---------------------------------------------------------------------------------------------------

/** A global scenario uses global protocols; an institution's scenario uses global ones or that institution's. */
export function eligibleProtocolsWhere(organizationId: string | null): Prisma.ProtocolWhereInput {
  return organizationId ? { OR: [{ organizationId: null }, { organizationId }] } : { organizationId: null };
}

export type ProtocolOption = {
  id: string;
  title: string;
  icon: string;
  isPublished: boolean;
  /** null = global. */
  organizationId: string | null;
  steps: Array<{ id: string; order: number; text: string; isCritical: boolean; isMandatory: boolean }>;
};

/** Global protocols first, then the institution's; by title in the reader's language. */
function byOwnerThenTitle(locale: Locale) {
  const collator = new Intl.Collator(locale);
  return (a: { organizationId: string | null; title: string }, b: { organizationId: string | null; title: string }) =>
    Number(a.organizationId !== null) - Number(b.organizationId !== null) || collator.compare(a.title, b.title);
}

async function protocolOptions(where: Prisma.ProtocolWhereInput, locale: Locale): Promise<ProtocolOption[]> {
  const rows = await prisma.protocol.findMany({
    where,
    select: {
      id: true,
      titleAr: true,
      titleEn: true,
      icon: true,
      isPublished: true,
      organizationId: true,
      steps: { orderBy: { order: "asc" }, select: { id: true, order: true, textAr: true, textEn: true, isCritical: true, isMandatory: true } },
    },
  });
  return rows
    .map((p) => ({
      id: p.id,
      title: pick(p, "title", locale),
      icon: p.icon,
      isPublished: p.isPublished,
      organizationId: p.organizationId,
      steps: p.steps.map((s) => ({ id: s.id, order: s.order, text: pick(s, "text", locale), isCritical: s.isCritical, isMandatory: s.isMandatory })),
    }))
    .sort(byOwnerThenTitle(locale));
}

export type CreateProtocolOption = { id: string; title: string; isPublished: boolean; organizationId: string | null };

export type CreateOptions = {
  /** Every protocol (global first), with its owner, so the form can filter by the chosen owner. */
  protocols: CreateProtocolOption[];
  institutions: Array<{ id: string; name: string; slug: string }>;
};

export async function adminCreateOptions(locale: Locale): Promise<CreateOptions> {
  const [protocols, orgs] = await Promise.all([
    prisma.protocol.findMany({ select: { id: true, titleAr: true, titleEn: true, isPublished: true, organizationId: true } }),
    prisma.organization.findMany({ select: { id: true, name: true, nameEn: true, slug: true } }),
  ]);
  const collator = new Intl.Collator(locale);
  return {
    protocols: protocols
      .map((p) => ({ id: p.id, title: pick(p, "title", locale), isPublished: p.isPublished, organizationId: p.organizationId }))
      .sort(byOwnerThenTitle(locale)),
    institutions: orgs
      .map((o) => ({ id: o.id, name: organizationName(o, locale), slug: o.slug }))
      .sort((a, b) => collator.compare(a.name, b.name)),
  };
}

// ---------------------------------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------------------------------

const contentSelect = {
  titleAr: true,
  titleEn: true,
  introAr: true,
  introEn: true,
  settingAr: true,
  settingEn: true,
  protocolId: true,
  difficulty: true,
  estimatedMinutes: true,
  stages: {
    orderBy: { order: "asc" },
    select: {
      kind: true,
      contextAr: true,
      contextEn: true,
      promptAr: true,
      promptEn: true,
      options: {
        orderBy: { order: "asc" },
        select: { textAr: true, textEn: true, isCorrect: true, isCritical: true, stepId: true, feedbackAr: true, feedbackEn: true },
      },
    },
  },
} as const satisfies Prisma.ScenarioSelect;

export type FamilyMember = {
  id: string;
  slug: string;
  version: number;
  isPublished: boolean;
  attempts: number;
  /** Attempts still in progress (closed as unfinished when another version of the family is published). */
  inProgress: number;
};

export type EditorData = {
  id: string;
  slug: string;
  version: number;
  isPublished: boolean;
  /** ISO time of the last change: the save sends it back so a concurrent edit is detected. */
  updatedAt: string;
  owner: ScenarioOwner;
  title: string;
  attempts: { total: number; inProgress: number };
  content: ScenarioFormValues;
  protocols: ProtocolOption[];
  /** Every version of this scenario (same owner, same base slug), lowest number first. */
  family: FamilyMember[];
};

/** A scenario's title for the editor and preview page titles. Callers check the platform admin first (unfiltered read). */
export async function adminScenarioTitle(id: string, locale: Locale): Promise<string | null> {
  const row = await prisma.scenario.findUnique({ where: { id }, select: { titleAr: true, titleEn: true } });
  return row ? pick(row, "title", locale) : null;
}

/** Family members of a slug in one owner (global or one institution), with their attempt counts. */
export async function scenarioFamily(slug: string, organizationId: string | null): Promise<FamilyMember[]> {
  const { base } = versionInfo(slug);
  const rows = (
    await prisma.scenario.findMany({
      where: { organizationId, OR: [{ slug: base }, { slug: { startsWith: `${base}-v` } }] },
      select: { id: true, slug: true, isPublished: true, _count: { select: { attempts: true } } },
    })
  ).filter((r) => inFamily(base, r.slug));
  const open =
    rows.length === 0
      ? []
      : await prisma.simulationAttempt.groupBy({
          by: ["scenarioId"],
          where: { scenarioId: { in: rows.map((r) => r.id) }, status: "in_progress" },
          _count: { _all: true },
        });
  const openBy = new Map(open.map((o) => [o.scenarioId, o._count._all]));
  return rows
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      version: versionInfo(r.slug).version,
      isPublished: r.isPublished,
      attempts: r._count.attempts,
      inProgress: openBy.get(r.id) ?? 0,
    }))
    .sort((a, b) => a.version - b.version);
}

export async function adminEditorData(id: string, locale: Locale): Promise<EditorData | null> {
  const row = await prisma.scenario.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      isPublished: true,
      updatedAt: true,
      organizationId: true,
      organization: { select: { id: true, name: true, nameEn: true } },
      ...contentSelect,
    },
  });
  if (!row) return null;
  const [total, inProgress, protocols, family] = await Promise.all([
    prisma.simulationAttempt.count({ where: { scenarioId: id } }),
    prisma.simulationAttempt.count({ where: { scenarioId: id, status: "in_progress" } }),
    protocolOptions(eligibleProtocolsWhere(row.organizationId), locale),
    scenarioFamily(row.slug, row.organizationId),
  ]);
  return {
    id: row.id,
    slug: row.slug,
    version: versionInfo(row.slug).version,
    isPublished: row.isPublished,
    updatedAt: row.updatedAt.toISOString(),
    owner: row.organization ? { id: row.organization.id, name: organizationName(row.organization, locale) } : null,
    title: pick(row, "title", locale),
    attempts: { total, inProgress },
    content: formValuesFromRow(row as ContentRow),
    protocols,
    family,
  };
}

// ---------------------------------------------------------------------------------------------------
// Preview ("play as a trainee", nothing saved)
// ---------------------------------------------------------------------------------------------------

export type PreviewStep = {
  id: string;
  protocolId: string;
  order: number;
  text: string;
  rationale: string;
  source: { label: string; url: string | null } | null;
  weight: number;
  isMandatory: boolean;
  isCritical: boolean;
};

export type PreviewOption = {
  id: string;
  text: string;
  feedback: string;
  isCorrect: boolean;
  isCritical: boolean;
  stepId: string | null;
};

export type PreviewData = {
  scenario: {
    id: string;
    slug: string;
    title: string;
    intro: string;
    setting: string;
    difficulty: Difficulty;
    minutes: number;
    isPublished: boolean;
    /** Trainees have attempted it (an unpublished one is then "Unpublished", not a "Draft"). */
    played: boolean;
    protocol: { slug: string; title: string; icon: string; isPublished: boolean };
  };
  stages: Array<{ id: string; kind: StageKindValue; prompt: string; context: string | null; options: PreviewOption[] }>;
  /** The protocol steps the options link to (scoring metadata + text for the review). */
  steps: PreviewStep[];
};

/**
 * The whole scenario for the admin preview, correct answers and feedback included: the preview page is platform
 * admin only, and it plays in the browser without saving anything.
 */
export async function adminPreviewData(id: string, locale: Locale): Promise<PreviewData | null> {
  const row = await prisma.scenario.findUnique({
    where: { id },
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
      isPublished: true,
      _count: { select: { attempts: true } },
      protocol: { select: { slug: true, titleAr: true, titleEn: true, icon: true, isPublished: true } },
      stages: {
        orderBy: { order: "asc" },
        select: {
          id: true,
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
              feedbackAr: true,
              feedbackEn: true,
              isCorrect: true,
              isCritical: true,
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
        },
      },
    },
  });
  if (!row) return null;
  const steps = new Map<string, PreviewStep>();
  for (const stage of row.stages) {
    for (const option of stage.options) {
      const s = option.step;
      if (!s || steps.has(s.id)) continue;
      steps.set(s.id, {
        id: s.id,
        protocolId: s.protocolId,
        order: s.order,
        text: pick(s, "text", locale),
        rationale: pick(s, "rationale", locale),
        source: s.referenceLabel ? { label: s.referenceLabel, url: safeExternalUrl(s.referenceUrl) } : null,
        weight: s.weight,
        isMandatory: s.isMandatory,
        isCritical: s.isCritical,
      });
    }
  }
  return {
    scenario: {
      id: row.id,
      slug: row.slug,
      title: pick(row, "title", locale),
      intro: pick(row, "intro", locale),
      setting: pick(row, "setting", locale),
      difficulty: row.difficulty,
      minutes: row.estimatedMinutes,
      isPublished: row.isPublished,
      played: row._count.attempts > 0,
      protocol: {
        slug: row.protocol.slug,
        title: pick(row.protocol, "title", locale),
        icon: row.protocol.icon,
        isPublished: row.protocol.isPublished,
      },
    },
    stages: row.stages.map((stage) => ({
      id: stage.id,
      kind: stage.kind,
      prompt: pick(stage, "prompt", locale),
      context: pickOrNull(stage, "context", locale),
      options: stage.options.map((o) => ({
        id: o.id,
        text: pick(o, "text", locale),
        feedback: pick(o, "feedback", locale),
        isCorrect: o.isCorrect,
        isCritical: o.isCritical,
        stepId: o.step?.id ?? null,
      })),
    })),
    steps: [...steps.values()].sort((a, b) => a.order - b.order),
  };
}
