import "server-only";
import type { Locale } from "next-intl";
import type { Prisma } from "@/generated/prisma/client";
import { isOrgManager, protocolsReadable, type Scope } from "@/lib/authz";
import { localizedColumn } from "@/lib/i18n-content";
import { prisma } from "@/lib/prisma";
import { type EditorValues, protocolToEditorValues } from "./editor-form";
import { editableWhere, type EditorScope } from "./editor-scope";
import { canDeleteProtocol, type DeleteCheck, type ProtocolUsage, protocolUsage, stepResultCount } from "./history";
import { type StepSummary, summarizeSteps } from "./steps";
import { loadGlobalVersionEdges, newerVersions, type VersionEdge } from "./versions";

/**
 * Reads of the protocol editor pages (/admin/protocols/**, /org/protocols/**). Editor reads go through
 * editableWhere(kind, scope); the platform-admin lists query unfiltered after requireContentEditor() (CONVENTIONS 4).
 */

/** Ids are cuids; anything else is not found without a query. */
export function isPlausibleId(id: string): boolean {
  return /^[a-z0-9]{8,64}$/i.test(id);
}

const usageCount = { select: { scanResults: true, simulationResults: true, options: true } } as const;

const editorSelect = {
  id: true,
  slug: true,
  organizationId: true,
  sourceProtocolId: true,
  isPublished: true,
  updatedAt: true,
  category: true,
  icon: true,
  titleAr: true,
  titleEn: true,
  summaryAr: true,
  summaryEn: true,
  descriptionAr: true,
  descriptionEn: true,
  _count: { select: { scans: true, scenarios: true, copies: true } },
  steps: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      key: true,
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
      _count: usageCount,
    },
  },
} satisfies Prisma.ProtocolSelect;

export type LinkedProtocol = { id: string; slug: string; titleAr: string; titleEn: string; isPublished: boolean };

/** A version of the same protocol, with what stays attached to it (scenarios and institution copies never move). */
export type VersionLink = LinkedProtocol & { scenarios: number; copies: number };

/** Saved step id -> what points at it: assessment results (lock its meaning) and scenario answer options. */
export type StepUsageCounts = { results: number; options: number };

export type EditorProtocol = {
  id: string;
  slug: string;
  isPublished: boolean;
  /** Optimistic-concurrency token: the row's updatedAt (ISO). A save or publish with an older one is refused. */
  version: string;
  titleAr: string;
  titleEn: string;
  values: EditorValues;
  stepUsage: Record<string, StepUsageCounts>;
  usage: ProtocolUsage;
  deletable: DeleteCheck;
  /** The global protocol an institution copy was made from. */
  source: LinkedProtocol | null;
  /** The protocol this one is a new version of (Protocol.versionOfId). */
  versionOf: VersionLink | null;
  /** The newest version made from this one, when there is one. */
  newerVersion: LinkedProtocol | null;
  /**
   * Institution copies: the newest PUBLISHED newer version of the global protocol it was copied from, and the
   * institution's newest copy of a newer version (when it already has one). The copy itself never changes.
   */
  newerSource: NewerSource | null;
};

export type NewerSource = { id: string; slug: string; titleAr: string; titleEn: string; copyId: string | null };

const linkedSelect = { id: true, slug: true, titleAr: true, titleEn: true, isPublished: true } as const;
const versionSelect = { ...linkedSelect, _count: { select: { scenarios: true, copies: true } } } as const;

/** One protocol for the editor of `kind`, or null when this user may not edit it there. */
export async function getEditorProtocol(kind: EditorScope, scope: Scope, id: string): Promise<EditorProtocol | null> {
  if (!isPlausibleId(id)) return null;
  const row = await prisma.protocol.findFirst({ where: { AND: [{ id }, editableWhere(kind, scope)] }, select: editorSelect });
  if (!row) return null;

  const [source, versionOf, newerVersion, newerSource] = await Promise.all([
    row.sourceProtocolId
      ? prisma.protocol.findFirst({ where: { id: row.sourceProtocolId, organizationId: null }, select: linkedSelect })
      : Promise.resolve(null),
    previousVersion(kind, scope, row.id),
    nextVersion(kind, scope, row.id),
    kind === "institution" && row.organizationId && row.sourceProtocolId
      ? newerSourceOf(row.organizationId, row.id, row.sourceProtocolId)
      : Promise.resolve(null),
  ]);
  const stepUsages = row.steps.map((s) => s._count);
  const usage = protocolUsage(row._count, stepUsages);
  return {
    id: row.id,
    slug: row.slug,
    isPublished: row.isPublished,
    version: row.updatedAt.toISOString(),
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    values: protocolToEditorValues(row),
    stepUsage: Object.fromEntries(row.steps.map((s) => [s.id, { results: stepResultCount(s._count), options: s._count.options }])),
    usage,
    deletable: canDeleteProtocol({ isPublished: row.isPublished, usage }),
    source,
    versionOf,
    newerVersion,
    newerSource,
  };
}

/** The newest published global protocol of `ids` (given newest first), or null. */
async function newestPublished(ids: readonly string[]) {
  if (ids.length === 0) return null;
  const found = await prisma.protocol.findMany({
    where: { id: { in: [...ids] }, organizationId: null, isPublished: true },
    select: { id: true, slug: true, titleAr: true, titleEn: true },
  });
  return ids.map((id) => found.find((f) => f.id === id)).find((f) => f !== undefined) ?? null;
}

/** For the institution copy `copyId`: see EditorProtocol.newerSource. */
async function newerSourceOf(organizationId: string, copyId: string, sourceProtocolId: string): Promise<NewerSource | null> {
  const newer = newerVersions(await loadGlobalVersionEdges(), sourceProtocolId);
  const latest = await newestPublished(newer);
  if (!latest) return null;
  const adopted = await prisma.protocol.findFirst({
    where: { organizationId, sourceProtocolId: { in: newer }, id: { not: copyId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return { ...latest, copyId: adopted?.id ?? null };
}

/** The protocol a version was made from, when the same editor may still see it. */
async function previousVersion(kind: EditorScope, scope: Scope, id: string): Promise<VersionLink | null> {
  const self = await prisma.protocol.findFirst({ where: { id }, select: { versionOfId: true } });
  const from = self?.versionOfId;
  if (!from) return null;
  const row = await prisma.protocol.findFirst({ where: { AND: [{ id: from }, editableWhere(kind, scope)] }, select: versionSelect });
  if (!row) return null;
  const { _count, ...link } = row;
  return { ...link, scenarios: _count.scenarios, copies: _count.copies };
}

/** The newest version made from this protocol that the same editor may see (Protocol.versionOfId). */
async function nextVersion(kind: EditorScope, scope: Scope, id: string): Promise<LinkedProtocol | null> {
  return prisma.protocol.findFirst({
    where: { AND: [{ versionOfId: id }, editableWhere(kind, scope)] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: linkedSelect,
  });
}

/** The editor page title (generateMetadata): same visibility rule as the page. */
export async function getEditorProtocolTitles(kind: EditorScope, scope: Scope, id: string) {
  if (!isPlausibleId(id)) return null;
  return prisma.protocol.findFirst({ where: { AND: [{ id }, editableWhere(kind, scope)] }, select: { titleAr: true, titleEn: true } });
}

// ---------------------------------------------------------------------------------------------------------------
// Lists

export type ProtocolRow = {
  id: string;
  slug: string;
  icon: string;
  category: "safety" | "hygiene" | "waste" | "maintenance" | "other";
  titleAr: string;
  titleEn: string;
  isPublished: boolean;
  updatedAt: Date;
  steps: number;
  scans: number;
  scenarios: number;
  copies: number;
};

const rowSelect = {
  id: true,
  slug: true,
  icon: true,
  category: true,
  titleAr: true,
  titleEn: true,
  isPublished: true,
  updatedAt: true,
  _count: { select: { steps: true, scans: true, scenarios: true, copies: true } },
} satisfies Prisma.ProtocolSelect;

function toRow(r: Prisma.ProtocolGetPayload<{ select: typeof rowSelect }>): ProtocolRow {
  return {
    id: r.id,
    slug: r.slug,
    icon: r.icon,
    category: r.category,
    titleAr: r.titleAr,
    titleEn: r.titleEn,
    isPublished: r.isPublished,
    updatedAt: r.updatedAt,
    steps: r._count.steps,
    scans: r._count.scans,
    scenarios: r._count.scenarios,
    copies: r._count.copies,
  };
}

/** Platform admin: every global protocol, published or not, by title. */
export async function listGlobalProtocols(locale: Locale): Promise<ProtocolRow[]> {
  const rows = await prisma.protocol.findMany({
    where: { organizationId: null },
    orderBy: [{ [localizedColumn("title", locale)]: "asc" }, { id: "asc" }],
    select: rowSelect,
  });
  return rows.map(toRow);
}

export const INSTITUTION_PAGE_SIZE = 20;

export type InstitutionProtocolRow = ProtocolRow & {
  organization: { name: string; nameEn: string | null };
  source: { titleAr: string; titleEn: string } | null;
};

export type InstitutionProtocolPage = { rows: InstitutionProtocolRow[]; total: number; page: number; pages: number };

/** Platform admin, read-only: institutions' own protocols, newest change first, with an optional search and pages. */
export async function listInstitutionProtocols(input: { q: string; page: number }): Promise<InstitutionProtocolPage> {
  const q = input.q.trim();
  const contains = (field: string) => ({ [field]: { contains: q, mode: "insensitive" as const } });
  const where: Prisma.ProtocolWhereInput = {
    organizationId: { not: null },
    ...(q
      ? {
          OR: [
            contains("titleAr"),
            contains("titleEn"),
            contains("slug"),
            { organization: { is: { OR: [contains("name"), contains("nameEn")] } } },
          ],
        }
      : {}),
  };
  const total = await prisma.protocol.count({ where });
  const pages = Math.max(1, Math.ceil(total / INSTITUTION_PAGE_SIZE));
  const page = Math.min(Math.max(1, input.page), pages);
  const rows = await prisma.protocol.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * INSTITUTION_PAGE_SIZE,
    take: INSTITUTION_PAGE_SIZE,
    select: {
      ...rowSelect,
      organization: { select: { name: true, nameEn: true } },
      sourceProtocol: { select: { titleAr: true, titleEn: true } },
    },
  });
  return {
    rows: rows.map((r) => ({
      ...toRow(r),
      organization: { name: r.organization?.name ?? "", nameEn: r.organization?.nameEn ?? null },
      source: r.sourceProtocol,
    })),
    total,
    page,
    pages,
  };
}

/** Platform admin: how many institution protocols exist (the tab count, without a search). */
export async function countInstitutionProtocols(): Promise<number> {
  return prisma.protocol.count({ where: { organizationId: { not: null } } });
}

/** Platform admin: is this id a global protocol, an institution's, or nothing? */
export async function protocolOwnerKind(id: string): Promise<"global" | "institution" | null> {
  if (!isPlausibleId(id)) return null;
  const row = await prisma.protocol.findUnique({ where: { id }, select: { organizationId: true } });
  if (!row) return null;
  return row.organizationId === null ? "global" : "institution";
}

const readOnlySelect = {
  id: true,
  slug: true,
  isPublished: true,
  updatedAt: true,
  category: true,
  icon: true,
  titleAr: true,
  titleEn: true,
  summaryAr: true,
  summaryEn: true,
  descriptionAr: true,
  descriptionEn: true,
  organization: { select: { name: true, nameEn: true } },
  sourceProtocol: { select: linkedSelect },
  _count: { select: { scans: true, scenarios: true } },
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

export type InstitutionProtocolView = Prisma.ProtocolGetPayload<{ select: typeof readOnlySelect }>;

/** Platform admin, read-only: one institution protocol with its steps (any institution, any state). */
export async function getInstitutionProtocolForAdmin(id: string): Promise<InstitutionProtocolView | null> {
  if (!isPlausibleId(id)) return null;
  return prisma.protocol.findFirst({ where: { id, organizationId: { not: null } }, select: readOnlySelect });
}

/** Titles for the admin page title (any protocol: the page itself is platform-admin only). */
export async function getProtocolTitlesForAdmin(id: string) {
  if (!isPlausibleId(id)) return null;
  return prisma.protocol.findUnique({ where: { id }, select: { titleAr: true, titleEn: true, organizationId: true } });
}

export type OrgProtocolRow = ProtocolRow & {
  source: LinkedProtocol | null;
  /** Managers only: a newer version of the global protocol it was copied from is published. */
  newerSource: boolean;
};

/**
 * /org/protocols: managers see all of the active institution's protocols (drafts too, protocolsEditable); examiners see
 * the published ones (protocolsReadable), read-only.
 */
export async function listOrgProtocols(scope: Scope, locale: Locale): Promise<OrgProtocolRow[]> {
  if (!scope.organizationId) return [];
  const where: Prisma.ProtocolWhereInput = isOrgManager(scope)
    ? editableWhere("institution", scope)
    : { AND: [protocolsReadable(scope), { organizationId: scope.organizationId, isPublished: true }] };
  const rows = await prisma.protocol.findMany({
    where,
    orderBy: [{ [localizedColumn("title", locale)]: "asc" }, { id: "asc" }],
    select: { ...rowSelect, sourceProtocolId: true, sourceProtocol: { select: linkedSelect } },
  });
  const sources = [...new Set(rows.map((r) => r.sourceProtocolId).filter((id): id is string => id !== null))];
  const edges = isOrgManager(scope) && sources.length > 0 ? await loadGlobalVersionEdges() : [];
  const newerBySource = new Map(sources.map((id) => [id, newerVersions(edges, id)]));
  const candidates = [...new Set([...newerBySource.values()].flat())];
  const published =
    candidates.length === 0
      ? new Set<string>()
      : new Set(
          (await prisma.protocol.findMany({ where: { id: { in: candidates }, organizationId: null, isPublished: true }, select: { id: true } })).map(
            (p) => p.id,
          ),
        );
  return rows.map(({ sourceProtocolId, ...r }) => ({
    ...toRow(r),
    source: r.sourceProtocol,
    newerSource: sourceProtocolId !== null && (newerBySource.get(sourceProtocolId) ?? []).some((id) => published.has(id)),
  }));
}

export type CopyableProtocol = {
  id: string;
  slug: string;
  icon: string;
  category: ProtocolRow["category"];
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  steps: StepSummary;
  /** Copies the active institution already has of it. */
  copies: number;
  /** The institution's newest copy of it (opened instead of copying again). */
  latestCopyId: string | null;
  /** No copy of this one, but the institution has one of an OLDER version of it: its newest such copy. */
  olderVersionCopyId: string | null;
  /** The newest published newer version of this protocol (this one is an old version still published). */
  newerVersion: { slug: string; titleAr: string; titleEn: string } | null;
};

/**
 * Published global protocols an institution manager can copy, with the copies the institution already has of each,
 * and how each relates to other versions (a newer one is published; the institution copied an older one).
 */
export async function listCopyableProtocols(scope: Scope, locale: Locale): Promise<CopyableProtocol[]> {
  if (!scope.organizationId) return [];
  const [rows, copies, edges] = await Promise.all([
    prisma.protocol.findMany({
      where: { organizationId: null, isPublished: true },
      orderBy: [{ [localizedColumn("title", locale)]: "asc" }, { id: "asc" }],
      select: {
        id: true,
        slug: true,
        icon: true,
        category: true,
        titleAr: true,
        titleEn: true,
        summaryAr: true,
        summaryEn: true,
        steps: { select: { isMandatory: true, isCritical: true, visualCheck: true } },
      },
    }),
    // The institution's copies, newest first (an institution has at most MAX_INSTITUTION_PROTOCOLS protocols).
    prisma.protocol.findMany({
      where: { organizationId: scope.organizationId, sourceProtocolId: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, sourceProtocolId: true },
    }),
    loadGlobalVersionEdges(),
  ]);
  return copyableRows(rows, copies, edges).map(({ steps, ...r }) => ({ ...r, steps: summarizeSteps(steps) }));
}

/**
 * Pure part of listCopyableProtocols (unit-tested). `rows`: the published global protocols; `copies`: the
 * institution's copies, newest first; `edges`: the version links (lib/protocols/versions.ts).
 */
export function copyableRows<T extends { id: string; slug: string; titleAr: string; titleEn: string }>(
  rows: readonly T[],
  copies: ReadonlyArray<{ id: string; sourceProtocolId: string | null }>,
  edges: readonly VersionEdge[],
): Array<T & Pick<CopyableProtocol, "copies" | "latestCopyId" | "olderVersionCopyId" | "newerVersion">> {
  const published = new Map(rows.map((r) => [r.id, r]));
  const newerOf = new Map<string, string[]>();
  const newer = (id: string): string[] => {
    const known = newerOf.get(id);
    if (known) return known;
    const list = newerVersions(edges, id);
    newerOf.set(id, list);
    return list;
  };
  return rows.map((row) => {
    const direct = copies.filter((c) => c.sourceProtocolId === row.id);
    const older = direct.length > 0 ? undefined : copies.find((c) => c.sourceProtocolId !== null && newer(c.sourceProtocolId).includes(row.id));
    const newest = newer(row.id)
      .map((id) => published.get(id))
      .find((r) => r !== undefined);
    return {
      ...row,
      copies: direct.length,
      latestCopyId: direct[0]?.id ?? null,
      olderVersionCopyId: older?.id ?? null,
      newerVersion: newest ? { slug: newest.slug, titleAr: newest.titleAr, titleEn: newest.titleEn } : null,
    };
  });
}
