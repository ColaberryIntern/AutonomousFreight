import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRfq, isRfq, RfqSchema, RFQ_ID_PATTERN, type Rfq } from '../../../services/rms/src/schema/rfq.v1';

/** Load the 3 worked examples, stripping underscore-prefixed annotation keys (comments). */
function loadExamples(): Rfq[] {
  const raw = readFileSync(join(__dirname, '../../../docs/dat-rfq-payload-examples.json'), 'utf8');
  const parsed = JSON.parse(raw) as { examples: Record<string, unknown>[] };
  return parsed.examples.map(
    (ex) => Object.fromEntries(Object.entries(ex).filter(([k]) => !k.startsWith('_'))) as unknown as Rfq,
  );
}

describe('RFQ v1 contract — worked examples (happy path)', () => {
  const examples = loadExamples();

  it('loads exactly the 3 canonical examples', () => {
    expect(examples).toHaveLength(3);
  });

  it.each(examples.map((e, i) => [i, e] as const))('example %i validates against the contract', (_i, ex) => {
    const r = parseRfq(ex);
    if (!r.ok) throw new Error('unexpected validation failure: ' + r.errors.join('; '));
    expect(r.ok).toBe(true);
  });

  it('EX-2 preserves plural stops (multi-pickup consolidation run)', () => {
    const ex2 = examples[1]!;
    expect(ex2.shipment.stops.length).toBe(3);
    expect(ex2.shipment.stops.filter((s) => s.stopType === 'pickup')).toHaveLength(2);
  });

  it('EX-3 preserves plural serviceTypes + equipmentOptions (multi-option quoting)', () => {
    const ex3 = examples[2]!;
    expect(ex3.serviceTypes).toEqual(['EXPEDITE_SOLO', 'EXPEDITE_TEAM', 'EXPEDITE_EXCLUSIVE']);
    expect(ex3.shipment.equipmentOptions.length).toBe(3);
  });
});

describe('RFQ v1 contract — failure paths', () => {
  const base = loadExamples()[0]!;

  it('rejects a malformed rfqId', () => {
    const r = parseRfq({ ...base, rfqId: 'RFQ-123' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/rfqId/);
  });

  it('rejects an unknown top-level property (strict — no silent drift)', () => {
    const r = parseRfq({ ...base, sneaky: true });
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown channel', () => {
    const r = parseRfq({ ...base, source: { ...base.source, channel: 'carrier_pigeon' } });
    expect(r.ok).toBe(false);
  });

  it('rejects when first stop is not a pickup', () => {
    const flipped = structuredClone(base);
    flipped.shipment.stops[0]!.stopType = 'delivery';
    const r = parseRfq(flipped);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/first stop by sequence must be a pickup/);
  });

  it('rejects when last stop is not a delivery', () => {
    const flipped = structuredClone(base);
    flipped.shipment.stops[flipped.shipment.stops.length - 1]!.stopType = 'pickup';
    const r = parseRfq(flipped);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/last stop by sequence must be a delivery/);
  });

  it('rejects a single-stop shipment (min 2 stops)', () => {
    const oneStop = structuredClone(base);
    oneStop.shipment.stops = [oneStop.shipment.stops[0]!];
    expect(parseRfq(oneStop).ok).toBe(false);
  });

  it('rejects stops whose array order disagrees with sequence order (origin/dest swap guard)', () => {
    // Array[0] is a pickup and array[last] is a delivery (would pass a position
    // check), but by SEQUENCE the first stop is the delivery. Consumers flatten
    // by sequence, so this must be rejected.
    const swapped = structuredClone(base);
    swapped.shipment.stops[0]!.sequence = 2;
    swapped.shipment.stops[0]!.stopType = 'pickup';
    swapped.shipment.stops[1]!.sequence = 1;
    swapped.shipment.stops[1]!.stopType = 'delivery';
    const r = parseRfq(swapped);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/first stop by sequence must be a pickup/);
  });

  it('rejects negative commodity weight (boundary)', () => {
    const neg = structuredClone(base);
    neg.shipment.commodities[0]!.weightLb = -1;
    expect(parseRfq(neg).ok).toBe(false);
  });

  it('rejects an out-of-range extraction confidence (>1)', () => {
    const bad = structuredClone(base);
    bad.rawExtraction = { overallConfidence: 1.5 };
    expect(parseRfq(bad).ok).toBe(false);
  });

  it('returns a flat, path-tagged error list (typed error, never a throw)', () => {
    const r = parseRfq({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Array.isArray(r.errors)).toBe(true);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors.every((e) => typeof e === 'string')).toBe(true);
    }
  });
});

describe('RFQ v1 contract — helpers + boundary', () => {
  const base = loadExamples()[0]!;

  it('isRfq is a true type guard on valid input', () => {
    expect(isRfq(base)).toBe(true);
    expect(isRfq({})).toBe(false);
  });

  it('accepts weightLb of exactly 0 (boundary)', () => {
    const zero = structuredClone(base);
    zero.shipment.commodities[0]!.weightLb = 0;
    expect(parseRfq(zero).ok).toBe(true);
  });

  it('RFQ_ID_PATTERN matches a canonical id and rejects a bad one', () => {
    expect(RFQ_ID_PATTERN.test('rfq_01JV9QX3G7V8YQK9C7F0H1J2K3')).toBe(true);
    expect(RFQ_ID_PATTERN.test('rfq_lowercase00000000000000')).toBe(false);
  });

  it('schemaVersion, when present, must be exactly "1.0"', () => {
    expect(RfqSchema.safeParse({ ...base, schemaVersion: '2.0' }).success).toBe(false);
    expect(RfqSchema.safeParse({ ...base, schemaVersion: '1.0' }).success).toBe(true);
  });
});
