import { ingestEmail } from '../../../services/rms/src/ingest/pipeline';
import { InMemoryIdempotencyStore, InMemoryDeadLetterStore } from '../../../services/rms/src/ingest/stores';
import { linkReplyToShipment } from '../../../services/rms/src/reply/catchment';
import type { InboundEmail } from '../../../services/adapters/src/email/emailAdapter';

const email: InboundEmail = {
  messageId: 'm-idem-1',
  from: 'dispatch@abcmfg.com',
  to: ['quotes@shipces.com'],
  subject: 'Quote',
  body: 'from Dallas, TX to Chicago, IL 42,000 lbs dry van pickup 2026-05-25',
  receivedAt: '2026-05-21T12:00:00Z',
};

function deps() {
  return { idempotency: new InMemoryIdempotencyStore(), deadLetter: new InMemoryDeadLetterStore() };
}

describe('ingestEmail — idempotency (NON-NEGOTIABLE)', () => {
  it('accepts a new email and creates exactly one RFQ', async () => {
    const d = deps();
    const r = await ingestEmail(email, d);
    expect(r.status).toBe('accepted');
    expect(d.idempotency.size).toBe(1);
  });

  it('returns duplicate on the second ingest of the same email, same rfqId', async () => {
    const d = deps();
    const first = await ingestEmail(email, d);
    const second = await ingestEmail(email, d);
    expect(second.status).toBe('duplicate');
    if (first.status === 'accepted' && second.status === 'duplicate') {
      expect(second.rfqId).toBe(first.rfqId);
    }
    expect(d.idempotency.size).toBe(1); // no duplicate row
  });

  it('dead-letters a parse failure for replay (no silent drop)', async () => {
    const d = deps();
    const r = await ingestEmail(email, {
      ...d,
      parse: () => ({ ok: false, errors: ['forced failure'] }),
    });
    expect(r.status).toBe('dead_letter');
    const dl = await d.deadLetter.list();
    expect(dl).toHaveLength(1);
    expect(dl[0]!.errors).toContain('forced failure');
    expect(d.idempotency.size).toBe(0); // failure leaves no idempotency mark → retriable
  });
});

describe('linkReplyToShipment — Sylectus reply catchment', () => {
  const open = [
    { shipmentId: 'shp-1', loadId: 'AF-INV-0042', status: 'Sourcing' },
    { shipmentId: 'shp-2', loadId: 'AF-INV-0099', status: 'Delivered' },
  ];

  it('links a carrier reply to the open shipment by load id', () => {
    const reply: InboundEmail = { ...email, subject: 'Re: Load AF-INV-0042', body: 'I can cover this' };
    const r = linkReplyToShipment(reply, open);
    expect(r).toEqual({ matched: true, loadId: 'AF-INV-0042', shipmentId: 'shp-1' });
  });

  it('does not match a load that is no longer sourcing', () => {
    const reply: InboundEmail = { ...email, subject: 'Re: AF-INV-0099', body: 'still available?' };
    const r = linkReplyToShipment(reply, open);
    expect(r.matched).toBe(false);
    if (!r.matched) expect(r.reason).toBe('no_open_shipment');
  });

  it('reports no_load_id when the email has no reference token', () => {
    const reply: InboundEmail = { ...email, subject: 'hello', body: 'do you have anything for me' };
    const r = linkReplyToShipment(reply, open);
    expect(r.matched).toBe(false);
    if (!r.matched) expect(r.reason).toBe('no_load_id');
  });
});
