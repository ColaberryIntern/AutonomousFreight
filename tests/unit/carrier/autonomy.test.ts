import {
  evaluateGraduation,
  isAutonomyOperation,
  LEVEL_DEFINITIONS,
  summarizeSamples,
  type SampleRow,
} from '../../../services/carrier/src/domain/autonomy';

describe('summarizeSamples', () => {
  it('returns zeros for empty input', () => {
    expect(summarizeSamples([])).toEqual({
      count: 0,
      successRate: 0,
      reversalRate: 0,
      escalationRate: 0,
      avgConfidence: 0,
    });
  });

  it('computes rates and mean confidence over a window', () => {
    const rows: SampleRow[] = [
      { outcome: 'success', confidence: 0.95 },
      { outcome: 'success', confidence: 0.9 },
      { outcome: 'reversed', confidence: 0.6 },
      { outcome: 'escalated', confidence: 0.4 },
    ];
    const stats = summarizeSamples(rows);
    expect(stats.count).toBe(4);
    expect(stats.successRate).toBeCloseTo(0.5, 5);
    expect(stats.reversalRate).toBeCloseTo(0.25, 5);
    expect(stats.escalationRate).toBeCloseTo(0.25, 5);
    expect(stats.avgConfidence).toBeCloseTo(0.7125, 4);
  });
});

describe('evaluateGraduation', () => {
  it('L1 -> L2 eligible at 90% success on >= 500 samples', () => {
    const out = evaluateGraduation({
      currentLevel: 1,
      daysAtLevel: 30,
      stats: {
        count: 500,
        successRate: 0.9,
        reversalRate: 0,
        escalationRate: 0,
        avgConfidence: 0.85,
      },
    });
    expect(out.eligible).toBe(true);
    expect(out.proposedLevel).toBe(2);
    expect(out.blockers).toEqual([]);
  });

  it('L1 lists blockers when sample count or success rate is short', () => {
    const out = evaluateGraduation({
      currentLevel: 1,
      daysAtLevel: 30,
      stats: {
        count: 100,
        successRate: 0.8,
        reversalRate: 0,
        escalationRate: 0,
        avgConfidence: 0.85,
      },
    });
    expect(out.eligible).toBe(false);
    expect(out.proposedLevel).toBe(1);
    expect(out.blockers.length).toBe(2);
    expect(out.blockers[0]).toContain('500 samples');
    expect(out.blockers[1]).toContain('90%');
  });

  it('L2 -> L3 eligible at 90+ days with reversal < 1%', () => {
    const out = evaluateGraduation({
      currentLevel: 2,
      daysAtLevel: 91,
      stats: {
        count: 200,
        successRate: 0.95,
        reversalRate: 0.005,
        escalationRate: 0.02,
        avgConfidence: 0.9,
      },
    });
    expect(out.eligible).toBe(true);
    expect(out.proposedLevel).toBe(3);
  });

  it('L2 blocks when reversal rate >= 1%', () => {
    const out = evaluateGraduation({
      currentLevel: 2,
      daysAtLevel: 120,
      stats: {
        count: 300,
        successRate: 0.92,
        reversalRate: 0.02,
        escalationRate: 0.01,
        avgConfidence: 0.9,
      },
    });
    expect(out.eligible).toBe(false);
    expect(out.blockers.some((b) => b.includes('reversal'))).toBe(true);
  });

  it('L3 always blocks pending out-of-band consent confirmation', () => {
    const out = evaluateGraduation({
      currentLevel: 3,
      daysAtLevel: 365,
      stats: {
        count: 1000,
        successRate: 0.99,
        reversalRate: 0,
        escalationRate: 0,
        avgConfidence: 0.98,
      },
    });
    expect(out.eligible).toBe(false);
    expect(out.proposedLevel).toBe(3);
    expect(out.blockers.some((b) => b.toLowerCase().includes('consent'))).toBe(true);
  });

  it('L4 is terminal and never eligible', () => {
    const out = evaluateGraduation({
      currentLevel: 4,
      daysAtLevel: 9999,
      stats: {
        count: 0,
        successRate: 0,
        reversalRate: 0,
        escalationRate: 0,
        avgConfidence: 0,
      },
    });
    expect(out.eligible).toBe(false);
    expect(out.proposedLevel).toBe(4);
  });
});

describe('LEVEL_DEFINITIONS', () => {
  it('covers exactly 4 ordered levels', () => {
    expect(LEVEL_DEFINITIONS.map((l) => l.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('isAutonomyOperation', () => {
  it('accepts known operations and rejects others', () => {
    expect(isAutonomyOperation('quoting')).toBe(true);
    expect(isAutonomyOperation('dispatch')).toBe(true);
    expect(isAutonomyOperation('invoicing')).toBe(true);
    expect(isAutonomyOperation('settlement')).toBe(false);
    expect(isAutonomyOperation(42)).toBe(false);
    expect(isAutonomyOperation(undefined)).toBe(false);
  });
});
