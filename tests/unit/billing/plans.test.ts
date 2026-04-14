import { isPlanId, PLANS } from '../../../services/billing/src/domain/plans';

describe('billing plans', () => {
  it('exposes Basic/Pro/Enterprise at $49/$99/$199', () => {
    expect(PLANS.basic.priceUsd).toBe(49);
    expect(PLANS.pro.priceUsd).toBe(99);
    expect(PLANS.enterprise.priceUsd).toBe(199);
  });

  it('isPlanId narrows to known plan ids', () => {
    expect(isPlanId('basic')).toBe(true);
    expect(isPlanId('pro')).toBe(true);
    expect(isPlanId('enterprise')).toBe(true);
    expect(isPlanId('free')).toBe(false);
    expect(isPlanId('')).toBe(false);
  });
});
