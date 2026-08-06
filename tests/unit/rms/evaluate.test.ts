import {
  hasLocation,
  urgencyBucket,
  inferServiceTypes,
  validateDetails,
  routeState,
  evaluateOpportunity,
  toCanonicalServiceTypes,
  type EvalInput,
} from '../../../services/rms/src/evaluate/evaluateOpportunity';

const RECV = '2026-05-21T12:00:00Z';
function baseInput(over: Partial<EvalInput> = {}): EvalInput {
  return {
    pickup: { city: 'Dallas', state: 'TX', country: 'US' },
    delivery: { city: 'Chicago', state: 'IL', country: 'US' },
    receivedAtIso: RECV,
    freightStated: true,
    vehicleStated: true,
    equipmentType: 'VAN',
    weightLb: 42000,
    ...over,
  };
}

describe('D7 - location grammar', () => {
  it('present when (city AND state) OR zip; country-only fails', () => {
    expect(hasLocation({ city: 'Dallas', state: 'TX' })).toBe(true);
    expect(hasLocation({ postalCode: '75201' })).toBe(true);
    expect(hasLocation({ city: 'Dallas' })).toBe(false); // city without state
    expect(hasLocation({ country: 'US' })).toBe(false); // country-only
  });
});

describe('D8 - urgency bucket (8h / 24h thresholds)', () => {
  it('ASAP under 8 hours', () => {
    const r = urgencyBucket({ pickupDateTimeIso: '2026-05-21T18:00:00Z', receivedAtIso: RECV }); // 6h
    expect(r.bucket).toBe('ASAP');
  });
  it('SAME_DAY between 8 and 24 hours', () => {
    const r = urgencyBucket({ pickupDateTimeIso: '2026-05-22T00:00:00Z', receivedAtIso: RECV }); // 12h
    expect(r.bucket).toBe('SAME_DAY');
  });
  it('STANDARD at or beyond 24 hours', () => {
    const r = urgencyBucket({ pickupDateTimeIso: '2026-05-23T12:00:00Z', receivedAtIso: RECV }); // 48h
    expect(r.bucket).toBe('STANDARD');
  });
  it('UNKNOWN with no datetime and no phrasing', () => {
    expect(urgencyBucket({ receivedAtIso: RECV }).bucket).toBe('UNKNOWN');
  });
  it('ASAP phrasing overrides a far-out date', () => {
    expect(urgencyBucket({ pickupDateTimeIso: '2026-05-30T12:00:00Z', receivedAtIso: RECV, isAsapPhrasing: true }).bucket).toBe('ASAP');
  });
});

describe('D6 - service-type inference', () => {
  it('ASAP + small vehicle yields the expedite family incl. Expedite Exclusive', () => {
    const st = inferServiceTypes(baseInput({ equipmentType: 'SPRINTER', weightLb: 3000 }), 'ASAP');
    const types = st.map((s) => s.type);
    expect(types).toContain('EXP_SOLO');
    expect(types).toContain('EXP_TEAM');
    expect(types).toContain('EXPEDITE_EXCLUSIVE');
  });
  it('does not add Expedite Exclusive for a full-size van', () => {
    const st = inferServiceTypes(baseInput({ equipmentType: 'VAN' }), 'ASAP');
    expect(st.map((s) => s.type)).not.toContain('EXPEDITE_EXCLUSIVE');
  });
  it('light + roomy shipment qualifies for ELTL', () => {
    const st = inferServiceTypes(baseInput({ weightLb: 8000, linearInches: 200 }), 'STANDARD');
    expect(st.map((s) => s.type)).toContain('ELTL');
  });
  it('always includes TL as a manual-flag candidate', () => {
    expect(inferServiceTypes(baseInput(), 'STANDARD').some((s) => s.type === 'TL')).toBe(true);
  });
  it('firing rule is cited on every match (D31 shape)', () => {
    for (const m of inferServiceTypes(baseInput(), 'ASAP')) expect(m.firingRuleCited.length).toBeGreaterThan(0);
  });
});

describe('D4 - validator diagnostic', () => {
  it('complete when both locations present and freight stated', () => {
    const d = validateDetails(baseInput());
    expect(d.mustHaveStatus).toBe('complete');
    expect(d.reviewRequired).toBe(false);
  });
  it('hard-blocks on a missing delivery location', () => {
    const d = validateDetails(baseInput({ delivery: { country: 'US' } }));
    expect(d.mustHaveStatus).toBe('blocked');
    expect(d.blockReason).toBe('missing_location');
  });
  it('data-point-5: freight absent => FTL default + review (never blocks)', () => {
    const d = validateDetails(baseInput({ freightStated: false, vehicleStated: false, weightLb: undefined }));
    expect(d.mustHaveStatus).toBe('filled_with_fallbacks');
    expect(d.reviewRequired).toBe(true);
    expect(d.perField.freight).toBe('from_fallback_ftl');
    expect(d.assumptions.join()).toMatch(/FTL/);
  });
  it('flags a pickup date beyond the 14-day sanity bound', () => {
    const d = validateDetails(baseInput({ pickupDateTimeIso: '2026-06-30T12:00:00Z' }));
    expect(d.blockReason).toBe('date_out_of_bounds');
  });
});

describe('D14 - routing + orchestration', () => {
  it('complete routes to NEW without review', () => {
    expect(routeState(validateDetails(baseInput()))).toEqual({ status: 'NEW', needsHumanReview: false });
  });
  it('blocked routes to AWAITING_HUMAN', () => {
    const d = validateDetails(baseInput({ pickup: { country: 'US' } }));
    expect(routeState(d).status).toBe('AWAITING_HUMAN');
  });
  it('evaluateOpportunity ties it together (ASAP expedite, NEW, service types present)', () => {
    const opp = evaluateOpportunity(baseInput({ pickupDateTimeIso: '2026-05-21T17:00:00Z', equipmentType: 'SPRINTER', weightLb: 2500 }));
    expect(opp.urgency).toBe('ASAP');
    expect(opp.routedStatus).toBe('NEW');
    expect(opp.serviceTypes.length).toBeGreaterThan(0);
  });
  it('maps D6 matches onto the canonical RFQ serviceTypes enum, de-duped', () => {
    const canon = toCanonicalServiceTypes(inferServiceTypes(baseInput({ equipmentType: 'SPRINTER', weightLb: 3000 }), 'ASAP'));
    expect(canon).toContain('EXPEDITE_EXCLUSIVE');
    expect(canon).toContain('FTL'); // TL -> FTL
    expect(new Set(canon).size).toBe(canon.length); // no dupes
  });
});
