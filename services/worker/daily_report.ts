/**
 * daily_report — CLAUDE.md §Daily Executive Report.
 *
 * Reads autonomy log, escalations, test results; emits an executive summary.
 * Sprint 0 scope: reads autonomy log and prints a structured summary to stdout.
 * SMS / email / Slack delivery wired in Sprint 4+ (via Notification Service).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface AutonomyEntry {
  timestamp: string;
  changeSummary: string;
  assumptions: string[];
  confidenceScore: number;
  testsAdded: number;
  directivesUpdated: string[];
  escalationTriggered: boolean;
}

const AUTONOMY_LOG_PATH = join(process.cwd(), 'tmp', 'autonomy_log.json');

function readAutonomyLog(): AutonomyEntry[] {
  if (!existsSync(AUTONOMY_LOG_PATH)) return [];
  const raw = readFileSync(AUTONOMY_LOG_PATH, 'utf8');
  const parsed = JSON.parse(raw) as { entries?: AutonomyEntry[] };
  return parsed.entries ?? [];
}

export interface DailyReport {
  generatedAt: string;
  totalEntries: number;
  escalationsTriggered: number;
  averageConfidence: number;
  directivesTouched: string[];
  testsAddedTotal: number;
}

export function buildDailyReport(entries: AutonomyEntry[] = readAutonomyLog()): DailyReport {
  const total = entries.length;
  const escalations = entries.filter((e) => e.escalationTriggered).length;
  const avgConfidence =
    total === 0 ? 0 : entries.reduce((s, e) => s + e.confidenceScore, 0) / total;
  const directives = Array.from(new Set(entries.flatMap((e) => e.directivesUpdated)));
  const testsAdded = entries.reduce((s, e) => s + e.testsAdded, 0);

  return {
    generatedAt: new Date().toISOString(),
    totalEntries: total,
    escalationsTriggered: escalations,
    averageConfidence: Number(avgConfidence.toFixed(2)),
    directivesTouched: directives,
    testsAddedTotal: testsAdded,
  };
}

if (require.main === module) {
  console.warn(JSON.stringify(buildDailyReport(), null, 2));
}
