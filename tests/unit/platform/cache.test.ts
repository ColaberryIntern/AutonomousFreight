import { InMemoryCache } from '../../../services/platform/src/cache/inMemoryCache';
import { wrap, type CacheMetrics } from '../../../services/platform/src/cache/cache';

function metricsTracker(): CacheMetrics & { stats: { hit: number; miss: number; error: number } } {
  const stats = { hit: 0, miss: 0, error: 0 };
  return {
    stats,
    hit: (): void => {
      stats.hit++;
    },
    miss: (): void => {
      stats.miss++;
    },
    error: (): void => {
      stats.error++;
    },
  };
}

describe('InMemoryCache', () => {
  it('round-trips a value', async () => {
    const c = new InMemoryCache();
    await c.set('k', 'v', 60);
    expect(await c.get('k')).toBe('v');
  });

  it('expires after the TTL elapses', async () => {
    const c = new InMemoryCache();
    await c.set('k', 'v', 0.05);
    await new Promise((r) => setTimeout(r, 100));
    expect(await c.get('k')).toBeNull();
  });

  it('del removes a key', async () => {
    const c = new InMemoryCache();
    await c.set('k', 'v', 60);
    await c.del('k');
    expect(await c.get('k')).toBeNull();
  });
});

describe('wrap', () => {
  it('records a miss + invokes loader on first call, hit on second', async () => {
    const c = new InMemoryCache();
    const m = metricsTracker();
    let calls = 0;
    const loader = (): Promise<number> => {
      calls++;
      return Promise.resolve(42);
    };
    expect(await wrap(c, 'k', 60, loader, m)).toBe(42);
    expect(await wrap(c, 'k', 60, loader, m)).toBe(42);
    expect(calls).toBe(1);
    expect(m.stats).toMatchObject({ hit: 1, miss: 1 });
  });

  it('bypasses cache when ttlSeconds <= 0', async () => {
    const c = new InMemoryCache();
    let calls = 0;
    const loader = (): Promise<string> => {
      calls++;
      return Promise.resolve('fresh');
    };
    await wrap(c, 'k', 0, loader);
    await wrap(c, 'k', 0, loader);
    expect(calls).toBe(2);
  });

  it('treats malformed JSON as a miss and evicts', async () => {
    const c = new InMemoryCache();
    await c.set('k', 'not-json{', 60);
    const loader = (): Promise<{ ok: true }> => Promise.resolve({ ok: true });
    const result = await wrap(c, 'k', 60, loader);
    expect(result).toEqual({ ok: true });
  });

  it('falls through to loader if cache backend errors', async () => {
    const m = metricsTracker();
    const failingCache = {
      get: (): Promise<string | null> => Promise.reject(new Error('redis down')),
      set: (): Promise<void> => Promise.reject(new Error('redis down')),
      del: (): Promise<void> => Promise.resolve(),
    };
    const result = await wrap(failingCache, 'k', 60, () => Promise.resolve('fresh'), m);
    expect(result).toBe('fresh');
    expect(m.stats.error).toBeGreaterThan(0);
  });
});
