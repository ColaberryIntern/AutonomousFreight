export type SafetyRating = 'satisfactory' | 'conditional' | 'unsatisfactory' | 'unrated';
export type OperatingStatus = 'active' | 'out_of_service' | 'unknown';

export interface ComplianceSnapshot {
  operatingStatus: OperatingStatus;
  safetyRating: SafetyRating;
  insuranceOnFile: boolean;
  snapshotAgeDays: number;
}

export function computeRiskScore(snap: ComplianceSnapshot): number {
  let score = 0;
  if (snap.operatingStatus !== 'active') score += 0.5;
  switch (snap.safetyRating) {
    case 'satisfactory':
      break;
    case 'conditional':
      score += 0.4;
      break;
    case 'unsatisfactory':
      score += 1;
      break;
    case 'unrated':
      score += 0.3;
      break;
  }
  if (!snap.insuranceOnFile) score += 0.4;
  if (snap.snapshotAgeDays > 180) score += 0.2;
  return Math.min(1, Math.round(score * 10_000) / 10_000);
}
