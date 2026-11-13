import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { attemptsReadable, scansReadable, teamsReadable } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { prisma } from "@/lib/prisma";
import type { CsvValue } from "./csv";
import { REPORT_TIME_ZONE, type ReportFilters, rangeBounds } from "./filters";
import type { InstitutionScope } from "./scope";

/**
 * Rows of the institution export (/api/reports/export). Same slice as the report: finalised scans by finalisation
 * date, completed attempts by completion date, protocol and department filters (department of an attempt = the
 * trainee's current departments). Newest first, at most EXPORT_ROW_CAP rows: `truncated` tells the route, which then
 * ends the file with a note (reports.export.truncatedNote) and sets X-Export-Truncated for the export menu.
 * Only institution data: no e-mail addresses, no AI raw output, no photos.
 */

export const EXPORT_ROW_CAP = 10_000;
export const EXPORT_KINDS = ["scans", "attempts"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export function isExportKind(value: unknown): value is ExportKind {
  return typeof value === "string" && (EXPORT_KINDS as readonly string[]).includes(value);
}

export type ExportLabels = {
  columns: (key: string) => string;
  risk: (level: "low" | "medium" | "high") => string;
  notAssessable: string;
  noDepartment: string;
  deletedUser: string;
};

export type ExportTable = { header: string[]; rows: CsvValue[][]; truncated: boolean };

/**
 * One formatter for the whole process, made on first use: building an ICU formatter with a time zone costs about
 * 0.2 ms, so one per row kept a 10,000-row export busy (and the event loop blocked for everyone) for 1.6 s or more.
 */
let exportDateTimeFormat: Intl.DateTimeFormat | undefined;

/** "2026-10-29 14:05" in Riyadh time: sorts as text and every spreadsheet reads it as a date. */
export function exportDateTime(date: Date | null): string {
  if (!date) return "";
  exportDateTimeFormat ??= new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = exportDateTimeFormat.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** Retry-After of a refused export (the shared helper; the export's route and tests use this name). */
export { appRateLimitRetryAfterSec as rateLimitRetryAfterSec } from "@/lib/app-rate-limit";

function riskText(level: "low" | "medium" | "high" | null, labels: ExportLabels): string {
  return level ? labels.risk(level) : labels.notAssessable;
}

export function scanExportWhere(inst: InstitutionScope, filters: ReportFilters): Prisma.ScanWhereInput {
  const { start, end } = rangeBounds(filters);
  return {
    AND: [
      scansReadable(inst.scope),
      { organizationId: inst.organizationId, status: "finalized", finalizedAt: { gte: start, lt: end } },
      filters.protocolId ? { protocolId: filters.protocolId } : {},
      filters.teamId ? { teamId: filters.teamId } : {},
    ],
  };
}

export function attemptExportWhere(inst: InstitutionScope, filters: ReportFilters): Prisma.SimulationAttemptWhereInput {
  const { start, end } = rangeBounds(filters);
  return {
    AND: [
      attemptsReadable(inst.scope),
      { organizationId: inst.organizationId, status: "completed", completedAt: { gte: start, lt: end } },
      filters.protocolId ? { scenario: { is: { protocolId: filters.protocolId } } } : {},
      filters.teamId ? { user: { is: { teammembers: { some: { teamId: filters.teamId } } } } } : {},
    ],
  };
}

export async function scanExport(inst: InstitutionScope, filters: ReportFilters, locale: string, labels: ExportLabels): Promise<ExportTable> {
  const lang = locale === "en" ? "en" : "ar";
  const rows = await prisma.scan.findMany({
    where: scanExportWhere(inst, filters),
    orderBy: [{ finalizedAt: "desc" }, { id: "asc" }],
    take: EXPORT_ROW_CAP + 1,
    select: {
      id: true,
      finalizedAt: true,
      areaLabel: true,
      score: true,
      riskLevel: true,
      protocol: { select: { titleAr: true, titleEn: true } },
      team: { select: { name: true } },
      examiner: { select: { name: true } },
    },
  });
  const truncated = rows.length > EXPORT_ROW_CAP;
  const header = ["finalizedAt", "area", "protocol", "department", "examiner", "score", "risk", "id"].map(labels.columns);
  return {
    header,
    truncated,
    rows: rows.slice(0, EXPORT_ROW_CAP).map((s) => [
      exportDateTime(s.finalizedAt),
      s.areaLabel,
      pick(s.protocol, "title", lang),
      s.team?.name ?? labels.noDepartment,
      s.examiner?.name ?? labels.deletedUser,
      s.score,
      riskText(s.riskLevel, labels),
      s.id,
    ]),
  };
}

export async function attemptExport(
  inst: InstitutionScope,
  filters: ReportFilters,
  locale: string,
  labels: ExportLabels,
): Promise<ExportTable> {
  const lang = locale === "en" ? "en" : "ar";
  const [rows, teamMembers] = await Promise.all([
    prisma.simulationAttempt.findMany({
      where: attemptExportWhere(inst, filters),
      orderBy: [{ completedAt: "desc" }, { id: "asc" }],
      take: EXPORT_ROW_CAP + 1,
      select: {
        id: true,
        userId: true,
        completedAt: true,
        durationSec: true,
        score: true,
        riskLevel: true,
        user: { select: { name: true } },
        scenario: { select: { titleAr: true, titleEn: true, protocol: { select: { titleAr: true, titleEn: true } } } },
      },
    }),
    prisma.teamMember.findMany({
      where: { team: { is: teamsReadable(inst.scope) } },
      select: { userId: true, team: { select: { name: true } } },
    }),
  ]);
  const departmentsOf = new Map<string, string[]>();
  for (const tm of teamMembers) departmentsOf.set(tm.userId, [...(departmentsOf.get(tm.userId) ?? []), tm.team.name]);
  const truncated = rows.length > EXPORT_ROW_CAP;
  const header = ["completedAt", "trainee", "scenario", "protocol", "department", "score", "risk", "minutes", "id"].map(labels.columns);
  return {
    header,
    truncated,
    rows: rows.slice(0, EXPORT_ROW_CAP).map((a) => [
      exportDateTime(a.completedAt),
      a.user.name,
      pick(a.scenario, "title", lang),
      pick(a.scenario.protocol, "title", lang),
      (departmentsOf.get(a.userId) ?? []).sort().join(" | ") || labels.noDepartment,
      a.score,
      riskText(a.riskLevel, labels),
      a.durationSec === null ? null : Math.max(1, Math.round(a.durationSec / 60)),
      a.id,
    ]),
  };
}
