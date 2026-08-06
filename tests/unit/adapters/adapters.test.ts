import { correlationId, isRetryable, shouldRetry, type AdapterError } from '../../../services/adapters/src/contract';
import { DAT_EQUIPMENT, laneFromStops, type MinimalStop } from '../../../services/adapters/src/dat/datAdapter';
import { MockDatEngine } from '../../../services/adapters/src/dat/mockDatEngine';
import { isBookable, normalizeId, type CarrierAuthority, type CarrierInsurance } from '../../../services/adapters/src/fmcsa/fmcsaAdapter';
import { MockFmcsaEngine } from '../../../services/adapters/src/fmcsa/mockFmcsaEngine';
import { loadIdFromText } from '../../../services/adapters/src/sylectus/sylectusAdapter';
import { MockSylectusEngine } from '../../../services/adapters/src/sylectus/mockSylectusEngine';
import { emailHash } from '../../../services/adapters/src/email/emailAdapter';
import { MockEmailEngine } from '../../../services/adapters/src/email/mockEmailEngine';

describe('adapter contract — error classification + correlation', () => {
  const transient: AdapterError = { category: 'transient', message: 'timeout' };
  const validation: AdapterError = { category: 'validation', message: 'bad input' };

  it('only transient + external_api are retryable', () => {
    expect(isRetryable(transient)).toBe(true);
    expect(isRetryable({ category: 'external_api', message: 'x' })).toBe(true);
    expect(isRetryable(validation)).toBe(false);
    expect(isRetryable({ category: 'auth', message: 'x' })).toBe(false);
  });

  it('shouldRetry respects both category and attempt cap', () => {
    expect(shouldRetry(transient, 1, 3)).toBe(true);
    expect(shouldRetry(transient, 3, 3)).toBe(false);
    expect(shouldRetry(validation, 1, 3)).toBe(false);
  });

  it('correlationId is deterministic (same inputs → same id)', () => {
    expect(correlationId('dat', 'getLaneRate', 'lane-1')).toBe(correlationId('dat', 'getLaneRate', 'lane-1'));
    expect(correlationId('dat', 'getLaneRate', 'lane-1')).not.toBe(correlationId('dat', 'getLaneRate', 'lane-2'));
  });
});

describe('DAT adapter', () => {
  const stops: MinimalStop[] = [
    { sequence: 2, stopType: 'delivery', location: { city: 'Chicago', state: 'IL', country: 'US' } },
    { sequence: 1, stopType: 'pickup', location: { city: 'Dallas', state: 'TX', country: 'US' } },
  ];

  it('laneFromStops flattens plural route: first-by-sequence → origin, last → destination', () => {
    const lane = laneFromStops(stops, 'VAN');
    expect(lane.origin.city).toBe('Dallas');
    expect(lane.destination.city).toBe('Chicago');
    expect(lane.equipmentCode).toBe(DAT_EQUIPMENT.VAN);
  });

  it('laneFromStops rejects a single-stop route', () => {
    expect(() => laneFromStops([stops[0]!], 'VAN')).toThrow();
  });

  it('mock getLaneRate is deterministic and well-ordered (low ≤ avg ≤ high)', async () => {
    const dat = new MockDatEngine();
    const lane = laneFromStops(stops, 'VAN');
    const a = await dat.getLaneRate(lane, 's');
    const b = await dat.getLaneRate(lane, 's');
    expect(a).toEqual(b);
    if (a.ok) {
      expect(a.value.lowRatePerMile).toBeLessThanOrEqual(a.value.avgRatePerMile);
      expect(a.value.avgRatePerMile).toBeLessThanOrEqual(a.value.highRatePerMile);
    }
  });

  it('mock searchCapacity returns 0..3 trucks (exercises the no-capacity path by input)', async () => {
    const dat = new MockDatEngine();
    const lane = laneFromStops(stops, 'VAN');
    const r = await dat.searchCapacity(lane, '2026-07-10', 's');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.length).toBeLessThanOrEqual(3);
  });

  it('mock postLoad is idempotent by reference', async () => {
    const dat = new MockDatEngine();
    const load = { origin: {}, destination: {}, equipmentCode: 'V', pickupDate: '2026-07-10', reference: 'AF-INV-1' };
    const a = await dat.postLoad(load, 's');
    const b = await dat.postLoad(load, 's');
    if (a.ok && b.ok) expect(a.value.postingId).toBe(b.value.postingId);
  });
});

describe('FMCSA adapter', () => {
  it('normalizeId parses MC and DOT forms, rejects garbage', () => {
    expect(normalizeId('MC-123456')).toEqual({ type: 'mc', value: '123456' });
    expect(normalizeId('USDOT 987654')).toEqual({ type: 'dot', value: '987654' });
    expect(normalizeId('987654')).toEqual({ type: 'dot', value: '987654' });
    expect(normalizeId('not-a-number')).toBeNull();
  });

  it('isBookable requires active authority AND sufficient insurance', () => {
    const auth: CarrierAuthority = { dotNumber: '1', legalName: 'x', authorityStatus: 'ACTIVE', allowedToOperate: true };
    const ins: CarrierInsurance = { dotNumber: '1', bipdRequiredUsd: 750000, bipdOnFileUsd: 1000000, cargoOnFile: true, insuranceOnFile: true };
    expect(isBookable(auth, ins, 100000)).toBe(true);
    expect(isBookable({ ...auth, authorityStatus: 'INACTIVE', allowedToOperate: false }, ins, 100000)).toBe(false);
    expect(isBookable(auth, { ...ins, insuranceOnFile: false, bipdOnFileUsd: 0 }, 100000)).toBe(false);
    expect(isBookable(auth, { ...ins, cargoOnFile: false }, 100000)).toBe(false);
  });

  it('mock rejects an unrecognized identifier as a validation error', async () => {
    const fmcsa = new MockFmcsaEngine();
    const r = await fmcsa.getCarrierAuthority('garbage', 's');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.category).toBe('validation');
  });

  it('mock authority lookup is deterministic', async () => {
    const fmcsa = new MockFmcsaEngine();
    const a = await fmcsa.getCarrierAuthority('MC-123456', 's');
    const b = await fmcsa.getCarrierAuthority('MC-123456', 's');
    expect(a).toEqual(b);
  });
});

describe('Sylectus adapter (post-only)', () => {
  it('loadIdFromText finds AF ids, Load #, and Ref: tokens', () => {
    expect(loadIdFromText('Re: your load AF-INV-0042 update')).toBe('AF-INV-0042');
    expect(loadIdFromText('Covering Load #778812 out of Laredo')).toBe('778812');
    expect(loadIdFromText('ref: ABC-9931 confirmed')).toBe('ABC-9931');
    expect(loadIdFromText('no identifier here')).toBeNull();
  });

  it('has no reply surface (replies arrive via email, not Sylectus)', () => {
    const syl = new MockSylectusEngine();
    expect((syl as unknown as Record<string, unknown>)['readReplies']).toBeUndefined();
  });

  it('mock postLoad dedupes by reference', async () => {
    const syl = new MockSylectusEngine();
    const posting = { reference: 'AF-1', origin: 'Dallas', destination: 'Chicago', equipment: 'V', pickupDate: '2026-07-10' };
    await syl.postLoad(posting, 's');
    await syl.postLoad(posting, 's');
    const loads = await syl.readPostedLoads('s');
    if (loads.ok) expect(loads.value.filter((l) => l.reference === 'AF-1')).toHaveLength(1);
  });
});

describe('Email adapter', () => {
  it('emailHash prefers messageId and is deterministic', () => {
    const a = emailHash({ messageId: 'm-1', from: 'a@b.com', subject: 's', body: 'x' });
    const b = emailHash({ messageId: 'm-1', from: 'z@z.com', subject: 'different', body: 'y' });
    expect(a).toBe(b); // same messageId → same hash regardless of other fields
  });

  it('emailHash falls back to from+subject+body when messageId is empty', () => {
    const a = emailHash({ messageId: '', from: 'a@b.com', subject: 's', body: 'x' });
    const b = emailHash({ messageId: '', from: 'a@b.com', subject: 's', body: 'x' });
    const c = emailHash({ messageId: '', from: 'a@b.com', subject: 's', body: 'DIFFERENT' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('mock captures sent mail (send is gated in real engines)', async () => {
    const email = new MockEmailEngine();
    await email.send({ to: ['x@y.com'], subject: 'hi', body: 'b' }, 's');
    expect(email.sent).toHaveLength(1);
  });
});
