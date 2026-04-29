export type CapacityShortageClass = 'no_bids' | 'all_blocked' | 'stale' | 'normal';

export interface CapacityShortageThresholds {
  /** A shipment with zero bids older than this is considered a no_bids shortage. */
  noBidsAfterMin: number;
  /** A shipment in quoting older than this counts as stale even if bids exist. */
  staleAfterMin: number;
}

export const DEFAULT_THRESHOLDS: CapacityShortageThresholds = {
  noBidsAfterMin: 5,
  staleAfterMin: 30,
};

export interface ClassifyInput {
  ageMinutes: number;
  activeBidCount: number;
  hardBlockedCount: number;
}

/**
 * Classify a quoting shipment for capacity-shortage signal.
 *
 * Order matters: a shipment with zero bids past `noBidsAfterMin` is
 * `no_bids`; a shipment whose bids are all hard-blocked is `all_blocked`
 * (independent of age — gates are pass/fail); a shipment with at least
 * one viable bid but stuck for `staleAfterMin` is `stale`; otherwise
 * `normal`.
 *
 * Pure: no DB, no time source, no IO.
 */
export function classifyShortage(
  input: ClassifyInput,
  thresholds: CapacityShortageThresholds = DEFAULT_THRESHOLDS,
): CapacityShortageClass {
  const { ageMinutes, activeBidCount, hardBlockedCount } = input;
  if (activeBidCount === 0 && ageMinutes >= thresholds.noBidsAfterMin) {
    return 'no_bids';
  }
  if (activeBidCount > 0 && hardBlockedCount === activeBidCount) {
    return 'all_blocked';
  }
  if (ageMinutes >= thresholds.staleAfterMin) {
    return 'stale';
  }
  return 'normal';
}
