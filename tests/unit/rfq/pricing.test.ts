import {
  BASE_PER_MILE,
  CONFIDENCE_AUTO_SEND_THRESHOLD,
  isAutoSendable,
  isKnownEquipment,
  priceRfq,
} from '../../../services/rfq/src/domain/pricing';

describe('priceRfq', () => {
  it('uses dry_van rate at 800 miles → peak confidence', () => {
    const r = priceRfq({ distanceMiles: 800, equipmentType: 'dry_van' });
    expect(r.priceUsd).toBe(BASE_PER_MILE.dry_van * 800 + 75);
    expect(r.confidence).toBe(0.99);
  });

  it('reefer is more expensive per mile than dry_van', () => {
    const dry = priceRfq({ distanceMiles: 1000, equipmentType: 'dry_van' });
    const reefer = priceRfq({ distanceMiles: 1000, equipmentType: 'reefer' });
    expect(reefer.priceUsd).toBeGreaterThan(dry.priceUsd);
  });

  it('confidence drops for outlier distances (very short or very long)', () => {
    const peak = priceRfq({ distanceMiles: 800, equipmentType: 'dry_van' });
    const short = priceRfq({ distanceMiles: 50, equipmentType: 'dry_van' });
    const long = priceRfq({ distanceMiles: 2800, equipmentType: 'dry_van' });
    expect(short.confidence).toBeLessThan(peak.confidence);
    expect(long.confidence).toBeLessThan(peak.confidence);
  });

  it('confidence floor is 0.5', () => {
    const r = priceRfq({ distanceMiles: 5000, equipmentType: 'dry_van' });
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('is pure — same input → same output', () => {
    const a = priceRfq({ distanceMiles: 1234, equipmentType: 'flatbed' });
    const b = priceRfq({ distanceMiles: 1234, equipmentType: 'flatbed' });
    expect(a).toEqual(b);
  });
});

describe('isAutoSendable', () => {
  it(`triggers at confidence ≥ ${CONFIDENCE_AUTO_SEND_THRESHOLD}`, () => {
    expect(isAutoSendable(0.84)).toBe(false);
    expect(isAutoSendable(0.85)).toBe(true);
    expect(isAutoSendable(0.99)).toBe(true);
  });
});

describe('isKnownEquipment', () => {
  it('accepts the three equipment types', () => {
    expect(isKnownEquipment('dry_van')).toBe(true);
    expect(isKnownEquipment('reefer')).toBe(true);
    expect(isKnownEquipment('flatbed')).toBe(true);
  });
  it('rejects unknown equipment', () => {
    expect(isKnownEquipment('container')).toBe(false);
    expect(isKnownEquipment('')).toBe(false);
    expect(isKnownEquipment('Dry_Van')).toBe(false);
  });
});
