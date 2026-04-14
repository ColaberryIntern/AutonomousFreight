export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

export interface CacheMetrics {
  hit(): void;
  miss(): void;
  error(): void;
}

const NOOP_METRICS: CacheMetrics = { hit: () => {}, miss: () => {}, error: () => {} };

export async function wrap<T>(
  cache: Cache,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  metrics: CacheMetrics = NOOP_METRICS,
): Promise<T> {
  if (ttlSeconds <= 0) {
    return loader();
  }
  try {
    const cached = await cache.get(key);
    if (cached !== null) {
      try {
        const parsed = JSON.parse(cached) as T;
        metrics.hit();
        return parsed;
      } catch {
        await cache.del(key);
      }
    }
    metrics.miss();
  } catch {
    metrics.error();
  }
  const value = await loader();
  try {
    await cache.set(key, JSON.stringify(value), ttlSeconds);
  } catch {
    metrics.error();
  }
  return value;
}
