export const AUTONOMY_OPERATIONS = ['quoting', 'dispatch', 'invoicing'] as const;
export type AutonomyOperation = (typeof AUTONOMY_OPERATIONS)[number];

export const AUTONOMY_OUTCOMES = ['success', 'failure', 'reversed', 'escalated'] as const;
export type AutonomyOutcome = (typeof AUTONOMY_OUTCOMES)[number];

export interface AutonomyLevelMeta {
  id: 1 | 2 | 3 | 4;
  title: string;
  summary: string;
  graduation: string;
}

export const LEVEL_DEFINITIONS: AutonomyLevelMeta[] = [
  {
    id: 1,
    title: 'Human-in-the-loop',
    summary: 'Agent proposes. Human approves every step before execution.',
    graduation:
      'Move to L2 once automation accuracy >= 90% on >= 500 historical samples AND operator comfort confirmed.',
  },
  {
    id: 2,
    title: 'Human-on-the-loop',
    summary: 'Agent executes routine. Human reviews batches + approves risky actions.',
    graduation:
      'Move to L3 after 90 days at L2 with < 1% reversal rate AND no customer-impacting regressions.',
  },
  {
    id: 3,
    title: 'Conditional autonomy',
    summary: 'Agent acts autonomously within policy; escalates edge cases.',
    graduation:
      'Move to L4 only with customer consent, 6+ months at L3, sustained mean confidence >= 97%.',
  },
  {
    id: 4,
    title: 'Full autonomy (headless)',
    summary: 'Zero-touch execution. Humans appear only at strategic checkpoints.',
    graduation: 'Terminal — re-evaluate on incident.',
  },
];

export interface SampleRow {
  outcome: AutonomyOutcome;
  confidence: number;
}

export interface SampleStats {
  count: number;
  successRate: number;
  reversalRate: number;
  escalationRate: number;
  avgConfidence: number;
}

export function summarizeSamples(rows: SampleRow[]): SampleStats {
  if (rows.length === 0) {
    return { count: 0, successRate: 0, reversalRate: 0, escalationRate: 0, avgConfidence: 0 };
  }
  let s = 0;
  let r = 0;
  let e = 0;
  let conf = 0;
  for (const row of rows) {
    if (row.outcome === 'success') s++;
    else if (row.outcome === 'reversed') r++;
    else if (row.outcome === 'escalated') e++;
    conf += row.confidence;
  }
  const n = rows.length;
  return {
    count: n,
    successRate: s / n,
    reversalRate: r / n,
    escalationRate: e / n,
    avgConfidence: conf / n,
  };
}

export interface GraduationInput {
  currentLevel: 1 | 2 | 3 | 4;
  daysAtLevel: number;
  stats: SampleStats;
}

export interface GraduationEvaluation {
  currentLevel: 1 | 2 | 3 | 4;
  proposedLevel: 1 | 2 | 3 | 4;
  eligible: boolean;
  blockers: string[];
}

/**
 * Deterministic graduation rules — transcribed verbatim from the
 * AutonomyConsole.tsx LEVELS array so the displayed thresholds and the
 * evaluated thresholds cannot drift.
 */
export function evaluateGraduation(input: GraduationInput): GraduationEvaluation {
  const { currentLevel, daysAtLevel, stats } = input;
  const blockers: string[] = [];
  switch (currentLevel) {
    case 1: {
      if (stats.count < 500) blockers.push(`need >= 500 samples (have ${stats.count})`);
      if (stats.successRate < 0.9) {
        blockers.push(`need success rate >= 90% (have ${(stats.successRate * 100).toFixed(1)}%)`);
      }
      return {
        currentLevel,
        proposedLevel: blockers.length === 0 ? 2 : 1,
        eligible: blockers.length === 0,
        blockers,
      };
    }
    case 2: {
      if (daysAtLevel < 90) blockers.push(`need >= 90 days at L2 (have ${daysAtLevel})`);
      if (stats.reversalRate >= 0.01) {
        blockers.push(
          `need reversal rate < 1% (have ${(stats.reversalRate * 100).toFixed(2)}%)`,
        );
      }
      if (stats.count === 0) blockers.push('need observed samples in window');
      return {
        currentLevel,
        proposedLevel: blockers.length === 0 ? 3 : 2,
        eligible: blockers.length === 0,
        blockers,
      };
    }
    case 3: {
      if (daysAtLevel < 180) blockers.push(`need >= 180 days at L3 (have ${daysAtLevel})`);
      if (stats.avgConfidence < 0.97) {
        blockers.push(
          `need mean confidence >= 97% (have ${(stats.avgConfidence * 100).toFixed(1)}%)`,
        );
      }
      blockers.push('customer consent must be confirmed out-of-band');
      return {
        currentLevel,
        proposedLevel: 3,
        eligible: false,
        blockers,
      };
    }
    case 4:
    default: {
      return {
        currentLevel: 4,
        proposedLevel: 4,
        eligible: false,
        blockers: ['terminal level — re-evaluate only on incident'],
      };
    }
  }
}

export function isAutonomyOperation(value: unknown): value is AutonomyOperation {
  return typeof value === 'string' && (AUTONOMY_OPERATIONS as readonly string[]).includes(value);
}
