// Filters of /admin/assessments: every smart scan and every simulation attempt on the platform (PRODUCT 6a). The URL
// holds them (?kind=&q=&org=&protocol=&risk=&status=&from=&to=&page=). Pure (Prisma types only), unit-tested; the
// queries in lib/admin/assessment-queries.ts run them after requirePlatformAdmin().
import type { Prisma } from "@/generated/prisma/client";
import { dayRange, first, parseChoice, parseDay, parseId, parsePage, parseQuery, type RawSearchParams } from "@/lib/admin/params";

export const ASSESSMENT_KINDS = ["scans", "attempts"] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const RISK_FILTERS = ["all", "low", "medium", "high", "not_assessable"] as const;
export type RiskFilter = (typeof RISK_FILTERS)[number];

export const SCAN_STATUS_FILTERS = ["all", "draft", "analyzing", "review", "finalized", "failed"] as const;
export const ATTEMPT_STATUS_FILTERS = ["all", "in_progress", "completed", "abandoned"] as const;
export type ScanStatusFilter = (typeof SCAN_STATUS_FILTERS)[number];
export type AttemptStatusFilter = (typeof ATTEMPT_STATUS_FILTERS)[number];

/** org=none: attempts of individual trainees (no institution). Scans always belong to an institution. */
export const NO_ORGANIZATION = "none";

/** Reasons offered when a platform admin deletes a scan or an attempt (stored in the audit row, never free text). */
export const DELETE_REASONS = ["abusive", "test", "duplicate", "requested", "other"] as const;
export type DeleteReason = (typeof DELETE_REASONS)[number];

export type AssessmentFilters = {
  kind: AssessmentKind;
  q: string;
  /** An institution id, NO_ORGANIZATION (attempts only), or "" for all. */
  org: string;
  /** A protocol id, or "" for all. */
  protocol: string;
  risk: RiskFilter;
  status: ScanStatusFilter | AttemptStatusFilter;
  from: string;
  to: string;
  page: number;
};

/** The URL params that mean "no filter" (listHref drops them). */
export const ASSESSMENT_DEFAULTS = { kind: "scans", risk: "all", status: "all" } as const;

const noAll = (id: string) => (id === "all" ? "" : id);

export function parseAssessmentFilters(raw: RawSearchParams): AssessmentFilters {
  const kind = parseChoice(raw.kind, ASSESSMENT_KINDS, "scans");
  // "all" is the select's "no filter" value (listHref drops it, but a hand-written URL may carry it).
  const orgRaw = first(raw.org) === NO_ORGANIZATION ? NO_ORGANIZATION : noAll(parseId(raw.org));
  return {
    kind,
    q: parseQuery(raw.q),
    org: orgRaw === NO_ORGANIZATION && kind === "scans" ? "" : orgRaw,
    protocol: noAll(parseId(raw.protocol)),
    risk: parseChoice(raw.risk, RISK_FILTERS, "all"),
    status: kind === "scans" ? parseChoice(raw.status, SCAN_STATUS_FILTERS, "all") : parseChoice(raw.status, ATTEMPT_STATUS_FILTERS, "all"),
    from: parseDay(raw.from),
    to: parseDay(raw.to),
    page: parsePage(raw.page),
  };
}

/** True when anything narrows the list (the empty state then says "no matches" instead of "nothing yet"). */
export function isFiltered(f: AssessmentFilters): boolean {
  return f.q !== "" || f.org !== "" || f.protocol !== "" || f.risk !== "all" || f.status !== "all" || f.from !== "" || f.to !== "";
}

/** The params of the current list, for links that keep them (pagination, the other tab drops kind-specific ones). */
export function assessmentParams(f: AssessmentFilters): Record<string, string> {
  return { kind: f.kind, q: f.q, org: f.org, protocol: f.protocol, risk: f.risk, status: f.status, from: f.from, to: f.to };
}

export function scanListWhere(f: Omit<AssessmentFilters, "kind" | "page">): Prisma.ScanWhereInput {
  const and: Prisma.ScanWhereInput[] = [];
  if (f.q) {
    and.push({
      OR: [
        { areaLabel: { contains: f.q, mode: "insensitive" } },
        { examiner: { name: { contains: f.q, mode: "insensitive" } } },
        { examiner: { email: { contains: f.q, mode: "insensitive" } } },
      ],
    });
  }
  if (f.org && f.org !== NO_ORGANIZATION) and.push({ organizationId: f.org });
  if (f.protocol) and.push({ protocolId: f.protocol });
  if (f.risk === "not_assessable") and.push({ status: "finalized", riskLevel: null });
  else if (f.risk !== "all") and.push({ riskLevel: f.risk });
  if (f.status !== "all") and.push({ status: f.status as Exclude<ScanStatusFilter, "all"> });
  const range = dayRange(f.from, f.to);
  if (range) and.push({ createdAt: range });
  return and.length ? { AND: and } : {};
}

export function attemptListWhere(f: Omit<AssessmentFilters, "kind" | "page">): Prisma.SimulationAttemptWhereInput {
  const and: Prisma.SimulationAttemptWhereInput[] = [];
  if (f.q) {
    and.push({
      OR: [
        { user: { name: { contains: f.q, mode: "insensitive" } } },
        { user: { email: { contains: f.q, mode: "insensitive" } } },
        { scenario: { titleAr: { contains: f.q, mode: "insensitive" } } },
        { scenario: { titleEn: { contains: f.q, mode: "insensitive" } } },
      ],
    });
  }
  if (f.org === NO_ORGANIZATION) and.push({ organizationId: null });
  else if (f.org) and.push({ organizationId: f.org });
  if (f.protocol) and.push({ scenario: { protocolId: f.protocol } });
  if (f.risk === "not_assessable") and.push({ status: "completed", riskLevel: null });
  else if (f.risk !== "all") and.push({ riskLevel: f.risk });
  if (f.status !== "all") and.push({ status: f.status as Exclude<AttemptStatusFilter, "all"> });
  const range = dayRange(f.from, f.to);
  if (range) and.push({ startedAt: range });
  return and.length ? { AND: and } : {};
}
