/**
 * Pure helpers that turn the grouped SQL rows of lib/reports into report data (unit-tested in aggregate.test.ts).
 *
 * Scores: a not-assessable result has score null (lib/scoring.ts) and is left out of every average, but it is
 * still counted (n) and shown in the risk distribution as "not assessable".
 * "Combined" compliance weights scans and simulation attempts equally per assessed result:
 * (sum of scan scores + sum of attempt scores) / (number of scored scans + scored attempts).
 */

/** count of results, how many have a score, and the sum of those scores. */
export type ScoreAgg = { n: number; scored: number; sum: number };

export const EMPTY_AGG: ScoreAgg = { n: 0, scored: 0, sum: 0 };

export function addAgg(a: ScoreAgg, b: ScoreAgg): ScoreAgg {
  return { n: a.n + b.n, scored: a.scored + b.scored, sum: a.sum + b.sum };
}

/** Average score 0..100 rounded to a whole number, or null when nothing was scored. */
export function averageScore(agg: Pick<ScoreAgg, "scored" | "sum">): number | null {
  if (!agg.scored) return null;
  return Math.min(100, Math.max(0, Math.round(agg.sum / agg.scored)));
}

/** SQL numbers can arrive as number, bigint or string (numeric); anything else is 0. */
export function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function aggOf(row: { n?: unknown; scored?: unknown; sum?: unknown }): ScoreAgg {
  return { n: num(row.n), scored: num(row.scored), sum: num(row.sum) };
}

// -------------------------------------------------------------------------------------------------------------
// Risk distribution

export type RiskCounts = { low: number; medium: number; high: number; notAssessable: number };

export const RISK_KEYS = ["low", "medium", "high", "notAssessable"] as const satisfies ReadonlyArray<keyof RiskCounts>;

export function riskTotal(counts: RiskCounts): number {
  return counts.low + counts.medium + counts.high + counts.notAssessable;
}

export function addRisk(a: RiskCounts, b: RiskCounts): RiskCounts {
  return {
    low: a.low + b.low,
    medium: a.medium + b.medium,
    high: a.high + b.high,
    notAssessable: a.notAssessable + b.notAssessable,
  };
}

/**
 * Whole-number percentages that add up to exactly 100 (largest remainder), so a stacked bar and its legend agree.
 * All zero when there is nothing.
 */
export function riskPercents(counts: RiskCounts): RiskCounts {
  const total = riskTotal(counts);
  if (total === 0) return { low: 0, medium: 0, high: 0, notAssessable: 0 };
  const raw = RISK_KEYS.map((key) => ({ key, exact: (counts[key] * 100) / total }));
  const floors = raw.map((r) => ({ ...r, value: Math.floor(r.exact), rest: r.exact - Math.floor(r.exact) }));
  let missing = 100 - floors.reduce((s, r) => s + r.value, 0);
  for (const r of [...floors].sort((a, b) => b.rest - a.rest || RISK_KEYS.indexOf(a.key) - RISK_KEYS.indexOf(b.key))) {
    if (missing <= 0) break;
    if (counts[r.key] === 0) continue;
    r.value += 1;
    missing -= 1;
  }
  return Object.fromEntries(floors.map((r) => [r.key, r.value])) as RiskCounts;
}

// -------------------------------------------------------------------------------------------------------------
// Trend

export type TrendRow = { bucket: string } & ScoreAgg;

export type TrendPoint = {
  /** First day of the bucket, YYYY-MM-DD. */
  bucket: string;
  scans: number | null;
  simulations: number | null;
  combined: number | null;
  scanCount: number;
  simulationCount: number;
};

/** One point per bucket (empty buckets included, with null averages), oldest first. */
export function buildTrend(buckets: readonly string[], scanRows: readonly TrendRow[], attemptRows: readonly TrendRow[]): TrendPoint[] {
  const scans = new Map(scanRows.map((r) => [r.bucket, r]));
  const attempts = new Map(attemptRows.map((r) => [r.bucket, r]));
  return buckets.map((bucket) => {
    const s = scans.get(bucket) ?? EMPTY_AGG;
    const a = attempts.get(bucket) ?? EMPTY_AGG;
    return {
      bucket,
      scans: averageScore(s),
      simulations: averageScore(a),
      combined: averageScore(addAgg(s, a)),
      scanCount: s.n,
      simulationCount: a.n,
    };
  });
}

// -------------------------------------------------------------------------------------------------------------
// Top gaps (most violated steps)

export type GapRow = { stepId: string; violated: number; assessed: number; critical?: number };

export type MergedGap = {
  stepId: string;
  /** Violations across finalised scans and completed simulation attempts. */
  violated: number;
  /** How often the step was assessed (compliant + violated). */
  assessed: number;
  scanViolations: number;
  simulationViolations: number;
  /** Simulation answers that violated the step through a critical wrong option. */
  criticalChoices: number;
  /** violated / assessed, 0..1 */
  rate: number;
};

/** Steps violated at least once, most violations first (then highest rate, then id for a stable order). */
export function mergeGaps(scanRows: readonly GapRow[], attemptRows: readonly GapRow[], limit: number): MergedGap[] {
  const byStep = new Map<string, MergedGap>();
  const get = (stepId: string) => {
    let gap = byStep.get(stepId);
    if (!gap) {
      gap = { stepId, violated: 0, assessed: 0, scanViolations: 0, simulationViolations: 0, criticalChoices: 0, rate: 0 };
      byStep.set(stepId, gap);
    }
    return gap;
  };
  for (const r of scanRows) {
    const gap = get(r.stepId);
    gap.violated += r.violated;
    gap.assessed += r.assessed;
    gap.scanViolations += r.violated;
  }
  for (const r of attemptRows) {
    const gap = get(r.stepId);
    gap.violated += r.violated;
    gap.assessed += r.assessed;
    gap.simulationViolations += r.violated;
    gap.criticalChoices += r.critical ?? 0;
  }
  return [...byStep.values()]
    .filter((g) => g.violated > 0)
    .map((g) => ({ ...g, rate: g.assessed > 0 ? g.violated / g.assessed : 0 }))
    .sort((a, b) => b.violated - a.violated || b.rate - a.rate || (a.stepId < b.stepId ? -1 : a.stepId > b.stepId ? 1 : 0))
    .slice(0, Math.max(0, limit));
}

/** Per user: the ids of their most violated steps (most first, then id), at most `perUser` each. */
export function topStepsByUser(
  rows: ReadonlyArray<{ userId: string; stepId: string; violated: number }>,
  perUser: number,
): Map<string, string[]> {
  const grouped = new Map<string, Array<{ stepId: string; violated: number }>>();
  for (const r of rows) {
    if (r.violated <= 0) continue;
    const list = grouped.get(r.userId) ?? [];
    list.push({ stepId: r.stepId, violated: r.violated });
    grouped.set(r.userId, list);
  }
  const out = new Map<string, string[]>();
  for (const [userId, list] of grouped) {
    list.sort((a, b) => b.violated - a.violated || (a.stepId < b.stepId ? -1 : 1));
    out.set(
      userId,
      list.slice(0, perUser).map((s) => s.stepId),
    );
  }
  return out;
}

// -------------------------------------------------------------------------------------------------------------
// Pages

export type PageInfo = { page: number; pageSize: number; total: number; pageCount: number; offset: number };

/** A 1-based page number from the URL, clamped to the pages that exist (page 1 when there is nothing). */
export function pageInfo(rawPage: unknown, total: number, pageSize: number): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const parsed = typeof rawPage === "string" && /^\d{1,6}$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Math.min(Math.max(1, parsed), pageCount);
  return { page, pageSize, total, pageCount, offset: (page - 1) * pageSize };
}
