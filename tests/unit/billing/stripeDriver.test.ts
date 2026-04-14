import { StripeBillingDriver } from '../../../services/billing/src/drivers/stripeBillingDriver';

describe('StripeBillingDriver construction', () => {
  it('throws when api key is missing', () => {
    expect(
      () =>
        new StripeBillingDriver({
          apiKey: '',
          priceIds: { basic: 'p_b', pro: 'p_p', enterprise: 'p_e' },
        }),
    ).toThrow();
  });

  it('throws when api key is malformed', () => {
    expect(
      () =>
        new StripeBillingDriver({
          apiKey: 'pk_publishable',
          priceIds: { basic: 'p_b', pro: 'p_p', enterprise: 'p_e' },
        }),
    ).toThrow();
  });

  it('throws when any price id is missing', () => {
    expect(
      () =>
        new StripeBillingDriver({
          apiKey: 'sk_test_xxx',
          priceIds: { basic: '', pro: 'p_p', enterprise: 'p_e' },
        }),
    ).toThrow();
  });

  it('constructs with valid config but rejects calls (Sprint-18 gate)', () => {
    const d = new StripeBillingDriver({
      apiKey: 'sk_test_xxx',
      priceIds: { basic: 'p_b', pro: 'p_p', enterprise: 'p_e' },
    });
    expect(() => d.subscribe('c', 'pro')).toThrow();
    expect(() => d.cancel('c')).toThrow();
    expect(() => d.get('c')).toThrow();
  });
});
