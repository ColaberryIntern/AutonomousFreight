/**
 * Forward + backward chain integration test (hermetic, in-memory, deterministic).
 * Proves the whole ShipCES vertical slice: one inbound email becomes a customer
 * invoice with no human in the loop and no duplicate side effects.
 */
import { ingestEmail } from '../../services/rms/src/ingest/pipeline';
import { InMemoryIdempotencyStore, InMemoryDeadLetterStore } from '../../services/rms/src/ingest/stores';
import { handoffRmsToOms, InMemoryShipmentStore } from '../../services/oms/src/handoff';
import { applyOmsEvent } from '../../services/oms/src/stateMachine';
import { tenderShipment } from '../../services/oms/src/tender';
import type { Shipment } from '../../services/oms/src/schema/shipment.v1';
import { acceptTender, applyTmsEvent } from '../../services/tms/src/stateMachine';
import { recordMilestone } from '../../services/tms/src/milestones';
import { sourceCarriers } from '../../services/tms/src/sourcing';
import { handoffToBms } from '../../services/tms/src/handoffBms';
import { generateInvoice } from '../../services/bms/src/invoice';
import { MockDatEngine } from '../../services/adapters/src/dat/mockDatEngine';
import { MockFmcsaEngine } from '../../services/adapters/src/fmcsa/mockFmcsaEngine';
import type { InboundEmail } from '../../services/adapters/src/email/emailAdapter';

const AT = '2026-05-25T09:00:00Z';
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): T => {
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.value;
};

const email: InboundEmail = {
  messageId: 'chain-1',
  from: 'dispatch@abcmfg.com',
  to: ['quotes@shipces.com'],
  subject: 'Quote AF load',
  body: 'from Dallas, TX to Chicago, IL 42,000 lbs paper products dry van pickup 2026-05-25',
  receivedAt: '2026-05-21T12:00:00Z',
};

describe('forward + backward chain: email to invoice', () => {
  it('runs the whole lifecycle deterministically, idempotent at every handoff', async () => {
    // RMS
    const ing = await ingestEmail(email, { idempotency: new InMemoryIdempotencyStore(), deadLetter: new InMemoryDeadLetterStore() });
    expect(ing.status).toBe('accepted');
    if (ing.status !== 'accepted') return;

    // OMS handoff (idempotent) + walk to TENDERED
    const store = new InMemoryShipmentStore();
    const h = await handoffRmsToOms(ing.rfq, ing.emailHash, store);
    expect(h.status).toBe('created');
    if (h.status !== 'created') return;
    let s: Shipment = h.shipment;
    s = unwrap(applyOmsEvent(s, 'parse', AT));
    s = unwrap(applyOmsEvent(s, 'price', AT));
    s = { ...s, economics: { sellRateUsd: 2400 } };
    s = unwrap(applyOmsEvent(s, 'send_quote', AT));
    s = unwrap(applyOmsEvent(s, 'win', AT));
    const tendered = tenderShipment(s, AT);
    expect(tendered.ok).toBe(true);
    if (!tendered.ok) return;
    expect(tendered.tender.ediAlignment).toBe('910');
    s = tendered.shipment;

    // TMS
    s = unwrap(acceptTender(s, AT));
    expect(s.state).toBe('SOURCING');
    const sourced = await sourceCarriers(s, { dat: new MockDatEngine(), fmcsa: new MockFmcsaEngine() });
    expect(typeof sourced.laneRatePerMile).toBe('number');
    s = unwrap(applyTmsEvent(s, 'assign_carrier', AT));
    s = (recordMilestone(s, 'X3', AT) as { shipment: Shipment }).shipment;
    s = (recordMilestone(s, 'AF', AT) as { shipment: Shipment }).shipment;
    s = (recordMilestone(s, 'D1', AT) as { shipment: Shipment }).shipment;
    expect(s.state).toBe('DELIVERED');

    // BMS
    const bms = handoffToBms(s, AT, 'POD-chain', [{ code: 'DET', description: 'Detention', amountUsd: 150 }]);
    expect(bms.ok).toBe(true);
    if (!bms.ok) return;
    expect(bms.shipment.state).toBe('BILL_READY');
    const invoice = generateInvoice(bms.billReady, { invoiceSeq: 1, issueDate: '2026-05-28', fuelSurchargePct: 0.18 });
    expect(invoice.ediAlignment).toBe('210');
    expect(invoice.invoiceNumber).toBe('AF-INV-0001');
    // linehaul 2400 + FSC 432 + detention 150
    expect(invoice.totalUsd).toBe(2982);
  });

  it('is idempotent end to end: re-ingesting the same email creates no second shipment', async () => {
    const idem = new InMemoryIdempotencyStore();
    const dl = new InMemoryDeadLetterStore();
    const store = new InMemoryShipmentStore();

    const first = await ingestEmail(email, { idempotency: idem, deadLetter: dl });
    if (first.status !== 'accepted') throw new Error('setup failed');
    await handoffRmsToOms(first.rfq, first.emailHash, store);

    const second = await ingestEmail(email, { idempotency: idem, deadLetter: dl });
    expect(second.status).toBe('duplicate');
    if (second.status === 'duplicate') {
      const dupHandoff = await handoffRmsToOms(first.rfq, second.emailHash, store);
      expect(dupHandoff.status).toBe('duplicate');
    }
    expect(store.size).toBe(1);
  });
});
