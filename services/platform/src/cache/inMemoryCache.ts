import type { Cache } from './cache';

interface Entry {
  value: string;
  expiresAt: number;
}

export class InMemoryCache implements Cache {
  private readonly store = new Map<string, Entry>();

  get(key: string): Promise<string | null> {
    const e = this.store.get(key);
    if (!e) return Promise.resolve(null);
    if (e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(e.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
