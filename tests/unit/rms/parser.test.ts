import { extractLane, extractEquipment, extractWeightLb, extractPickupDate, extractCommodity } from '../../../services/rms/src/parser/extractors';
import { parseEmailToRfq } from '../../../services/rms/src/parser/emailParser';
import { RFQ_ID_PATTERN } from '../../../services/rms/src/schema/rfq.v1';
import type { InboundEmail } from '../../../services/adapters/src/email/emailAdapter';

const richEmail: InboundEmail = {
  messageId: 'gmail-abc123',
  from: 'dispatch@abcmfg.com',
  to: ['quotes@shipces.com'],
  subject: 'Quote request',
  body: 'Need a truck from Dallas, TX to Chicago, IL. 42,000 lbs of paper products. Dry van. Pickup 2026-05-25.',
  receivedAt: '2026-05-21T12:00:00Z',
};

describe('extractors', () => {
  it('extractLane parses "from City, ST to City, ST"', () => {
    const lane = extractLane(richEmail.body);
    expect(lane.origin?.city).toBe('Dallas');
    expect(lane.origin?.state).toBe('TX');
    expect(lane.destination?.city).toBe('Chicago');
    expect(lane.destination?.state).toBe('IL');
  });

  it('extractEquipment maps keywords to canonical types', () => {
    expect(extractEquipment('need a reefer')).toBe('REEFER');
    expect(extractEquipment('flatbed load')).toBe('FLATBED');
    expect(extractEquipment('dry van please')).toBe('VAN');
    expect(extractEquipment('sprinter for expedite')).toBe('SPRINTER');
    expect(extractEquipment('no equipment mentioned')).toBeUndefined();
  });

  it('extractWeightLb handles commas and units', () => {
    expect(extractWeightLb('42,000 lbs')).toBe(42000);
    expect(extractWeightLb('weight 18000 pounds')).toBe(18000);
    expect(extractWeightLb('no weight')).toBeUndefined();
  });

  it('extractPickupDate finds an ISO date', () => {
    expect(extractPickupDate('pickup 2026-05-25 please')).toBe('2026-05-25');
    expect(extractPickupDate('no date')).toBeUndefined();
  });

  it('extractCommodity falls back to a safe generic', () => {
    expect(extractCommodity('commodity: auto parts')).toBe('auto parts');
    expect(extractCommodity('nothing here')).toBe('General freight');
  });
});

describe('parseEmailToRfq', () => {
  it('produces a contract-valid RFQ from a rich email, status NEW', () => {
    const r = parseEmailToRfq(richEmail);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(RFQ_ID_PATTERN.test(r.value.rfq.rfqId)).toBe(true);
      expect(r.value.rfq.status).toBe('NEW');
      expect(r.value.needsHumanReview).toBe(false);
      expect(r.value.rfq.shipment.stops[0]!.location.city).toBe('Dallas');
      expect(r.value.rfq.shipment.commodities[0]!.weightLb).toBe(42000);
    }
  });

  it('is deterministic — same email yields the same rfqId (idempotency basis)', () => {
    const a = parseEmailToRfq(richEmail);
    const b = parseEmailToRfq(richEmail);
    if (a.ok && b.ok) expect(a.value.rfq.rfqId).toBe(b.value.rfq.rfqId);
  });

  it('handles a display-name From header ("Name <addr>") without dead-lettering', () => {
    const r = parseEmailToRfq({ ...richEmail, messageId: 'dn-1', from: 'John Dispatcher <john@abcmfg.com>' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.rfq.customer.contacts?.[0]?.email).toBe('john@abcmfg.com');
      expect(r.value.rfq.customer.companyName).toBe('Abcmfg');
    }
  });

  it('routes a low-information email to AWAITING_HUMAN with HITL reason', () => {
    const sparse: InboundEmail = { ...richEmail, messageId: 'sparse-1', subject: 'hi', body: 'can you help me move something soon?' };
    const r = parseEmailToRfq(sparse);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.needsHumanReview).toBe(true);
      expect(r.value.rfq.status).toBe('AWAITING_HUMAN');
      expect(r.value.rfq.rawExtraction?.hitlReason).toBe('extraction');
      expect(r.value.rfq.rawExtraction?.overallConfidence).toBeLessThan(0.75);
    }
  });
});
