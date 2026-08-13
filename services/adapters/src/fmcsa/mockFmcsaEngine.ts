/**
 * Deterministic in-memory FMCSA engine for tests. No live SaferWeb calls.
 * The identifier hash decides authority/insurance so every carrier lookup is
 * stable and both the bookable and non-bookable paths are reachable by input.
 */
import type { AdapterResult, OpMeta } from '../contract';
import { correlationId, err, ok } from '../contract';
import type { CarrierAuthority, CarrierInsurance, FmcsaEngine } from './fmcsaAdapter';
import { normalizeId } from './fmcsaAdapter';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function meta(operation: string, seed: string): OpMeta {
  return {
    adapter: 'fmcsa',
    engine: 'mock',
    operation,
    correlationId: correlationId('fmcsa', operation, seed),
    startedAt: '1970-01-01T00:00:00.000Z',
    durationMs: 0,
  };
}

export class MockFmcsaEngine implements FmcsaEngine {
  readonly kind = 'fmcsa' as const;
  readonly engine = 'mock';

  async health() {
    return { state: 'up' as const, engine: this.engine };
  }

  async getCarrierAuthority(id: string, seed: string): Promise<AdapterResult<CarrierAuthority>> {
    const norm = normalizeId(id);
    if (!norm) {
      return err(
        { category: 'validation', message: 'unrecognized DOT/MC identifier', detail: id },
        meta('getCarrierAuthority', seed),
      );
    }
    const h = hash(norm.value);
    // ~1 in 5 carriers is not active — exercises the compliance-block path.
    const active = h % 5 !== 0;
    const dotNumber = norm.type === 'dot' ? norm.value : String(1000000 + (h % 8999999));
    return ok(
      {
        dotNumber,
        mcNumber: norm.type === 'mc' ? norm.value : `MC${100000 + (h % 899999)}`,
        legalName: `Mock Carrier ${h % 9000}`,
        authorityStatus: active ? 'ACTIVE' : 'INACTIVE',
        allowedToOperate: active,
      },
      meta('getCarrierAuthority', seed),
    );
  }

  async getInsurance(dotNumber: string, seed: string): Promise<AdapterResult<CarrierInsurance>> {
    const h = hash('ins' + dotNumber);
    const onFile = h % 7 !== 0; // ~1 in 7 has no insurance on file
    const bipdOnFile = onFile ? 750000 + (h % 500000) : 0;
    return ok(
      {
        dotNumber,
        bipdRequiredUsd: 750000,
        bipdOnFileUsd: bipdOnFile,
        cargoOnFile: onFile && h % 3 !== 0,
        insuranceOnFile: onFile,
      },
      meta('getInsurance', seed),
    );
  }
}
