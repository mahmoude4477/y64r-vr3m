import { type RiskLevel, riskLevelFor } from "@/lib/scoring";

// Values drawn INSIDE the landing page's illustrations (the product picture in the hero and the department chart):
// they show what the product looks like, they are not data and not claims about any customer or usage. Both
// pictures are role="img" with a label that says "illustration", and carry a visible "sample data" tag.
// The app itself never shows numbers that do not come from the database (PRODUCT.md).

/** Monthly compliance in the hero dashboard, oldest first. The last value is the headline figure. */
export const SAMPLE_TREND = [64, 69, 72, 74, 76, 82] as const;

/** Calendar months (1-12) under the trend; only the month name is shown, never a year. */
export const SAMPLE_TREND_MONTHS = [5, 6, 7, 8, 9, 10] as const;

/** The other two figures of the hero dashboard. */
export const SAMPLE_COUNTS = { finalizedScans: 14, completedSimulations: 126 } as const;

/** Bars of the institutions illustration (message keys under landing.institutions.chart.departments). */
export const SAMPLE_DEPARTMENTS = [
  { key: "emergency", score: 86 },
  { key: "intensiveCare", score: 79 },
  { key: "internalMedicine", score: 74 },
] as const;

export type SampleDepartmentKey = (typeof SAMPLE_DEPARTMENTS)[number]["key"];

/** Headline figure and its change from the month before, from the trend itself so the two always agree. */
export function trendSummary(trend: readonly number[]): { latest: number; change: number } {
  if (trend.length === 0) return { latest: 0, change: 0 };
  const latest = trend[trend.length - 1];
  const previous = trend.length > 1 ? trend[trend.length - 2] : latest;
  return { latest, change: latest - previous };
}

/** Colour of a department bar: the app's own risk bands (lib/scoring), score alone. */
export function departmentRisk(score: number): RiskLevel {
  return riskLevelFor({ score, criticalViolation: false, mandatoryViolation: false });
}
