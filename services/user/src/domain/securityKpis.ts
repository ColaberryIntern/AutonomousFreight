import type { Pool } from 'pg';

export interface SecurityKpis {
  mfaAdoptionPct: number;
  loginFailures24h: number;
  loginSuccesses24h: number;
  gateHardBlocks7d: number;
  gateSoftOverrides7d: number;
  agentExceptions24h: number;
  totalUsers: number;
  mfaEnabledUsers: number;
}

export async function computeSecurityKpis(pool: Pool): Promise<SecurityKpis> {
  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const ago7d = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();

  const [userStats, loginFail, loginOk, hardBlocks, softOverrides, agentExc] = await Promise.all([
    pool.query<{ total: string; mfa: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE mfa_enabled = TRUE)::text AS mfa
       FROM users`,
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM audit_log
       WHERE action = 'auth.login.failure' AND occurred_at >= $1`,
      [ago24h],
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM audit_log
       WHERE action = 'auth.login.success' AND occurred_at >= $1`,
      [ago24h],
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM audit_log
       WHERE action = 'gate.hard_blocked' AND occurred_at >= $1`,
      [ago7d],
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM audit_log
       WHERE action = 'gate.soft_overridden' AND occurred_at >= $1`,
      [ago7d],
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM audit_log
       WHERE action LIKE 'agent.%.exception' AND occurred_at >= $1`,
      [ago24h],
    ),
  ]);

  const totalUsers = Number(userStats.rows[0]?.total ?? 0);
  const mfaEnabledUsers = Number(userStats.rows[0]?.mfa ?? 0);

  return {
    totalUsers,
    mfaEnabledUsers,
    mfaAdoptionPct: totalUsers > 0 ? Math.round((mfaEnabledUsers / totalUsers) * 100) : 0,
    loginFailures24h: Number(loginFail.rows[0]?.c ?? 0),
    loginSuccesses24h: Number(loginOk.rows[0]?.c ?? 0),
    gateHardBlocks7d: Number(hardBlocks.rows[0]?.c ?? 0),
    gateSoftOverrides7d: Number(softOverrides.rows[0]?.c ?? 0),
    agentExceptions24h: Number(agentExc.rows[0]?.c ?? 0),
  };
}
