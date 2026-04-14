/**
 * notify_owner — CLAUDE.md §Escalation Protocol.
 *
 * Called by orchestration when a strategic governance boundary is crossed.
 * Reads /tmp/escalation.json and delivers a notification via configured channels.
 *
 * Sprint 0 scope: file-backed stub. Real delivery (SMS/email/Slack) wired in Sprint 4+.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ESCALATION_PATH = join(process.cwd(), 'tmp', 'escalation.json');

interface EscalationPayload {
  timestamp: string;
  problemSummary: string;
  rootCause: string;
  options: string[];
  risks: string[];
  recommendation: string;
  requiredDecision: string;
}

export function readEscalation(): EscalationPayload | null {
  if (!existsSync(ESCALATION_PATH)) return null;
  const raw = readFileSync(ESCALATION_PATH, 'utf8');
  return JSON.parse(raw) as EscalationPayload;
}

export function notifyOwner(): void {
  const payload = readEscalation();
  if (!payload) {
    console.warn('[notify_owner] no escalation.json found; nothing to notify.');
    return;
  }
  // Sprint 0 stub — real channels added in Sprint 4.
  console.warn('[notify_owner] ESCALATION:', JSON.stringify(payload, null, 2));
}

if (require.main === module) {
  notifyOwner();
}
