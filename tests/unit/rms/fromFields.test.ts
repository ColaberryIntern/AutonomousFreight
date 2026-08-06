/**
 * parseEmailToRfqFromFields — the ExtractorEngine (LLM) assembly path.
 *
 * Covers the four mandatory test types: happy path (clean fields assemble a NEW
 * RFQ), failure path (missing lane routes to human review), boundary cases
 * (malformed model output is dropped, not trusted), and idempotency (same
 * inputs, same rfqId). No live LLM call anywhere; fields are supplied directly.
 */
import { parseEmailToRfqFromFields } from '../../../services/rms/src/parser/emailParser';
import type { ExtractedFields } from '../../../services/rms/src/extract/extractorEngine';
import type { InboundEmail } from '../../../services/adapters/src/email/emailAdapter';

const email: InboundEmail = {
  messageId: 'ff-test-1',
  from: 'Jane Ops <jane@acmefreight.com>',
  to: ['quotes@shipces.com'],
  subject: 'Re: FW: need this covered',
  body: 'long forwarded thread with signatures and no clean structure',
  receivedAt: '2026-05-21T12:00:00Z',
};

const cleanFields: ExtractedFields = {
  origin: { city: 'El Paso', state: 'TX' },
  destination: { city: 'Detroit', state: 'MI' },
  equipmentType: 'SPRINTER',
  weightLb: 3200,
  commodity: 'auto parts',
  language: 'en',
};

describe('parseEmailToRfqFromFields', () => {
  it('assembles a contract-valid NEW RFQ from clean extracted fields (happy path)', () => {
    const r = parseEmailToRfqFromFields(email, cleanFields);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rfq = r.value.rfq;
    expect(rfq.shipment.stops[0]!.location.city).toBe('El Paso');
    expect(rfq.shipment.stops[1]!.location.city).toBe('Detroit');
    expect(rfq.shipment.equipmentOptions[0]!.equipmentType).toBe('SPRINTER');
    expect(rfq.shipment.commodities[0]!.weightLb).toBe(3200);
    expect(rfq.shipment.commodities[0]!.description).toBe('auto parts');
    expect(rfq.rawExtraction?.overallConfidence).toBe(0.9); // only pickupDate missing
    expect(r.value.needsHumanReview).toBe(false);
    expect(rfq.status).toBe('NEW');
  });

  it('routes to human review when the model extracted no lane (failure path)', () => {
    const r = parseEmailToRfqFromFields(email, { weightLb: 500 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.needsHumanReview).toBe(true);
    expect(r.value.rfq.status).toBe('AWAITING_HUMAN');
    expect(r.value.rfq.rawExtraction?.overallConfidence).toBe(0.2);
  });

  it('normalizes casing and drops malformed model output instead of trusting it (boundary)', () => {
    const r = parseEmailToRfqFromFields(email, {
      ...cleanFields,
      equipmentType: 'sprinter' as unknown as NonNullable<ExtractedFields['equipmentType']>, // lowercase from the model
      weightLb: -5,                                                             // nonsense weight
      pickupDate: 'tomorrow',                                                   // not an ISO date
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rfq = r.value.rfq;
    expect(rfq.shipment.equipmentOptions[0]!.equipmentType).toBe('SPRINTER'); // normalized
    expect(rfq.shipment.commodities[0]!.weightLb).toBe(1);                    // dropped -> placeholder
    expect(rfq.shipment.stops[0]!.timing).toBeUndefined();                    // bad date dropped
  });

  it('drops a hallucinated pickup date outside the 14-day sanity bound (boundary)', () => {
    const stale = parseEmailToRfqFromFields(email, { ...cleanFields, pickupDate: '2023-10-06' });   // years past
    const tooFar = parseEmailToRfqFromFields(email, { ...cleanFields, pickupDate: '2026-06-30' });  // > 14 days out
    const valid = parseEmailToRfqFromFields(email, { ...cleanFields, pickupDate: '2026-05-25' });   // 4 days out
    expect(stale.ok && tooFar.ok && valid.ok).toBe(true);
    if (!stale.ok || !tooFar.ok || !valid.ok) return;
    expect(stale.value.rfq.shipment.stops[0]!.timing).toBeUndefined();
    expect(tooFar.value.rfq.shipment.stops[0]!.timing).toBeUndefined();
    expect(valid.value.rfq.shipment.stops[0]!.timing).toEqual({ windows: [{ date: '2026-05-25' }] });
  });

  it('is deterministic: identical email + fields yield the identical rfqId (idempotency)', () => {
    const a = parseEmailToRfqFromFields(email, cleanFields);
    const b = parseEmailToRfqFromFields(email, cleanFields);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.rfq.rfqId).toBe(b.value.rfq.rfqId);
    expect(a.value.emailHash).toBe(b.value.emailHash);
  });
});
