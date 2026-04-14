import { EVENT_SCHEMAS } from '../../../services/events/src/schema';

describe('event schema registry', () => {
  it('registers user.registered@1', () => {
    expect(EVENT_SCHEMAS['user.registered@1']).toBeDefined();
  });

  it('validates a correct user.registered payload', () => {
    const result = EVENT_SCHEMAS['user.registered@1'].safeParse({
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'broker@af.test',
      roles: ['broker'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects user.registered with empty roles', () => {
    const result = EVENT_SCHEMAS['user.registered@1'].safeParse({
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'broker@af.test',
      roles: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects user.registered with non-UUID id', () => {
    const result = EVENT_SCHEMAS['user.registered@1'].safeParse({
      userId: 'not-a-uuid',
      email: 'broker@af.test',
      roles: ['broker'],
    });
    expect(result.success).toBe(false);
  });

  it('validates shipment.carrier_selected with score in [0,1]', () => {
    const ok = EVENT_SCHEMAS['shipment.carrier_selected@1'].safeParse({
      shipmentId: '22222222-2222-2222-2222-222222222222',
      carrierId: '33333333-3333-3333-3333-333333333333',
      score: 0.88,
    });
    expect(ok.success).toBe(true);
    const bad = EVENT_SCHEMAS['shipment.carrier_selected@1'].safeParse({
      shipmentId: '22222222-2222-2222-2222-222222222222',
      carrierId: '33333333-3333-3333-3333-333333333333',
      score: 1.5,
    });
    expect(bad.success).toBe(false);
  });
});
