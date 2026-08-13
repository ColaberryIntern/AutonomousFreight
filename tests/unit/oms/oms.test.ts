import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRfq, type Rfq } from '../../../services/rms/src/schema/rfq.v1';
import { parseShipment, type Shipment } from '../../../services/oms/src/schema/shipment.v1';
import { applyOmsEvent, omsCan } from '../../../services/oms/src/stateMachine';
import { buildShipmentFromRfq, handoffRmsToOms, InMemoryShipmentStore } from '../../../services/oms/src/handoff';
import { buildTender, tenderShipment } from '../../../services/oms/src/tender';

function loadRfq(): Rfq {
  const raw = readFileSync(join(__dirname, '../../../docs/dat-rfq-payload-examples.json'), 'utf8');
  const ex = (JSON.parse(raw).examples as Record<string, unknown>[])[0]!;
  const clean = Object.fromEntries(Object.entries(ex).filter(([k]) => !k.startsWith('_')));
  const r = parseRfq(clean);
  if (!r.ok) throw new Error('fixture RFQ invalid: ' + r.errors.join(';'));
  return r.value;
}

const AT = '2026-05-22T09:00:00Z';

describe('OMS handoff (RMS → OMS)', () => {
  const rfq = loadRfq();

  it('maps an RFQ to a valid RECEIVED shipment record', () => {
    const s = buildShipmentFromRfq(rfq, 'email_deadbeef');
    const parsed = parseShipment(s);
    expect(parsed.ok).toBe(true);
    expect(s.state).toBe('RECEIVED');
    expect(s.lane.origin.city).toBe('Dallas');
    expect(s.lane.destination.city).toBe('Chicago');
    expect(s.totalWeightLb).toBe(42000);
    expect(s.audit[0]).toMatchObject({ from: null, to: 'RECEIVED', event: 'ingest' });
  });

  it('is idempotent — second handoff of the same email hash returns duplicate', async () => {
    const store = new InMemoryShipmentStore();
    const a = await handoffRmsToOms(rfq, 'email_same', store);
    const b = await handoffRmsToOms(rfq, 'email_same', store);
    expect(a.status).toBe('created');
    expect(b.status).toBe('duplicate');
    if (a.status === 'created' && b.status === 'duplicate') {
      expect(b.shipment.shipmentId).toBe(a.shipment.shipmentId);
    }
    expect(store.size).toBe(1);
  });
});

describe('OMS state machine', () => {
  let base: Shipment;
  beforeEach(() => {
    base = buildShipmentFromRfq(loadRfq(), 'email_fsm');
  });

  it('walks the happy path RECEIVED → TENDERED', () => {
    let s = base;
    for (const ev of ['parse', 'price', 'send_quote', 'win', 'tender'] as const) {
      const r = applyOmsEvent(s, ev, AT);
      if (!r.ok) throw new Error(`unexpected: ${r.errors.join()}`);
      s = r.value;
    }
    expect(s.state).toBe('TENDERED');
    expect(s.audit.map((t) => t.event)).toEqual(['ingest', 'parse', 'price', 'send_quote', 'win', 'tender']);
  });

  it('rejects an illegal transition (cannot tender from RECEIVED)', () => {
    const r = applyOmsEvent(base, 'tender', AT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/illegal transition/);
  });

  it('supports the lose branch and blocks tender afterward', () => {
    let s = base;
    for (const ev of ['parse', 'price', 'send_quote'] as const) s = (applyOmsEvent(s, ev, AT) as { value: Shipment }).value;
    const lost = applyOmsEvent(s, 'lose', AT);
    expect(lost.ok).toBe(true);
    if (lost.ok) expect(omsCan(lost.value.state, 'tender')).toBe(false);
  });

  it('can flag EXCEPTION from an active state and is immutable (no in-place mutation)', () => {
    const r = applyOmsEvent(base, 'exception', AT, 'carrier fell through');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe('EXCEPTION');
      expect(base.state).toBe('RECEIVED'); // original untouched
    }
  });

  it('an OMS-phase EXCEPTION can be reopened (not a dead-end)', () => {
    const priced = (applyOmsEvent((applyOmsEvent(base, 'parse', AT) as { value: Shipment }).value, 'price', AT) as { value: Shipment }).value;
    const excepted = applyOmsEvent(priced, 'exception', AT);
    expect(excepted.ok).toBe(true);
    if (!excepted.ok) return;
    const reopened = applyOmsEvent(excepted.value, 'reopen', AT);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.value.state).toBe('RECEIVED');
  });
});

describe('OMS tender (EDI 910)', () => {
  it('builds an EDI-910-aligned tender payload from a shipment', () => {
    const s = buildShipmentFromRfq(loadRfq(), 'email_tender');
    const t = buildTender(s);
    expect(t.ediAlignment).toBe('910');
    expect(t.loadReference).toMatch(/^AF-/);
    expect(t.stops).toHaveLength(2);
    expect(t.stops[0]!.type).toBe('pickup');
    expect(t.stops[1]!.type).toBe('delivery');
  });

  it('tenderShipment only succeeds from WON', () => {
    let s = buildShipmentFromRfq(loadRfq(), 'email_tender2');
    expect(tenderShipment(s, AT).ok).toBe(false); // from RECEIVED
    for (const ev of ['parse', 'price', 'send_quote', 'win'] as const) s = (applyOmsEvent(s, ev, AT) as { value: Shipment }).value;
    const r = tenderShipment(s, AT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.shipment.state).toBe('TENDERED');
  });
});
