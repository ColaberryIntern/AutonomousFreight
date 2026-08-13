/** Deterministic in-memory Sylectus engine for tests. Post is idempotent. */
import type { AdapterResult, OpMeta } from '../contract';
import { correlationId, ok } from '../contract';
import type { SylectusEngine, SylectusPosting, SylectusPostResult, SylectusTruck } from './sylectusAdapter';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function meta(operation: string, seed: string): OpMeta {
  return { adapter: 'sylectus', engine: 'mock', operation, correlationId: correlationId('sylectus', operation, seed), startedAt: '1970-01-01T00:00:00.000Z', durationMs: 0 };
}

export class MockSylectusEngine implements SylectusEngine {
  readonly kind = 'sylectus' as const;
  readonly engine = 'mock';
  private readonly posted: SylectusPosting[] = [];

  async health() {
    return { state: 'up' as const, engine: this.engine };
  }

  async postLoad(posting: SylectusPosting, seed: string): Promise<AdapterResult<SylectusPostResult>> {
    if (!this.posted.some((p) => p.reference === posting.reference)) this.posted.push(posting);
    return ok({ postingId: `SYL-${hash(posting.reference).toString(16)}`, reference: posting.reference }, meta('postLoad', seed));
  }

  async readPostedLoads(seed: string): Promise<AdapterResult<SylectusPosting[]>> {
    return ok([...this.posted], meta('readPostedLoads', seed));
  }

  async readTruckAvailability(seed: string): Promise<AdapterResult<SylectusTruck[]>> {
    const h = hash('trucks' + seed);
    const trucks: SylectusTruck[] = Array.from({ length: h % 3 }, (_, i) => ({
      carrierName: `Sylectus Carrier ${((h >>> i) % 900) + 100}`,
      equipment: 'V',
      location: 'Laredo, TX',
      availableDate: '1970-01-01',
    }));
    return ok(trucks, meta('readTruckAvailability', seed));
  }
}
