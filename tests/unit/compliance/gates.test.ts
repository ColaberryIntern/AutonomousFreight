import {
  evaluateAssignmentGates,
  type CarrierForGate,
} from '../../../services/compliance/src/domain/gates';
import type { ComplianceSnapshot } from '../../../services/compliance/src/domain/riskScore';

const goodCarrier: CarrierForGate = { id: 'c1', active: true };
const goodSnap: ComplianceSnapshot = {
  operatingStatus: 'active',
  safetyRating: 'satisfactory',
  insuranceOnFile: true,
  snapshotAgeDays: 30,
};

describe('evaluateAssignmentGates', () => {
  it('passes for a clean carrier + clean snapshot', () => {
    const r = evaluateAssignmentGates(goodCarrier, goodSnap);
    expect(r.result).toBe('pass');
    expect(r.findings).toEqual([]);
  });

  it('hard-blocks when carrier is inactive', () => {
    const r = evaluateAssignmentGates({ id: 'c', active: false }, goodSnap);
    expect(r.result).toBe('hard');
    expect(r.findings.map((f) => f.code)).toContain('carrier_inactive');
  });

  it('hard-blocks when no compliance snapshot', () => {
    const r = evaluateAssignmentGates(goodCarrier, null);
    expect(r.result).toBe('hard');
    expect(r.findings.map((f) => f.code)).toContain('no_compliance_snapshot');
  });

  it('hard-blocks when operating status is not active', () => {
    const r = evaluateAssignmentGates(goodCarrier, {
      ...goodSnap,
      operatingStatus: 'out_of_service',
    });
    expect(r.result).toBe('hard');
    expect(r.findings.map((f) => f.code)).toContain('carrier_not_operating');
  });

  it('hard-blocks when insurance not on file', () => {
    const r = evaluateAssignmentGates(goodCarrier, { ...goodSnap, insuranceOnFile: false });
    expect(r.result).toBe('hard');
    expect(r.findings.map((f) => f.code)).toContain('no_insurance');
  });

  it('soft-warns when risk score >= 0.6 (conditional + insurance OK)', () => {
    // conditional alone: 0.4. Plus stale (>180d) +0.2 = 0.6. Triggers high_risk_score.
    const r = evaluateAssignmentGates(goodCarrier, {
      ...goodSnap,
      safetyRating: 'conditional',
      snapshotAgeDays: 200,
    });
    expect(r.result).toBe('soft');
    const codes = r.findings.map((f) => f.code);
    expect(codes).toContain('high_risk_score');
    expect(codes).toContain('snapshot_stale');
    expect(codes).toContain('safety_conditional');
  });

  it('soft-warns alone when snapshot age > 90 days', () => {
    const r = evaluateAssignmentGates(goodCarrier, { ...goodSnap, snapshotAgeDays: 120 });
    expect(r.result).toBe('soft');
    expect(r.findings.map((f) => f.code)).toContain('snapshot_stale');
  });

  it('soft-warns alone for safety rating conditional under thresholds', () => {
    // conditional only contributes 0.4 to risk; under 0.6 alone
    const r = evaluateAssignmentGates(goodCarrier, {
      ...goodSnap,
      safetyRating: 'conditional',
      snapshotAgeDays: 30,
    });
    expect(r.result).toBe('soft');
    expect(r.findings.map((f) => f.code)).toContain('safety_conditional');
  });

  it('hard severity dominates when both present', () => {
    const r = evaluateAssignmentGates(goodCarrier, {
      ...goodSnap,
      insuranceOnFile: false, // hard
      safetyRating: 'conditional', // soft
    });
    expect(r.result).toBe('hard');
    expect(r.findings.length).toBeGreaterThanOrEqual(2);
  });

  it('is pure — same input produces same output', () => {
    const a = evaluateAssignmentGates(goodCarrier, goodSnap);
    const b = evaluateAssignmentGates(goodCarrier, goodSnap);
    expect(a).toEqual(b);
  });
});
