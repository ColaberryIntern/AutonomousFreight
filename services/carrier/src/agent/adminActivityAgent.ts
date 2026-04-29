import type { Pool } from 'pg';
import type { AuditRepository } from '../../../user/src/repo/auditRepository';
import { ADMIN_ACTION_PATTERNS } from '../../../user/src/domain/adminSummary';
import { withRetry } from '../../../platform/src/reliability/withRetry';

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between alerts per metric

export interface AdminActivityDeps {
  pool: Pool;
  audit: AuditRepository;
}

export interface AdminActivityThresholds {
  /** Alert when MFA adoption % falls below this value. */
  mfaAdoptionMinPct: number;
  /** Alert when more than this many users register in 1h. */
  registrationsPerHour: number;
  /** Alert when admin-action audit events exceed this in 1h. */
  adminActionsPerHour: number;
  /** Below this user count, MFA adoption signal is suppressed (small-population noise). */
  mfaCheckMinUsers: number;
}

export const DEFAULT_THRESHOLDS: AdminActivityThresholds = {
  mfaAdoptionMinPct: 50,
  registrationsPerHour: 20,
  adminActionsPerHour: 50,
  mfaCheckMinUsers: 5,
};

export interface AdminActivityTickResult {
  alerts: number;
  ok: number;
  cooldown: number;
}

const lastAlertAt = new Map<string, number>();

function canAlert(metric: string): boolean {
  const last = lastAlertAt.get(metric);
  if (!last) return true;
  return Date.now() - last >= COOLDOWN_MS;
}

function markAlerted(metric: string): void {
  lastAlertAt.set(metric, Date.now());
}

/**
 * Threshold-based admin-population monitor. Mirrors the Health Monitor
 * agent shape: pure detection, no mutation, per-metric cooldown to keep
 * the audit_log signal-not-noise.
 *
 * Source-of-truth alignment: pulls ADMIN_ACTION_PATTERNS from the same
 * helper the /api/v1/admin/summary endpoint uses, so the dashboard view
 * and the agent's alerts cannot drift out of sync.
 */
export async function runAdminActivityTick(
  deps: AdminActivityDeps,
  thresholds: AdminActivityThresholds = DEFAULT_THRESHOLDS,
): Promise<AdminActivityTickResult> {
  const result: AdminActivityTickResult = { alerts: 0, ok: 0, cooldown: 0 };
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();

  // -------- mfa_adoption_low --------
  try {
    if (!canAlert('mfa_adoption_low')) {
      result.cooldown++;
    } else {
      const r = await withRetry(
        () =>
          deps.pool.query<{ total: string; mfa: string }>(
            `SELECT COUNT(*)::text AS total,
                    COUNT(*) FILTER (WHERE mfa_enabled = TRUE)::text AS mfa
             FROM users`,
          ),
        { attempts: 2, baseDelayMs: 100 },
      );
      const total = Number(r.rows[0]?.total ?? 0);
      const mfa = Number(r.rows[0]?.mfa ?? 0);
      if (total >= thresholds.mfaCheckMinUsers) {
        const adoptionPct = total === 0 ? 0 : Math.round((mfa / total) * 100);
        if (adoptionPct < thresholds.mfaAdoptionMinPct) {
          markAlerted('mfa_adoption_low');
          void deps.audit.record({
            action: 'agent.admin_monitor.alert',
            metadata: {
              metric: 'mfa_adoption_low',
              adoptionPct,
              threshold: thresholds.mfaAdoptionMinPct,
              total,
              mfa,
            },
          });
          result.alerts++;
        } else {
          result.ok++;
        }
      } else {
        // Population too small to make a meaningful adoption call.
        result.ok++;
      }
    }
  } catch (err) {
    console.error('[admin-activity-agent] error', { metric: 'mfa_adoption_low', err });
  }

  // -------- registration_spike --------
  try {
    if (!canAlert('registration_spike')) {
      result.cooldown++;
    } else {
      const r = await withRetry(
        () =>
          deps.pool.query<{ c: string }>(
            `SELECT COUNT(*)::text AS c FROM users WHERE created_at >= $1`,
            [oneHourAgo],
          ),
        { attempts: 2, baseDelayMs: 100 },
      );
      const count = Number(r.rows[0]?.c ?? 0);
      if (count > thresholds.registrationsPerHour) {
        markAlerted('registration_spike');
        void deps.audit.record({
          action: 'agent.admin_monitor.alert',
          metadata: {
            metric: 'registration_spike',
            count,
            threshold: thresholds.registrationsPerHour,
            window: '1h',
          },
        });
        result.alerts++;
      } else {
        result.ok++;
      }
    }
  } catch (err) {
    console.error('[admin-activity-agent] error', { metric: 'registration_spike', err });
  }

  // -------- admin_action_spike --------
  try {
    if (!canAlert('admin_action_spike')) {
      result.cooldown++;
    } else {
      const r = await withRetry(
        () =>
          deps.pool.query<{ c: string }>(
            `SELECT COUNT(*)::text AS c FROM audit_log
             WHERE occurred_at >= $1 AND action = ANY($2::text[])`,
            [oneHourAgo, ADMIN_ACTION_PATTERNS],
          ),
        { attempts: 2, baseDelayMs: 100 },
      );
      const count = Number(r.rows[0]?.c ?? 0);
      if (count > thresholds.adminActionsPerHour) {
        markAlerted('admin_action_spike');
        void deps.audit.record({
          action: 'agent.admin_monitor.alert',
          metadata: {
            metric: 'admin_action_spike',
            count,
            threshold: thresholds.adminActionsPerHour,
            window: '1h',
          },
        });
        result.alerts++;
      } else {
        result.ok++;
      }
    }
  } catch (err) {
    console.error('[admin-activity-agent] error', { metric: 'admin_action_spike', err });
  }

  return result;
}

/** Reset cooldown state — test only. */
export function resetCooldownForTest(): void {
  lastAlertAt.clear();
}
