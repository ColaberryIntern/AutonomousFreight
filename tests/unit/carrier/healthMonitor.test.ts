import type { Pool, QueryResult } from 'pg';
import {
  runHealthMonitorTick,
  resetCooldownForTest,
  DEFAULT_THRESHOLDS,
} from '../../../services/carrier/src/agent/healthMonitorAgent';

function mockDeps(counts: Record<string, number>) {
  const recorded: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  const pool = {
    query: async (_sql: string, params: unknown[]) => {
      const action = params[0] as string;
      const key = action.includes('%') ? 'agent_exceptions' : action;
      const c = String(counts[key] ?? 0);
      return { rows: [{ c }] } as QueryResult;
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

describe('healthMonitorAgent', () => {
  beforeEach(() => resetCooldownForTest());

  it('reports ok when all metrics below threshold', async () => {
    const deps = mockDeps({
      'auth.login.failure': 2,
      'agent_exceptions': 1,
      'gate.hard_blocked': 0,
    });
    const result = await runHealthMonitorTick(deps);
    expect(result.ok).toBe(3);
    expect(result.alerts).toBe(0);
    expect(deps.recorded).toHaveLength(0);
  });

  it('fires alert when login failures exceed threshold', async () => {
    const deps = mockDeps({
      'auth.login.failure': 15,
      'agent_exceptions': 0,
      'gate.hard_blocked': 0,
    });
    const result = await runHealthMonitorTick(deps);
    expect(result.alerts).toBe(1);
    expect(result.ok).toBe(2);
    expect(deps.recorded).toHaveLength(1);
    expect(deps.recorded[0]?.action).toBe('agent.health_monitor.alert');
    expect(deps.recorded[0]?.metadata?.['metric']).toBe('login_failures');
  });

  it('fires multiple alerts when multiple thresholds breached', async () => {
    const deps = mockDeps({
      'auth.login.failure': 20,
      'agent_exceptions': 10,
      'gate.hard_blocked': 15,
    });
    const result = await runHealthMonitorTick(deps);
    expect(result.alerts).toBe(3);
    expect(deps.recorded).toHaveLength(3);
  });

  it('respects cooldown — no repeat alerts within 5 minutes', async () => {
    const deps = mockDeps({ 'auth.login.failure': 20, 'agent_exceptions': 0, 'gate.hard_blocked': 0 });
    await runHealthMonitorTick(deps);
    expect(deps.recorded).toHaveLength(1);

    // Run again immediately — should be on cooldown
    deps.recorded.length = 0;
    const result2 = await runHealthMonitorTick(deps);
    expect(result2.cooldown).toBeGreaterThanOrEqual(1);
    expect(deps.recorded).toHaveLength(0);
  });

  it('uses custom thresholds', async () => {
    const deps = mockDeps({ 'auth.login.failure': 3, 'agent_exceptions': 0, 'gate.hard_blocked': 0 });
    const result = await runHealthMonitorTick(deps, {
      ...DEFAULT_THRESHOLDS,
      loginFailuresPerHour: 2,
    });
    expect(result.alerts).toBe(1);
  });
});
