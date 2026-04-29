import type { Pool, QueryResult } from 'pg';
import {
  DEFAULT_THRESHOLDS,
  resetCooldownForTest,
  runAdminActivityTick,
  type AdminActivityDeps,
} from '../../../services/carrier/src/agent/adminActivityAgent';

interface ScenarioCounts {
  totalUsers: number;
  mfaUsers: number;
  registrations1h: number;
  adminActions1h: number;
}

function mockDeps(counts: ScenarioCounts): AdminActivityDeps & {
  recorded: Array<{ action: string; metadata: Record<string, unknown> }>;
} {
  const recorded: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  const pool = {
    query: async (sql: string, _params?: unknown[]) => {
      const norm = sql.replace(/\s+/g, ' ').toLowerCase();
      if (norm.includes('count(*)::text as total') && norm.includes('mfa_enabled')) {
        return {
          rows: [{ total: String(counts.totalUsers), mfa: String(counts.mfaUsers) }],
        } as QueryResult;
      }
      if (norm.includes('from users where created_at')) {
        return { rows: [{ c: String(counts.registrations1h) }] } as QueryResult;
      }
      if (norm.includes('audit_log') && norm.includes('action = any')) {
        return { rows: [{ c: String(counts.adminActions1h) }] } as QueryResult;
      }
      return { rows: [] as unknown[] } as unknown as QueryResult;
    },
  } as unknown as Pool;
  const audit = {
    record: (entry: { action: string; metadata?: Record<string, unknown> }) => {
      recorded.push({ action: entry.action, metadata: entry.metadata ?? {} });
      return Promise.resolve();
    },
  };
  return { pool, audit: audit as never, recorded };
}

describe('runAdminActivityTick', () => {
  beforeEach(() => resetCooldownForTest());

  it('reports ok when all metrics below thresholds', async () => {
    const deps = mockDeps({
      totalUsers: 50,
      mfaUsers: 45, // 90% adoption
      registrations1h: 2,
      adminActions1h: 5,
    });
    const result = await runAdminActivityTick(deps);
    expect(result.alerts).toBe(0);
    expect(result.ok).toBe(3);
    expect(deps.recorded).toHaveLength(0);
  });

  it('fires mfa_adoption_low when MFA % drops below threshold', async () => {
    const deps = mockDeps({
      totalUsers: 100,
      mfaUsers: 30, // 30% adoption — below default 50%
      registrations1h: 0,
      adminActions1h: 0,
    });
    const result = await runAdminActivityTick(deps);
    expect(result.alerts).toBe(1);
    expect(deps.recorded).toHaveLength(1);
    expect(deps.recorded[0]?.action).toBe('agent.admin_monitor.alert');
    expect(deps.recorded[0]?.metadata['metric']).toBe('mfa_adoption_low');
    expect(deps.recorded[0]?.metadata['adoptionPct']).toBe(30);
  });

  it('suppresses MFA alert when population is below mfaCheckMinUsers', async () => {
    const deps = mockDeps({
      totalUsers: 3, // below default 5
      mfaUsers: 0,
      registrations1h: 0,
      adminActions1h: 0,
    });
    const result = await runAdminActivityTick(deps);
    expect(result.alerts).toBe(0);
    expect(deps.recorded).toHaveLength(0);
  });

  it('fires registration_spike when count exceeds threshold', async () => {
    const deps = mockDeps({
      totalUsers: 100,
      mfaUsers: 90,
      registrations1h: 25, // > default 20
      adminActions1h: 0,
    });
    const result = await runAdminActivityTick(deps);
    expect(result.alerts).toBe(1);
    expect(deps.recorded[0]?.metadata['metric']).toBe('registration_spike');
    expect(deps.recorded[0]?.metadata['count']).toBe(25);
  });

  it('fires multiple alerts when multiple thresholds breached', async () => {
    const deps = mockDeps({
      totalUsers: 100,
      mfaUsers: 10, // 10% adoption
      registrations1h: 50, // way over
      adminActions1h: 200, // way over
    });
    const result = await runAdminActivityTick(deps);
    expect(result.alerts).toBe(3);
    expect(deps.recorded).toHaveLength(3);
    const metrics = deps.recorded.map((r) => r.metadata['metric']);
    expect(metrics).toEqual(
      expect.arrayContaining(['mfa_adoption_low', 'registration_spike', 'admin_action_spike']),
    );
  });

  it('respects cooldown across consecutive ticks', async () => {
    const deps = mockDeps({
      totalUsers: 100,
      mfaUsers: 10,
      registrations1h: 0,
      adminActions1h: 0,
    });
    const r1 = await runAdminActivityTick(deps);
    expect(r1.alerts).toBe(1);
    expect(deps.recorded).toHaveLength(1);

    deps.recorded.length = 0;
    const r2 = await runAdminActivityTick(deps);
    expect(r2.alerts).toBe(0);
    expect(r2.cooldown).toBeGreaterThanOrEqual(1);
    expect(deps.recorded).toHaveLength(0);
  });

  it('honors custom thresholds', async () => {
    const deps = mockDeps({
      totalUsers: 100,
      mfaUsers: 60, // 60%
      registrations1h: 0,
      adminActions1h: 0,
    });
    const r = await runAdminActivityTick(deps, {
      ...DEFAULT_THRESHOLDS,
      mfaAdoptionMinPct: 80, // raised — 60% now alerts
    });
    expect(r.alerts).toBe(1);
    expect(deps.recorded[0]?.metadata['metric']).toBe('mfa_adoption_low');
  });
});
