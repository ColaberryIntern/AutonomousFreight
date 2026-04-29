import {
  classifyShortage,
  DEFAULT_THRESHOLDS,
} from '../../../services/carrier/src/domain/capacityShortage';

describe('classifyShortage', () => {
  it('returns normal for fresh shipments with bids', () => {
    expect(
      classifyShortage({ ageMinutes: 1, activeBidCount: 2, hardBlockedCount: 0 }),
    ).toBe('normal');
  });

  it('returns no_bids when zero bids past threshold', () => {
    expect(
      classifyShortage({
        ageMinutes: DEFAULT_THRESHOLDS.noBidsAfterMin,
        activeBidCount: 0,
        hardBlockedCount: 0,
      }),
    ).toBe('no_bids');
  });

  it('does not flag no_bids before the threshold', () => {
    expect(
      classifyShortage({
        ageMinutes: DEFAULT_THRESHOLDS.noBidsAfterMin - 1,
        activeBidCount: 0,
        hardBlockedCount: 0,
      }),
    ).toBe('normal');
  });

  it('returns all_blocked when every bid is hard-blocked, regardless of age', () => {
    expect(
      classifyShortage({ ageMinutes: 1, activeBidCount: 3, hardBlockedCount: 3 }),
    ).toBe('all_blocked');
  });

  it('does not return all_blocked when at least one bid is viable', () => {
    expect(
      classifyShortage({ ageMinutes: 1, activeBidCount: 3, hardBlockedCount: 2 }),
    ).toBe('normal');
  });

  it('returns stale for shipments past staleAfterMin with viable bids', () => {
    expect(
      classifyShortage({
        ageMinutes: DEFAULT_THRESHOLDS.staleAfterMin,
        activeBidCount: 1,
        hardBlockedCount: 0,
      }),
    ).toBe('stale');
  });

  it('honors custom thresholds', () => {
    expect(
      classifyShortage(
        { ageMinutes: 2, activeBidCount: 0, hardBlockedCount: 0 },
        { noBidsAfterMin: 1, staleAfterMin: 60 },
      ),
    ).toBe('no_bids');
  });
});
