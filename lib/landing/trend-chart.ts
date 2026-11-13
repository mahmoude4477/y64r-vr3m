// Geometry of the small line chart drawn inside the landing page's product illustration (an SVG, no chart
// library: the page ships no client JavaScript for it). Pure, unit-tested (trend-chart.test.ts).
//
// Time runs from the reading start to the reading end, like the app's own charts (CONVENTIONS 9: Recharts is
// mirrored in Arabic): left -> right in English, right -> left in Arabic. The SVG itself is drawn with dir="ltr",
// so every x below is a plain left-to-right coordinate.
//
// There are no y-axis labels: in the illustration the phone covers the reading-start side of the chart, where they
// would sit (landing review r1). Grid lines carry no text; the one line that matters (the target) is named by a
// legend in HTML next to the chart title.

export type ChartDir = "rtl" | "ltr";

export type TrendChartOptions = {
  dir: ChartDir;
  /** Lowest and highest value on the y axis; values outside are clamped. */
  min: number;
  max: number;
  /** Values that get a grid line. */
  ticks: readonly number[];
  /** viewBox size. */
  width?: number;
  height?: number;
  /** Space on both sides, above the plot and below it (room for the x-axis labels). */
  padX?: number;
  padTop?: number;
  padBottom?: number;
  /** Distance between the plot edges and the first / last point. */
  inset?: number;
  /**
   * The same on the reading-start side only (defaults to `inset`). The illustration's phone covers the start edge of
   * the chart: a larger start inset keeps the first point and its month fully clear of it, so no half-covered glyph
   * shows at the phone's edge.
   */
  insetStart?: number;
};

export type ChartPoint = { x: number; y: number };

export type TrendChart = {
  width: number;
  height: number;
  /** One point per value, oldest first. */
  points: ChartPoint[];
  /** `points` attribute of the <polyline>. */
  line: string;
  /** `points` attribute of the filled <polygon> under the line (closed on the baseline). */
  area: string;
  /** Grid lines (no labels). */
  ticks: { value: number; y: number }[];
  /** Horizontal extent of the grid lines. */
  gridFrom: number;
  gridTo: number;
  /** Bottom of the plot (lowest value) and the baseline of the x-axis labels. */
  baselineY: number;
  labelY: number;
  /** y of any value (clamped). */
  y: (value: number) => number;
};

const round = (n: number) => Math.round(n * 10) / 10;

export function trendChart(values: readonly number[], options: TrendChartOptions): TrendChart {
  const { dir, min, max, ticks, width = 470, height = 128, padX = 8, padTop = 8, padBottom = 28.5, inset = 22 } = options;
  const insetStart = options.insetStart ?? inset;
  if (!(max > min)) throw new Error("trendChart: max must be greater than min");

  const plotTop = padTop;
  const plotBottom = height - padBottom;
  const plotLeft = padX;
  const plotRight = width - padX;

  const y = (value: number) => {
    const v = Math.min(max, Math.max(min, value));
    return round(plotTop + ((max - v) / (max - min)) * (plotBottom - plotTop));
  };

  // Oldest point on the reading-start side: left in English, right in Arabic.
  const first = plotLeft + (dir === "ltr" ? insetStart : inset);
  const last = plotRight - (dir === "ltr" ? inset : insetStart);
  const step = values.length > 1 ? (last - first) / (values.length - 1) : 0;
  const x = (i: number) => round(dir === "ltr" ? first + i * step : last - i * step);

  const points = values.map((value, i) => ({ x: x(i), y: y(value) }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const baselineY = round(plotBottom);
  const area =
    points.length === 0 ? "" : `${line} ${points[points.length - 1].x},${baselineY} ${points[0].x},${baselineY}`;

  return {
    width,
    height,
    points,
    line,
    area,
    ticks: ticks.map((value) => ({ value, y: y(value) })),
    gridFrom: plotLeft,
    gridTo: plotRight,
    baselineY,
    labelY: round(height - 5),
    y,
  };
}
