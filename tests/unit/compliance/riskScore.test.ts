import { computeRiskScore } from '../../../services/compliance/src/domain/riskScore';

describe('computeRiskScore', () => {
  it('returns 0 for the perfect-compliance carrier', () => {
    expect(
      computeRiskScore({
        operatingStatus: 'active',
        safetyRating: 'satisfactory',
        insuranceOnFile: true,
        snapshotAgeDays: 30,
      }),
    ).toBe(0);
  });

  it('caps at 1.0 for the worst case', () => {
    expect(
      computeRiskScore({
        operatingStatus: 'out_of_service',
        safetyRating: 'unsatisfactory',
        insuranceOnFile: false,
        snapshotAgeDays: 365,
      }),
    ).toBe(1);
  });

  it('penalizes stale snapshots (>180 days adds 0.2)', () => {
    const fresh = computeRiskScore({
      operatingStatus: 'active',
      safetyRating: 'unrated',
      insuranceOnFile: true,
      snapshotAgeDays: 60,
    });
    const stale = computeRiskScore({
      operatingStatus: 'active',
      safetyRating: 'unrated',
      insuranceOnFile: true,
      snapshotAgeDays: 200,
    });
    expect(stale - fresh).toBeCloseTo(0.2);
  });

  it('insurance missing adds 0.4', () => {
    expect(
      computeRiskScore({
        operatingStatus: 'active',
        safetyRating: 'satisfactory',
        insuranceOnFile: false,
        snapshotAgeDays: 0,
      }),
    ).toBe(0.4);
  });

  it('conditional safety rating adds 0.4', () => {
    expect(
      computeRiskScore({
        operatingStatus: 'active',
        safetyRating: 'conditional',
        insuranceOnFile: true,
        snapshotAgeDays: 0,
      }),
    ).toBe(0.4);
  });

  it('non-active operating status adds 0.5', () => {
    expect(
      computeRiskScore({
        operatingStatus: 'unknown',
        safetyRating: 'satisfactory',
        insuranceOnFile: true,
        snapshotAgeDays: 0,
      }),
    ).toBe(0.5);
  });

  it('is pure — same input → same output', () => {
    const input = {
      operatingStatus: 'active' as const,
      safetyRating: 'conditional' as const,
      insuranceOnFile: true,
      snapshotAgeDays: 100,
    };
    expect(computeRiskScore(input)).toBe(computeRiskScore(input));
  });
});
