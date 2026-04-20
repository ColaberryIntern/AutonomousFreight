import type { Pool } from 'pg';

export interface TrendBucket {
  hour: string;
  loginFailures: number;
  loginSuccesses: number;
  gateBlocks: number;
  gateOverrides: number;
  agentExceptions: number;
}

export interface TrendAlert {
  metric: string;
  currentHour: number;
  avgPrior: number;
  severity: 'warning' | 'critical';
}

const SECURITY_ACTIONS = [
  'auth.login.failure',
  'auth.login.success',
  'gate.hard_blocked',
  'gate.soft_overridden',
] as const;

/**
 * Fetches security audit events from the last `hours` hours,
 * buckets them by hour, and flags anomalies (spikes > 2x average).
 */
export async function computeSecurityTrends(
  pool: Pool,
  hours = 24,
): Promise<{ buckets: TrendBucket[]; alerts: TrendAlert[] }> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  const r = await pool.query<{
    hour: Date;
    action: string;
    cnt: string;
  }>(
    `SELECT date_trunc('hour', occurred_at) AS hour,
            action,
            COUNT(*)::text AS cnt
     FROM audit_log
     WHERE occurred_at >= $1
       AND (action = ANY($2) OR action LIKE 'agent.%.exception')
     GROUP BY hour, action
     ORDER BY hour ASC`,
    [since, SECURITY_ACTIONS as unknown as string[]],
  );

  const bucketMap = new Map<string, TrendBucket>();

  for (const row of r.rows) {
    const key = row.hour.toISOString();
    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        hour: key,
        loginFailures: 0,
        loginSuccesses: 0,
        gateBlocks: 0,
        gateOverrides: 0,
        agentExceptions: 0,
      };
      bucketMap.set(key, bucket);
    }
    const count = Number(row.cnt);
    if (row.action === 'auth.login.failure') bucket.loginFailures += count;
    else if (row.action === 'auth.login.success') bucket.loginSuccesses += count;
    else if (row.action === 'gate.hard_blocked') bucket.gateBlocks += count;
    else if (row.action === 'gate.soft_overridden') bucket.gateOverrides += count;
    else if (row.action.includes('exception')) bucket.agentExceptions += count;
  }

  const buckets = Array.from(bucketMap.values());
  const alerts: TrendAlert[] = [];

  if (buckets.length >= 3) {
    const metrics: Array<{ key: keyof TrendBucket; label: string }> = [
      { key: 'loginFailures', label: 'Login failures' },
      { key: 'gateBlocks', label: 'Gate hard blocks' },
      { key: 'agentExceptions', label: 'Agent exceptions' },
    ];

    for (const { key, label } of metrics) {
      const values = buckets.map((b) => b[key] as number);
      const last = values[values.length - 1] ?? 0;
      const prior = values.slice(0, -1);
      const avg = prior.reduce((a, b) => a + b, 0) / Math.max(prior.length, 1);
      if (avg > 0 && last > avg * 3) {
        alerts.push({ metric: label, currentHour: last, avgPrior: Math.round(avg * 10) / 10, severity: 'critical' });
      } else if (avg > 0 && last > avg * 2) {
        alerts.push({ metric: label, currentHour: last, avgPrior: Math.round(avg * 10) / 10, severity: 'warning' });
      }
    }
  }

  return { buckets, alerts };
}
