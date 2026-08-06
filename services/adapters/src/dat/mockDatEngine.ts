/**
 * Deterministic in-memory DAT engine for unit/integration tests.
 * CLAUDE.md: "Integration tests ... Must NEVER touch production." Tests wire
 * this engine so CI never hits the real DAT board. Same input → same output
 * (no clock, no randomness): rates are derived by hashing the lane.
 */
import type { AdapterResult, OpMeta } from '../contract';
import { correlationId, ok } from '../contract';
import type { DatEngine, DatLane, LaneRate, LoadPosting, PostResult, TruckCapacity } from './datAdapter';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function laneKey(lane: DatLane): string {
  const o = `${lane.origin.city ?? ''}-${lane.origin.state ?? ''}`;
  const d = `${lane.destination.city ?? ''}-${lane.destination.state ?? ''}`;
  return `${o}>${d}:${lane.equipmentCode}`;
}
function meta(operation: string, seed: string): OpMeta {
  return {
    adapter: 'dat',
    engine: 'mock',
    operation,
    correlationId: correlationId('dat', operation, seed),
    startedAt: '1970-01-01T00:00:00.000Z',
    durationMs: 0,
  };
}

export class MockDatEngine implements DatEngine {
  readonly kind = 'dat' as const;
  readonly engine = 'mock';

  async health() {
    return { state: 'up' as const, engine: this.engine };
  }

  async getLaneRate(lane: DatLane, seed: string): Promise<AdapterResult<LaneRate>> {
    const h = hash(laneKey(lane));
    const distanceMiles = 200 + (h % 2000);
    const avg = 1.5 + ((h >>> 4) % 250) / 100; // 1.50 .. 4.00
    const rate: LaneRate = {
      lane,
      avgRatePerMile: Math.round(avg * 100) / 100,
      lowRatePerMile: Math.round(avg * 0.85 * 100) / 100,
      highRatePerMile: Math.round(avg * 1.15 * 100) / 100,
      distanceMiles,
      confidence: 0.7 + ((h >>> 8) % 30) / 100,
      observedAt: '1970-01-01T00:00:00.000Z',
    };
    return ok(rate, meta('getLaneRate', seed));
  }

  async searchCapacity(lane: DatLane, pickupDate: string, seed: string): Promise<AdapterResult<TruckCapacity[]>> {
    const h = hash(laneKey(lane) + pickupDate);
    const count = h % 4; // 0..3 trucks — exercises the no-capacity path deterministically
    const trucks: TruckCapacity[] = Array.from({ length: count }, (_, i) => ({
      carrierName: `Mock Carrier ${((h >>> (i * 3)) % 900) + 100}`,
      mcNumber: `MC${((h >>> i) % 900000) + 100000}`,
      equipmentCode: lane.equipmentCode,
      ...(lane.origin.city ? { originCity: lane.origin.city } : {}),
      ...(lane.origin.state ? { originState: lane.origin.state } : {}),
      availableDate: pickupDate,
      contact: `dispatch${i}@mockcarrier.example`,
    }));
    return ok(trucks, meta('searchCapacity', seed));
  }

  async postLoad(load: LoadPosting, seed: string): Promise<AdapterResult<PostResult>> {
    // Idempotent: posting id is a pure function of the load reference.
    const postingId = `DATPOST-${hash(load.reference).toString(16)}`;
    return ok({ postingId, reference: load.reference }, meta('postLoad', seed));
  }
}
