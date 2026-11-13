import "server-only";
import type { Locale } from "next-intl";
import { protocolsReadable, scansReadable, type Scope, teamsReadable } from "@/lib/authz";
import { localizedColumn, pick } from "@/lib/i18n-content";
import { prisma } from "@/lib/prisma";
import { SCANS_PAGE_SIZE, type ScanStatusValue } from "./constants";
import { hasAnyFilter, type ScanFilters } from "./filters";
import { scanListWhere } from "./list-where";
import { effectiveStatus } from "./review-core";

/** Page data loaders of the scans area. Every query starts from lib/authz (CONVENTIONS 4). */

export type ScanListRow = {
  id: string;
  areaLabel: string;
  /** effectiveStatus: a crashed analysis (stale "analyzing") is "failed", as on its own page. */
  status: ScanStatusValue;
  score: number | null;
  riskLevel: "low" | "medium" | "high" | null;
  createdAt: Date;
  protocolTitle: string;
  protocolIcon: string;
  departmentName: string | null;
  examinerName: string | null;
  examinerDeleted: boolean;
  photoCount: number;
};

export type ScanListPage = {
  rows: ScanListRow[];
  total: number;
  page: number;
  pages: number;
  /** false = the institution has no scans at all (first-run empty state), true with total 0 = nothing matches. */
  institutionHasScans: boolean;
};

export async function listScans(scope: Scope, filters: ScanFilters, locale: Locale): Promise<ScanListPage> {
  // One "now" for the filter and the rows: a scan never matches ?status=failed and shows "Analyzing" (or the reverse).
  const now = new Date();
  const where = scanListWhere(scope, filters, now);
  const total = await prisma.scan.count({ where });
  const pages = Math.max(1, Math.ceil(total / SCANS_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const [rows, institutionHasScans] = await Promise.all([
    total === 0
      ? Promise.resolve([])
      : prisma.scan.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * SCANS_PAGE_SIZE,
          take: SCANS_PAGE_SIZE,
          select: {
            id: true,
            areaLabel: true,
            status: true,
            updatedAt: true,
            score: true,
            riskLevel: true,
            createdAt: true,
            examinerId: true,
            protocol: { select: { titleAr: true, titleEn: true, icon: true } },
            team: { select: { name: true } },
            examiner: { select: { name: true } },
            _count: { select: { photos: true } },
          },
        }),
    total > 0 || !hasAnyFilter(filters)
      ? Promise.resolve(total > 0)
      : prisma.scan.count({ where: scansReadable(scope) }).then((n) => n > 0),
  ]);
  return {
    total,
    page,
    pages,
    institutionHasScans,
    rows: rows.map((r) => ({
      id: r.id,
      areaLabel: r.areaLabel,
      status: effectiveStatus(r, now),
      score: r.score,
      riskLevel: r.riskLevel,
      createdAt: r.createdAt,
      protocolTitle: pick(r.protocol, "title", locale),
      protocolIcon: r.protocol.icon,
      departmentName: r.team?.name ?? null,
      examinerName: r.examiner?.name ?? null,
      examinerDeleted: !r.examinerId,
      photoCount: r._count.photos,
    })),
  };
}

export type FilterOption = { value: string; label: string };

/** Protocols that appear in the institution's scans, and the institution's departments. */
export async function scanFilterOptions(scope: Scope, locale: Locale): Promise<{ protocols: FilterOption[]; departments: FilterOption[] }> {
  const [protocols, departments] = await Promise.all([
    prisma.protocol.findMany({
      where: { scans: { some: scansReadable(scope) } },
      select: { id: true, titleAr: true, titleEn: true },
      orderBy: { [localizedColumn("title", locale)]: "asc" },
    }),
    prisma.team.findMany({ where: teamsReadable(scope), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    protocols: protocols.map((p) => ({ value: p.id, label: pick(p, "title", locale) })),
    departments: departments.map((d) => ({ value: d.id, label: d.name })),
  };
}

export type NewScanProtocol = {
  id: string;
  title: string;
  summary: string;
  category: "safety" | "hygiene" | "waste" | "maintenance" | "other";
  icon: string;
  custom: boolean;
  steps: number;
  visualSteps: number;
};

/** Published protocols the institution may scan with (its own first, then the global ones), each with a step. */
export async function newScanProtocols(scope: Scope, locale: Locale): Promise<NewScanProtocol[]> {
  const rows = await prisma.protocol.findMany({
    where: { AND: [protocolsReadable(scope), { isPublished: true, steps: { some: {} } }] },
    select: {
      id: true,
      titleAr: true,
      titleEn: true,
      summaryAr: true,
      summaryEn: true,
      category: true,
      icon: true,
      organizationId: true,
      steps: { select: { visualCheck: true } },
    },
    orderBy: { [localizedColumn("title", locale)]: "asc" },
  });
  return rows
    .map((p) => ({
      id: p.id,
      title: pick(p, "title", locale),
      summary: pick(p, "summary", locale),
      category: p.category,
      icon: p.icon,
      custom: p.organizationId !== null,
      steps: p.steps.length,
      visualSteps: p.steps.filter((s) => s.visualCheck).length,
    }))
    .sort((a, b) => Number(b.custom) - Number(a.custom));
}

export async function institutionDepartments(scope: Scope): Promise<FilterOption[]> {
  const teams = await prisma.team.findMany({ where: teamsReadable(scope), select: { id: true, name: true }, orderBy: { name: "asc" } });
  return teams.map((t) => ({ value: t.id, label: t.name }));
}
