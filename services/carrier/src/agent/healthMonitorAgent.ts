import type { Pool } from 'pg';
import type { AuditRepository } from '../../../user/src/repo/auditRepository';

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between alerts per metric

export interface HealthMonitorDeps {
  pool: Pool;
  audit: AuditRepository;
}

export interface HealthThresholds {
  loginFailuresPerHour: number;
  agentExceptionsPerHour: number;
  gateBlocksPerHour: number;
}

export const DEFAULT_THRESHOLDS: HealthThresholds = {
  loginFailuresPerHour: 10,
  agentExceptionsPerHour: 5,
  gateBlocksPerHour: 10,
};

export interface HealthMonitorTickResult {
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

export async function runHealthMonitorTick(
  deps: HealthMonitorDeps,
  thresholds: HealthThresholds = DEFAULT_THRESHOLDS,
): Promise<HealthMonitorTickResult> {
  const result: HealthMonitorTickResult = { alerts: 0, ok: 0, cooldown: 0 };
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();

  const checks: Array<{
    metric: string;
    action: string;
    threshold: number;
  }> = [
    { metric: 'login_failures', action: 'auth.login.failure', threshold: thresholds.loginFailuresPerHour },
    { metric: 'agent_exceptions', action: 'agent.%.exception', threshold: thresholds.agentExceptionsPerHour },
    { metric: 'gate_blocks', action: 'gate.hard_blocked', threshold: thresholds.gateBlocksPerHour },
  ];

  for (const check of checks) {
    try {
      if (!canAlert(check.metric)) {
        result.cooldown++;
        continue;
      }

      const isLike = check.action.includes('%');
      const r = await deps.pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM audit_log
         WHERE ${isLike ? 'action LIKE $1' : 'action = $1'} AND occurred_at >= $2`,
        [check.action, oneHourAgo],
      );
      const count = Number(r.rows[0]?.c ?? 0);

      if (count >= check.threshold) {
        markAlerted(check.metric);
        void deps.audit.record({
          action: 'agent.health_monitor.alert',
          metadata: {
            metric: check.metric,
            count,
            threshold: check.threshold,
            window: '1h',
          },
        });
        result.alerts++;
      } else {
        result.ok++;
      }
    } catch (err) {
      console.error('[health-monitor-agent] error', { metric: check.metric, err });
    }
  }

  return result;
}

/** Reset cooldown state — test only. */
export function resetCooldownForTest(): void {
  lastAlertAt.clear();
}

export interface HealthCheck {
  metric: string;
  label: string;
  count: number;
  threshold: number;
  status: 'ok' | 'alert';
  windowHours: number;
}

export interface HealthSnapshot {
  checks: HealthCheck[];
  generatedAt: string;
}

const SNAPSHOT_DEFINITIONS: Array<{
  metric: keyof HealthThresholds;
  key: string;
  label: string;
  action: string;
}> = [
  {
    metric: 'loginFailuresPerHour',
    key: 'login_failures',
    label: 'Login failures',
    action: 'auth.login.failure',
  },
  {
    metric: 'agentExceptionsPerHour',
    key: 'agent_exceptions',
    label: 'Agent exceptions',
    action: 'agent.%.exception',
  },
  {
    metric: 'gateBlocksPerHour',
    key: 'gate_blocks',
    label: 'Gate hard blocks',
    action: 'gate.hard_blocked',
  },
];

/**
 * Read-only snapshot of the same KPIs the Health Monitor agent checks.
 * Used by GET /api/v1/agents/health to surface current status without
 * recording alerts or honoring cooldown.
 */
export async function computeHealthSnapshot(
  pool: Pool,
  thresholds: HealthThresholds = DEFAULT_THRESHOLDS,
): Promise<HealthSnapshot> {
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const checks: HealthCheck[] = [];

  for (const def of SNAPSHOT_DEFINITIONS) {
    const isLike = def.action.includes('%');
    const r = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM audit_log
       WHERE ${isLike ? 'action LIKE $1' : 'action = $1'} AND occurred_at >= $2`,
      [def.action, oneHourAgo],
    );
    const count = Number(r.rows[0]?.c ?? 0);
    const threshold = thresholds[def.metric];
    checks.push({
      metric: def.key,
      label: def.label,
      count,
      threshold,
      status: count >= threshold ? 'alert' : 'ok',
      windowHours: 1,
    });
  }

  return { checks, generatedAt: new Date().toISOString() };
}
