export interface CarrierBid {
  carrierId: string;
  carrierName: string;
  rating: number;
  costUsd: number;
  pickupDistanceMiles: number;
}

export interface RankedCarrier extends CarrierBid {
  score: number;
}

export const WEIGHTS = { cost: 0.4, distance: 0.3, rating: 0.3 } as const;
export const MAX_RATING = 5;

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function normalizedLowerIsBetter(value: number, min: number, max: number): number {
  if (max === min) return 1;
  return 1 - (value - min) / (max - min);
}

export function rankCarriers(bids: readonly CarrierBid[]): RankedCarrier[] {
  if (bids.length === 0) return [];

  const costs = bids.map((b) => b.costUsd);
  const miles = bids.map((b) => b.pickupDistanceMiles);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const minMiles = Math.min(...miles);
  const maxMiles = Math.max(...miles);

  const ranked: RankedCarrier[] = bids.map((b) => {
    const costScore = normalizedLowerIsBetter(b.costUsd, minCost, maxCost);
    const distanceScore = normalizedLowerIsBetter(b.pickupDistanceMiles, minMiles, maxMiles);
    const ratingScore = b.rating / MAX_RATING;
    const raw =
      WEIGHTS.cost * costScore + WEIGHTS.distance * distanceScore + WEIGHTS.rating * ratingScore;
    return { ...b, score: round4(raw) };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.costUsd !== b.costUsd) return a.costUsd - b.costUsd;
    return a.carrierId.localeCompare(b.carrierId);
  });

  return ranked;
}

export function topN(ranked: readonly RankedCarrier[], n: number): RankedCarrier[] {
  return ranked.slice(0, n);
}
