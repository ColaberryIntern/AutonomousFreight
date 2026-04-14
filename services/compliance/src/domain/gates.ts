import { computeRiskScore, type ComplianceSnapshot } from './riskScore';

export type GateResult = 'pass' | 'soft' | 'hard';
export type GateSeverity = 'soft' | 'hard';

export interface GateFinding {
  code: string;
  severity: GateSeverity;
  message: string;
}

export interface GateEvaluation {
  result: GateResult;
  findings: GateFinding[];
}

export interface CarrierForGate {
  id: string;
  active: boolean;
}

/** Pure gate evaluator for the carrier-assign transition. Directive 201. */
export function evaluateAssignmentGates(
  carrier: CarrierForGate,
  snapshot: ComplianceSnapshot | null,
): GateEvaluation {
  const findings: GateFinding[] = [];

  if (!carrier.active) {
    findings.push({
      code: 'carrier_inactive',
      severity: 'hard',
      message: 'Carrier is marked inactive.',
    });
  }

  if (!snapshot) {
    findings.push({
      code: 'no_compliance_snapshot',
      severity: 'hard',
      message: 'No compliance snapshot on file for this carrier.',
    });
  } else {
    if (snapshot.operatingStatus !== 'active') {
      findings.push({
        code: 'carrier_not_operating',
        severity: 'hard',
        message: `Operating status is "${snapshot.operatingStatus}".`,
      });
    }
    if (!snapshot.insuranceOnFile) {
      findings.push({
        code: 'no_insurance',
        severity: 'hard',
        message: 'Carrier insurance is not on file.',
      });
    }
    const risk = computeRiskScore(snapshot);
    if (risk >= 0.6) {
      findings.push({
        code: 'high_risk_score',
        severity: 'soft',
        message: `Risk score ${risk.toFixed(2)} is at or above 0.60.`,
      });
    }
    if (snapshot.snapshotAgeDays > 90) {
      findings.push({
        code: 'snapshot_stale',
        severity: 'soft',
        message: `Compliance snapshot is ${snapshot.snapshotAgeDays} days old (>90).`,
      });
    }
    if (snapshot.safetyRating === 'conditional') {
      findings.push({
        code: 'safety_conditional',
        severity: 'soft',
        message: 'FMCSA safety rating is "conditional".',
      });
    }
  }

  const hard = findings.some((f) => f.severity === 'hard');
  const soft = findings.some((f) => f.severity === 'soft');
  const result: GateResult = hard ? 'hard' : soft ? 'soft' : 'pass';
  return { result, findings };
}
