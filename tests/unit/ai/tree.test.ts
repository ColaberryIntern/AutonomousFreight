import {
  evaluateTree,
  predict,
  type Ensemble,
  type TreeNode,
} from '../../../services/ai/src/domain/tree';
import { trainEnsemble, type LabeledRow } from '../../../services/ai/src/domain/train';

interface FV {
  costNorm: number;
  distanceNorm: number;
  ratingNorm: number;
  riskScore: number;
}
const fv = (over: Partial<FV>): FV => ({
  costNorm: 0.5,
  distanceNorm: 0.5,
  ratingNorm: 0.5,
  riskScore: 0.5,
  ...over,
});

describe('decision tree evaluation', () => {
  it('evaluates a leaf node', () => {
    const node: TreeNode = { kind: 'leaf', probability: 0.7 };
    expect(evaluateTree(node, fv({}))).toBe(0.7);
  });

  it('walks a split node correctly', () => {
    const node: TreeNode = {
      kind: 'split',
      feature: 'costNorm',
      threshold: 0.5,
      left: { kind: 'leaf', probability: 0.9 },
      right: { kind: 'leaf', probability: 0.1 },
    };
    expect(evaluateTree(node, fv({ costNorm: 0.3 }))).toBe(0.9);
    expect(evaluateTree(node, fv({ costNorm: 0.7 }))).toBe(0.1);
  });

  it('predict averages across trees', () => {
    const e: Ensemble = {
      version: 'v1',
      trainedAt: new Date().toISOString(),
      trees: [
        { kind: 'leaf', probability: 1 },
        { kind: 'leaf', probability: 0 },
      ],
    };
    expect(predict(e, fv({}))).toBe(0.5);
  });

  it('predict on empty ensemble returns 0', () => {
    const e: Ensemble = { version: 'v1', trainedAt: new Date().toISOString(), trees: [] };
    expect(predict(e, fv({}))).toBe(0);
  });
});

describe('trainEnsemble', () => {
  function rows(): LabeledRow[] {
    return [
      { features: fv({ costNorm: 1, ratingNorm: 1 }), accepted: true },
      { features: fv({ costNorm: 0.9, ratingNorm: 0.9 }), accepted: true },
      { features: fv({ costNorm: 0.8, ratingNorm: 0.8 }), accepted: true },
      { features: fv({ costNorm: 0.7, ratingNorm: 0.85 }), accepted: true },
      { features: fv({ costNorm: 0.1, ratingNorm: 0.1 }), accepted: false },
      { features: fv({ costNorm: 0.2, ratingNorm: 0.2 }), accepted: false },
      { features: fv({ costNorm: 0.3, ratingNorm: 0.3 }), accepted: false },
      { features: fv({ costNorm: 0.15, ratingNorm: 0.15 }), accepted: false },
    ];
  }

  it('produces an ensemble of the requested size', () => {
    const e = trainEnsemble(rows(), { trees: 5, maxDepth: 3, bagFraction: 1.0, seed: 42 });
    expect(e.trees).toHaveLength(5);
    expect(e.version).toBe('v1');
  });

  it('is deterministic for a fixed seed', () => {
    const a = trainEnsemble(rows(), { trees: 3, maxDepth: 3, bagFraction: 1.0, seed: 7 });
    const b = trainEnsemble(rows(), { trees: 3, maxDepth: 3, bagFraction: 1.0, seed: 7 });
    expect(a.trees).toEqual(b.trees);
  });

  it('predicts higher probability for high-cost-norm + high-rating-norm features', () => {
    const e = trainEnsemble(rows(), { trees: 10, maxDepth: 4, bagFraction: 1.0, seed: 1 });
    const high = predict(e, fv({ costNorm: 0.95, ratingNorm: 0.95 }));
    const low = predict(e, fv({ costNorm: 0.1, ratingNorm: 0.1 }));
    expect(high).toBeGreaterThan(low);
  });
});
