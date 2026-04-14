import type { Ensemble, FeatureName, FeatureVector, TreeNode } from './tree';

export interface LabeledRow {
  features: FeatureVector;
  accepted: boolean;
}

const FEATURES: FeatureName[] = ['costNorm', 'distanceNorm', 'ratingNorm', 'riskScore'];

function gini(rows: LabeledRow[]): number {
  if (rows.length === 0) return 0;
  const p = rows.filter((r) => r.accepted).length / rows.length;
  return 1 - (p * p + (1 - p) * (1 - p));
}

function bestSplit(
  rows: LabeledRow[],
): { feature: FeatureName; threshold: number; gain: number } | null {
  const baseGini = gini(rows);
  let best: { feature: FeatureName; threshold: number; gain: number } | null = null;
  for (const f of FEATURES) {
    const values = Array.from(new Set(rows.map((r) => r.features[f]))).sort((a, b) => a - b);
    for (let i = 0; i < values.length - 1; i++) {
      const v = values[i];
      const next = values[i + 1];
      if (v === undefined || next === undefined) continue;
      const threshold = (v + next) / 2;
      const left = rows.filter((r) => r.features[f] <= threshold);
      const right = rows.filter((r) => r.features[f] > threshold);
      if (left.length === 0 || right.length === 0) continue;
      const weighted =
        (left.length * gini(left)) / rows.length + (right.length * gini(right)) / rows.length;
      const gain = baseGini - weighted;
      if (!best || gain > best.gain) best = { feature: f, threshold, gain };
    }
  }
  return best;
}

function buildTree(rows: LabeledRow[], depth: number, maxDepth: number): TreeNode {
  const acceptedFraction = rows.filter((r) => r.accepted).length / Math.max(rows.length, 1);
  if (depth >= maxDepth || rows.length < 4 || acceptedFraction === 0 || acceptedFraction === 1) {
    return { kind: 'leaf', probability: acceptedFraction };
  }
  const split = bestSplit(rows);
  if (!split || split.gain <= 1e-9) {
    return { kind: 'leaf', probability: acceptedFraction };
  }
  const left = rows.filter((r) => r.features[split.feature] <= split.threshold);
  const right = rows.filter((r) => r.features[split.feature] > split.threshold);
  return {
    kind: 'split',
    feature: split.feature,
    threshold: split.threshold,
    left: buildTree(left, depth + 1, maxDepth),
    right: buildTree(right, depth + 1, maxDepth),
  };
}

export interface TrainOptions {
  trees: number;
  maxDepth: number;
  bagFraction: number;
  seed: number;
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return (): number => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function trainEnsemble(rows: LabeledRow[], opts: TrainOptions): Ensemble {
  const rng = mulberry32(opts.seed);
  const trees: TreeNode[] = [];
  const bagSize = Math.max(1, Math.floor(rows.length * opts.bagFraction));
  for (let i = 0; i < opts.trees; i++) {
    const sample: LabeledRow[] = [];
    for (let j = 0; j < bagSize; j++) {
      const idx = Math.floor(rng() * rows.length);
      const row = rows[idx];
      if (row) sample.push(row);
    }
    trees.push(buildTree(sample, 0, opts.maxDepth));
  }
  return {
    version: 'v1',
    trainedAt: new Date().toISOString(),
    trees,
  };
}
