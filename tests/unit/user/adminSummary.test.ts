import type { Pool, QueryResult } from 'pg';
import {
  ADMIN_ACTION_PATTERNS,
  computeAdminSummary,
} from '../../../services/user/src/domain/adminSummary';

interface ScenarioCounts {
  total: number;
  mfa: number;
  registered7d: number;
  byRole: Record<string, number>;
  adminActions24h: number;
  topActions: Array<{ action: string; count: number }>;
}

function mockPool(counts: ScenarioCounts): Pool {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').toLowerCase();
      if (norm.includes('count(*)::text as c from users where mfa_enabled')) {
        return { rows: [{ c: String(counts.mfa) }] } as QueryResult;
      }
      if (norm.includes('count(*)::text as c from users where created_at')) {
        return { rows: [{ c: String(counts.registered7d) }] } as QueryResult;
      }
      if (norm.startsWith('select count(*)::text as c from users')) {
        return { rows: [{ c: String(counts.total) }] } as QueryResult;
      }
      if (norm.includes('from user_roles')) {
        return {
          rows: Object.entries(counts.byRole).map(([role_name, c]) => ({
            role_name,
            c: String(c),
          })),
        } as QueryResult;
      }
      if (norm.includes('group by action')) {
        return {
          rows: counts.topActions.map((t) => ({ action: t.action, c: String(t.count) })),
        } as QueryResult;
      }
      if (norm.includes('audit_log') && norm.includes('action = any')) {
        return { rows: [{ c: String(counts.adminActions24h) }] } as QueryResult;
      }
      return { rows: [] as unknown[] } as unknown as QueryResult;
    },
  } as unknown as Pool;
  (pool as unknown as { __calls: typeof calls }).__calls = calls;
  return pool;
}

describe('computeAdminSummary', () => {
  it('returns zeros + default role buckets for an empty population', async () => {
    const pool = mockPool({
      total: 0,
      mfa: 0,
      registered7d: 0,
      byRole: {},
      adminActions24h: 0,
      topActions: [],
    });
    const out = await computeAdminSummary({ pool });
    expect(out.users.total).toBe(0);
    expect(out.users.mfaEnabled).toBe(0);
    expect(out.users.mfaAdoptionPct).toBe(0);
    expect(out.users.registeredLast7d).toBe(0);
    expect(out.users.byRole).toEqual({ admin: 0, broker: 0, carrier: 0, auditor: 0 });
    expect(out.audit.adminActionsLast24h).toBe(0);
    expect(out.audit.topActions).toEqual([]);
  });

  it('aggregates role counts and computes MFA adoption percentage', async () => {
    const pool = mockPool({
      total: 10,
      mfa: 6,
      registered7d: 2,
      byRole: { admin: 1, broker: 5, carrier: 3, auditor: 1 },
      adminActions24h: 12,
      topActions: [
        { action: 'autonomy.level_changed', count: 7 },
        { action: 'auth.mfa.enrolled', count: 3 },
      ],
    });
    const out = await computeAdminSummary({ pool });
    expect(out.users.total).toBe(10);
    expect(out.users.mfaEnabled).toBe(6);
    expect(out.users.mfaAdoptionPct).toBe(60);
    expect(out.users.registeredLast7d).toBe(2);
    expect(out.users.byRole.broker).toBe(5);
    expect(out.users.byRole.admin).toBe(1);
    expect(out.audit.adminActionsLast24h).toBe(12);
    expect(out.audit.topActions[0]?.action).toBe('autonomy.level_changed');
  });

  it('rounds MFA adoption to 1 decimal place', async () => {
    const pool = mockPool({
      total: 7,
      mfa: 1,
      registered7d: 0,
      byRole: { broker: 7 },
      adminActions24h: 0,
      topActions: [],
    });
    const out = await computeAdminSummary({ pool });
    // 1/7 = 14.2857... rounds to 14.3
    expect(out.users.mfaAdoptionPct).toBe(14.3);
  });

  it('ignores unknown role names without throwing', async () => {
    const pool = mockPool({
      total: 3,
      mfa: 0,
      registered7d: 0,
      byRole: { broker: 2, mystery_role: 99 },
      adminActions24h: 0,
      topActions: [],
    });
    const out = await computeAdminSummary({ pool });
    expect(out.users.byRole.broker).toBe(2);
    expect((out.users.byRole as unknown as Record<string, number>)['mystery_role']).toBeUndefined();
  });

  it('exposes a stable list of admin action patterns', () => {
    expect(ADMIN_ACTION_PATTERNS).toContain('autonomy.level_changed');
    expect(ADMIN_ACTION_PATTERNS).toContain('auth.mfa.enrolled');
    expect(ADMIN_ACTION_PATTERNS.length).toBeGreaterThanOrEqual(3);
  });
});
