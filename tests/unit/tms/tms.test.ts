import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRfq, type Rfq } from '../../../services/rms/src/schema/rfq.v1';
import { buildShipmentFromRfq } from '../../../services/oms/src/handoff';
import { applyOmsEvent } from '../../../services/oms/src/stateMachine';
import { tenderShipment } from '../../../services/oms/src/tender';
import type { Shipment } from '../../../services/oms/src/schema/shipment.v1';
import { acceptTender, applyTmsEvent } from '../../../services/tms/src/stateMachine';
import { recordMilestone } from '../../../services/tms/src/milestones';
import { flagException, recover, recoveryFor } from '../../../services/tms/src/exception';
import { handoffToBms } from '../../../services/tms/src/handoffBms';
import { sourceCarriers } from '../../../services/tms/src/sourcing';
import { MockDatEngine } from '../../../services/adapters/src/dat/mockDatEngine';
import { MockFmcsaEngine } from '../../../services/adapters/src/fmcsa/mockFmcsaEngine';
import type { DatEngine, DatLane, LaneRate, LoadPosting, PostResult, TruckCapacity } from '../../../services/adapters/src/dat/datAdapter';
import type { AdapterResult, OpMeta } from '../../../services/adapters/src/contract';

/** DAT engine that is always down — every op returns a retryable outage error. */
class OutageDatEngine implements DatEngine {
  readonly kind = 'dat' as const;
  readonly engine = 'outage';
  async health() {
    return { state: 'down' as const, engine: this.engine };
  }
  private m(op: string): OpMeta {
    return { adapter: 'dat', engine: this.engine, operation: op, correlationId: 'x', startedAt: '1970-01-01T00:00:00.000Z', durationMs: 0 };
  }
  private down<T>(op: string): AdapterResult<T> {
    return { ok: false, error: { category: 'external_api', message: 'DAT board unreachable' }, meta: this.m(op) };
  }
  async getLaneRate(_l: DatLane, _s: string): Promise<AdapterResult<LaneRate>> {
    return this.down('getLaneRate');
  }
  async searchCapacity(_l: DatLane, _d: string, _s: string): Promise<AdapterResult<TruckCapacity[]>> {
    return this.down('searchCapacity');
  }
  async postLoad(_load: LoadPosting, _s: string): Promise<AdapterResult<PostResult>> {
    return this.down('postLoad');
  }
}

const AT = '2026-05-24T09:00:00Z';

function loadRfq(): Rfq {
  const raw = readFileSync(join(__dirname, '../../../docs/dat-rfq-payload-examples.json'), 'utf8');
  const ex = (JSON.parse(raw).examples as Record<string, unknown>[])[0]!;
  const r = parseRfq(Object.fromEntries(Object.entries(ex).filter(([k]) => !k.startsWith('_'))));
  if (!r.ok) throw new Error('bad fixture');
  return r.value;
}
/** Walk a fresh shipment from RECEIVED all the way to TENDERED. */
function tenderedShipment(seed = 'email_tms'): Shipment {
  let s = buildShipmentFromRfq(loadRfq(), seed);
  for (const ev of ['parse', 'price', 'send_quote', 'win'] as const) s = (applyOmsEvent(s, ev, AT) as { value: Shipment }).value;
  return (tenderShipment(s, AT) as { shipment: Shipment }).shipment;
}
function sourcingShipment(): Shipment {
  return (acceptTender(tenderedShipment(), AT) as { value: Shipment }).value;
}

describe('TMS state machine', () => {
  it('accepts a tender (TENDERED → SOURCING)', () => {
    const r = acceptTender(tenderedShipment(), AT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe('SOURCING');
  });

  it('walks SOURCING → DELIVERED', () => {
    let s = sourcingShipment();
    for (const ev of ['assign_carrier', 'dispatch', 'in_transit', 'deliver'] as const) {
      const r = applyTmsEvent(s, ev, AT);
      if (!r.ok) throw new Error(r.errors.join());
      s = r.value;
    }
    expect(s.state).toBe('DELIVERED');
  });

  it('rejects an illegal transition (cannot deliver from SOURCING)', () => {
    expect(applyTmsEvent(sourcingShipment(), 'deliver', AT).ok).toBe(false);
  });
});

describe('TMS milestones (EDI 214)', () => {
  it('maps state-changing codes and logs informational ones', () => {
    let s = (applyTmsEvent(sourcingShipment(), 'assign_carrier', AT) as { value: Shipment }).value;
    const x3 = recordMilestone(s, 'X3', AT); // arrived pickup → dispatch
    expect(x3.ok && x3.stateChanged && x3.shipment.state === 'DISPATCHED').toBe(true);
    if (!x3.ok) return;
    const af = recordMilestone(x3.shipment, 'AF', AT); // departed loaded → in transit
    expect(af.ok && af.shipment.state === 'IN_TRANSIT').toBe(true);
    if (!af.ok) return;
    const x1 = recordMilestone(af.shipment, 'X1', AT); // arrived delivery → informational
    expect(x1.ok && !x1.stateChanged && x1.shipment.state === 'IN_TRANSIT').toBe(true);
  });

  it('rejects an unknown 214 code', () => {
    expect(recordMilestone(sourcingShipment(), 'ZZ', AT).ok).toBe(false);
  });
});

describe('TMS exceptions (Failure-First)', () => {
  it('flags a typed exception and returns a recovery plan', () => {
    const r = flagException(sourcingShipment(), 'no_capacity', AT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shipment.state).toBe('EXCEPTION');
      expect(r.recovery.recoveryEvent).toBe('resume_sourcing');
      expect(r.recovery.owner).toBe('automation');
    }
  });

  it('recovers EXCEPTION → SOURCING (never a dead-end)', () => {
    const flagged = flagException(sourcingShipment(), 'breakdown', AT);
    if (!flagged.ok) throw new Error('flag failed');
    const back = recover(flagged.shipment, AT);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value.state).toBe('SOURCING');
  });

  it('every subtype has a recovery plan', () => {
    for (const st of ['no_capacity', 'no_show', 'breakdown', 'customer_dispute', 'document_missing'] as const) {
      expect(recoveryFor(st).description.length).toBeGreaterThan(0);
    }
  });
});

describe('TMS → BMS handoff (convergence point)', () => {
  it('DELIVERED → BILL_READY emits a Bill-Ready record and stamps the ref', () => {
    let s = sourcingShipment();
    for (const ev of ['assign_carrier', 'dispatch', 'in_transit', 'deliver'] as const) s = (applyTmsEvent(s, ev, AT) as { value: Shipment }).value;
    const r = handoffToBms(s, AT, 'POD-123', [{ code: 'DET', description: 'Detention', amountUsd: 150 }]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shipment.state).toBe('BILL_READY');
      expect(r.shipment.billReadyRef).toBe(r.billReady.billReadyRef);
      expect(r.billReady.podRef).toBe('POD-123');
      expect(r.billReady.accessorials).toHaveLength(1);
    }
  });

  it('cannot hand off to BMS before DELIVERED', () => {
    expect(handoffToBms(sourcingShipment(), AT).ok).toBe(false);
  });
});

describe('TMS sourcing (DAT capacity + FMCSA vetting)', () => {
  it('returns a well-formed sourcing result vetted through the adapters', async () => {
    const engines = { dat: new MockDatEngine(), fmcsa: new MockFmcsaEngine() };
    const r = await sourceCarriers(sourcingShipment(), engines);
    expect(typeof r.laneRatePerMile).toBe('number');
    expect(Array.isArray(r.candidates)).toBe(true);
    expect(r.bookableCount).toBe(r.candidates.filter((c) => c.bookable).length);
    expect(r.candidates.length).toBeLessThanOrEqual(3);
  });

  it('is deterministic for the same shipment', async () => {
    const r1 = await sourceCarriers(sourcingShipment(), { dat: new MockDatEngine(), fmcsa: new MockFmcsaEngine() });
    const r2 = await sourceCarriers(sourcingShipment(), { dat: new MockDatEngine(), fmcsa: new MockFmcsaEngine() });
    expect(r1.bookableCount).toBe(r2.bookableCount);
    expect(r1.candidates.length).toBe(r2.candidates.length);
  });

  it('surfaces a DAT outage instead of reporting it as an empty lane', async () => {
    const r = await sourceCarriers(sourcingShipment(), { dat: new OutageDatEngine(), fmcsa: new MockFmcsaEngine() });
    expect(r.candidates).toHaveLength(0);
    expect(r.sourcingError?.category).toBe('external_api'); // retryable, distinguishable from a truly empty lane
  });
});
