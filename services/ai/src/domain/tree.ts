export interface FeatureVector {
  costNorm: number;
  distanceNorm: number;
  ratingNorm: number;
  riskScore: number;
}

export type FeatureName = keyof FeatureVector;

export type TreeNode =
  | { kind: 'leaf'; probability: number }
  | { kind: 'split'; feature: FeatureName; threshold: number; left: TreeNode; right: TreeNode };

export interface Ensemble {
  version: string;
  trainedAt: string;
  trees: TreeNode[];
}

export function evaluateTree(node: TreeNode, x: FeatureVector): number {
  if (node.kind === 'leaf') return node.probability;
  return x[node.feature] <= node.threshold
    ? evaluateTree(node.left, x)
    : evaluateTree(node.right, x);
}

export function predict(ensemble: Ensemble, x: FeatureVector): number {
  if (ensemble.trees.length === 0) return 0;
  let s = 0;
  for (const t of ensemble.trees) s += evaluateTree(t, x);
  return s / ensemble.trees.length;
}
