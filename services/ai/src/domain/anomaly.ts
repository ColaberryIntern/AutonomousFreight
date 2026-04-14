export interface Point2D {
  amount: number;
  lineCount: number;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const left = sorted[mid - 1] ?? 0;
    const right = sorted[mid] ?? 0;
    return (left + right) / 2;
  }
  return sorted[mid] ?? 0;
}

function mad(arr: number[], med: number): number {
  if (arr.length === 0) return 0;
  return median(arr.map((v) => Math.abs(v - med)));
}

/**
 * Robust z-score-style anomaly score in [0, 1].
 * Returns 0 for a single-point history (perfect match by definition),
 * 0.5 for empty history (no signal).
 */
export function scoreAnomaly(point: Point2D, history: Point2D[]): number {
  if (history.length === 0) return 0.5;
  if (history.length === 1) return 0;
  const amts = history.map((p) => p.amount);
  const lcs = history.map((p) => p.lineCount);
  const ma = median(amts);
  const ml = median(lcs);
  const da = Math.max(mad(amts, ma), 1);
  const dl = Math.max(mad(lcs, ml), 1);
  const za = Math.abs(point.amount - ma) / da;
  const zl = Math.abs(point.lineCount - ml) / dl;
  const combined = (za + zl) / 2;
  const sigmoid = 1 - 1 / (1 + combined / 3);
  return Math.round(sigmoid * 10_000) / 10_000;
}
