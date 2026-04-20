import type { Pool, QueryResult } from 'pg';
import { computeSecurityTrends } from '../../../services/user/src/domain/securityTrends';

function mockPool(rows: Array<{ hour: Date; action: string; cnt: string }>): Pool {
  return {
    query: async () => ({ rows }) as QueryResult,
  } as unknown as Pool;
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000);
}

describe('computeSecurityTrends', () => {
  it('returns empty buckets when no audit events', async () => {
    const pool = mockPool([]);
    const result = await computeSecurityTrends(pool, 24);
    expect(result.buckets).toEqual([]);
    expect(result.alerts).toEqual([]);
  });

  it('buckets events by hour correctly', async () => {
    const h1 = hoursAgo(3);
    const h2 = hoursAgo(2);
    const pool = mockPool([
      { hour: h1, action: 'auth.login.failure', cnt: '5' },
      { hour: h1, action: 'auth.login.success', cnt: '20' },
      { hour: h2, action: 'auth.login.failure', cnt: '2' },
      { hour: h2, action: 'gate.hard_blocked', cnt: '1' },
    ]);

    const result = await computeSecurityTrends(pool, 24);
    expect(result.buckets).toHaveLength(2);
    expect(result.buckets[0]?.loginFailures).toBe(5);
    expect(result.buckets[0]?.loginSuccesses).toBe(20);
    expect(result.buckets[1]?.loginFailures).toBe(2);
    expect(result.buckets[1]?.gateBlocks).toBe(1);
  });

  it('flags critical alert when last hour > 3x average', async () => {
    const h1 = hoursAgo(4);
    const h2 = hoursAgo(3);
    const h3 = hoursAgo(2);
    const h4 = hoursAgo(1);
    const pool = mockPool([
      { hour: h1, action: 'auth.login.failure', cnt: '2' },
      { hour: h2, action: 'auth.login.failure', cnt: '3' },
      { hour: h3, action: 'auth.login.failure', cnt: '2' },
      { hour: h4, action: 'auth.login.failure', cnt: '15' },
    ]);

    const result = await computeSecurityTrends(pool, 24);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.severity).toBe('critical');
    expect(result.alerts[0]?.metric).toBe('Login failures');
  });

  it('flags warning alert when last hour > 2x average', async () => {
    const h1 = hoursAgo(4);
    const h2 = hoursAgo(3);
    const h3 = hoursAgo(2);
    const h4 = hoursAgo(1);
    const pool = mockPool([
      { hour: h1, action: 'auth.login.failure', cnt: '3' },
      { hour: h2, action: 'auth.login.failure', cnt: '3' },
      { hour: h3, action: 'auth.login.failure', cnt: '3' },
      { hour: h4, action: 'auth.login.failure', cnt: '7' },
    ]);

    const result = await computeSecurityTrends(pool, 24);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.severity).toBe('warning');
  });

  it('does not flag alert when too few buckets', async () => {
    const h1 = hoursAgo(1);
    const pool = mockPool([
      { hour: h1, action: 'auth.login.failure', cnt: '100' },
    ]);

    const result = await computeSecurityTrends(pool, 24);
    expect(result.alerts).toEqual([]);
  });

  it('handles agent exception events', async () => {
    const h1 = hoursAgo(1);
    const pool = mockPool([
      { hour: h1, action: 'agent.rate_audit.exception', cnt: '3' },
    ]);

    const result = await computeSecurityTrends(pool, 24);
    expect(result.buckets[0]?.agentExceptions).toBe(3);
  });
});
