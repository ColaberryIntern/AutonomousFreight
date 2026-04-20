import { recordUsage, getUsage, resetUsageForTest } from '../../../services/billing/src/domain/usage';

describe('usage metering', () => {
  beforeEach(() => resetUsageForTest());

  it('starts with zero counts', () => {
    const usage = getUsage('user-1');
    expect(usage).toHaveLength(3);
    for (const entry of usage) {
      expect(entry.count).toBe(0);
    }
  });

  it('records and retrieves usage', () => {
    recordUsage('user-1', 'api_calls', 5);
    recordUsage('user-1', 'api_calls', 3);
    const usage = getUsage('user-1');
    const apiCalls = usage.find((u) => u.metric === 'api_calls');
    expect(apiCalls?.count).toBe(8);
  });

  it('tracks separate users independently', () => {
    recordUsage('user-1', 'shipments_processed', 10);
    recordUsage('user-2', 'shipments_processed', 2);
    expect(getUsage('user-1').find((u) => u.metric === 'shipments_processed')?.count).toBe(10);
    expect(getUsage('user-2').find((u) => u.metric === 'shipments_processed')?.count).toBe(2);
  });

  it('defaults quantity to 1', () => {
    recordUsage('user-1', 'agent_runs');
    expect(getUsage('user-1').find((u) => u.metric === 'agent_runs')?.count).toBe(1);
  });

  it('includes periodStart in response', () => {
    const usage = getUsage('user-1');
    for (const entry of usage) {
      expect(typeof entry.periodStart).toBe('string');
    }
  });
});
