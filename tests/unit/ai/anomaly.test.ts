import { scoreAnomaly } from '../../../services/ai/src/domain/anomaly';

describe('scoreAnomaly', () => {
  it('returns 0.5 for empty history', () => {
    expect(scoreAnomaly({ amount: 100, lineCount: 5 }, [])).toBe(0.5);
  });

  it('returns 0 for single-point history', () => {
    expect(scoreAnomaly({ amount: 100, lineCount: 5 }, [{ amount: 99, lineCount: 5 }])).toBe(0);
  });

  it('flags an outlier higher than an in-distribution point', () => {
    const history = Array.from({ length: 20 }, () => ({ amount: 1000, lineCount: 5 }));
    const inDist = scoreAnomaly({ amount: 1000, lineCount: 5 }, history);
    const outlier = scoreAnomaly({ amount: 50_000, lineCount: 50 }, history);
    expect(outlier).toBeGreaterThan(inDist);
  });

  it('score is bounded in [0, 1]', () => {
    const history = [
      { amount: 100, lineCount: 1 },
      { amount: 200, lineCount: 2 },
      { amount: 150, lineCount: 3 },
    ];
    const score = scoreAnomaly({ amount: 1_000_000, lineCount: 999 }, history);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
