import type { Pool, QueryResult } from 'pg';
import { computeSecurityKpis } from '../../../services/user/src/domain/securityKpis';

function mockPool(responses: Array<{ rows: Record<string, unknown>[] }>): Pool {
  let callIndex = 0;
  return {
    query: async () => {
      const resp = responses[callIndex++];
      return resp as QueryResult;
    },
  } as unknown as Pool;
}

describe('computeSecurityKpis', () => {
  it('returns correct KPIs from query results', async () => {
    const pool = mockPool([
      { rows: [{ total: '10', mfa: '4' }] },        // user stats
      { rows: [{ c: '3' }] },                         // login failures 24h
      { rows: [{ c: '25' }] },                        // login successes 24h
      { rows: [{ c: '2' }] },                         // gate hard blocks 7d
      { rows: [{ c: '1' }] },                         // gate soft overrides 7d
      { rows: [{ c: '0' }] },                         // agent exceptions 24h
    ]);

    const kpis = await computeSecurityKpis(pool);

    expect(kpis.totalUsers).toBe(10);
    expect(kpis.mfaEnabledUsers).toBe(4);
    expect(kpis.mfaAdoptionPct).toBe(40);
    expect(kpis.loginFailures24h).toBe(3);
    expect(kpis.loginSuccesses24h).toBe(25);
    expect(kpis.gateHardBlocks7d).toBe(2);
    expect(kpis.gateSoftOverrides7d).toBe(1);
    expect(kpis.agentExceptions24h).toBe(0);
  });

  it('returns 0% MFA when no users exist', async () => {
    const pool = mockPool([
      { rows: [{ total: '0', mfa: '0' }] },
      { rows: [{ c: '0' }] },
      { rows: [{ c: '0' }] },
      { rows: [{ c: '0' }] },
      { rows: [{ c: '0' }] },
      { rows: [{ c: '0' }] },
    ]);

    const kpis = await computeSecurityKpis(pool);
    expect(kpis.mfaAdoptionPct).toBe(0);
    expect(kpis.totalUsers).toBe(0);
  });

  it('returns 100% MFA when all users enrolled', async () => {
    const pool = mockPool([
      { rows: [{ total: '5', mfa: '5' }] },
      { rows: [{ c: '0' }] },
      { rows: [{ c: '0' }] },
      { rows: [{ c: '0' }] },
      { rows: [{ c: '0' }] },
      { rows: [{ c: '0' }] },
    ]);

    const kpis = await computeSecurityKpis(pool);
    expect(kpis.mfaAdoptionPct).toBe(100);
  });
});
