/**
 * Geometry of the small score line on the dashboard (pure, unit-tested; drawn as plain SVG on the server, no chart
 * library on this page). Scores are 0..100 and oldest first. Time runs in the reading direction: left to right in
 * English, right to left in Arabic (like the report charts, whose X axis is reversed in RTL).
 */

export type SparklineBox = { width: number; height: number; padding: number };

export type SparklineGeometry = {
  /** `d` of the line path. */
  line: string;
  /** `d` of the area under the line (closed to the bottom edge). */
  area: string;
  /** The newest point (drawn as a dot). */
  last: { x: number; y: number };
};

const round = (n: number) => Math.round(n * 100) / 100;

/** null when there are fewer than two scores (a single point is not a line). */
export function sparklineGeometry(
  scores: readonly number[],
  box: SparklineBox,
  options: { rtl?: boolean } = {},
): SparklineGeometry | null {
  if (scores.length < 2) return null;
  const { width, height, padding } = box;
  const innerW = Math.max(0, width - 2 * padding);
  const innerH = Math.max(0, height - 2 * padding);
  const step = innerW / (scores.length - 1);
  const points = scores.map((raw, i) => {
    const score = Math.min(100, Math.max(0, Number.isFinite(raw) ? raw : 0));
    const ltrX = padding + i * step;
    return { x: round(options.rtl ? width - ltrX : ltrX), y: round(padding + (1 - score / 100) * innerH) };
  });
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const bottom = round(height - padding);
  const area = `${line} L${last.x} ${bottom} L${first.x} ${bottom} Z`;
  return { line, area, last };
}
