import {
  WEIGHTS,
  rankCarriers,
  topN,
  type CarrierBid,
} from '../../../services/carrier/src/domain/scoring';

const bid = (overrides: Partial<CarrierBid> & { carrierId: string }): CarrierBid => ({
  carrierName: `Carrier ${overrides.carrierId}`,
  rating: 4,
  costUsd: 1000,
  pickupDistanceMiles: 50,
  ...overrides,
});

describe('rankCarriers (deterministic v1)', () => {
  it('returns [] when given no bids', () => {
    expect(rankCarriers([])).toEqual([]);
  });

  it('returns a single bid with cost/distance dimensions neutralized', () => {
    // Single bid: cost_score = 1, distance_score = 1, rating_score = rating/5.
    // score = 0.4*1 + 0.3*1 + 0.3*(3/5) = 0.88
    const only = bid({ carrierId: 'a', rating: 3, costUsd: 500, pickupDistanceMiles: 10 });
    const r = rankCarriers([only]);
    expect(r).toHaveLength(1);
    expect(r[0]?.score).toBe(0.88);
  });

  it('single bid with rating 5 scores exactly 1.0', () => {
    const r = rankCarriers([bid({ carrierId: 'perfect', rating: 5 })]);
    expect(r[0]?.score).toBe(1);
  });

  it('weights sum to 1.0', () => {
    const sum = WEIGHTS.cost + WEIGHTS.distance + WEIGHTS.rating;
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it('gives identical bids the same score and tie-breaks by cost then id', () => {
    const bids = [
      bid({ carrierId: 'c', costUsd: 1000, rating: 4 }),
      bid({ carrierId: 'a', costUsd: 1000, rating: 4 }),
      bid({ carrierId: 'b', costUsd: 1000, rating: 4 }),
    ];
    const r = rankCarriers(bids);
    expect(r.map((x) => x.carrierId)).toEqual(['a', 'b', 'c']);
    // All identical: cost=1, distance=1, rating=4/5=0.8 → score = 0.4+0.3+0.24 = 0.94
    expect(r.every((x) => x.score === 0.94)).toBe(true);
  });

  it('favors the cheapest bid when other dimensions are equal', () => {
    const r = rankCarriers([
      bid({ carrierId: 'expensive', costUsd: 2000 }),
      bid({ carrierId: 'cheap', costUsd: 500 }),
    ]);
    expect(r[0]?.carrierId).toBe('cheap');
  });

  it('favors the closer pickup when cost and rating are equal', () => {
    const r = rankCarriers([
      bid({ carrierId: 'far', pickupDistanceMiles: 500 }),
      bid({ carrierId: 'near', pickupDistanceMiles: 10 }),
    ]);
    expect(r[0]?.carrierId).toBe('near');
  });

  it('favors the higher-rated bid when cost and distance are equal', () => {
    const r = rankCarriers([
      bid({ carrierId: 'low', rating: 2 }),
      bid({ carrierId: 'high', rating: 5 }),
    ]);
    expect(r[0]?.carrierId).toBe('high');
  });

  it('computes composite score correctly against a hand-worked example', () => {
    const b1 = bid({ carrierId: 'x', rating: 5, costUsd: 500, pickupDistanceMiles: 10 });
    const b2 = bid({ carrierId: 'y', rating: 3, costUsd: 1500, pickupDistanceMiles: 60 });
    const r = rankCarriers([b1, b2]);
    // x: cost=1, distance=1, rating=1.0; total = 0.4+0.3+0.3 = 1.0
    // y: cost=0, distance=0, rating=0.6; total = 0 + 0 + 0.18 = 0.18
    expect(r[0]?.carrierId).toBe('x');
    expect(r[0]?.score).toBe(1);
    expect(r[1]?.score).toBe(0.18);
  });

  it('is pure — same input produces same output across invocations', () => {
    const input = [
      bid({ carrierId: 'a', rating: 4, costUsd: 800, pickupDistanceMiles: 30 }),
      bid({ carrierId: 'b', rating: 5, costUsd: 1200, pickupDistanceMiles: 20 }),
      bid({ carrierId: 'c', rating: 3, costUsd: 600, pickupDistanceMiles: 80 }),
    ];
    const r1 = rankCarriers(input);
    const r2 = rankCarriers(input);
    expect(r1).toEqual(r2);
  });

  it('scores are bounded in [0, 1]', () => {
    const bids = Array.from({ length: 10 }, (_, i) =>
      bid({
        carrierId: String(i),
        rating: 1 + (i % 5),
        costUsd: 200 + i * 150,
        pickupDistanceMiles: 5 + i * 20,
      }),
    );
    const r = rankCarriers(bids);
    for (const x of r) {
      expect(x.score).toBeGreaterThanOrEqual(0);
      expect(x.score).toBeLessThanOrEqual(1);
    }
  });
});

describe('topN', () => {
  it('slices the first N', () => {
    const bids = Array.from({ length: 10 }, (_, i) =>
      bid({
        carrierId: String(i),
        rating: 5 - (i % 5),
        costUsd: 100 + i * 100,
        pickupDistanceMiles: 10 + i * 5,
      }),
    );
    const ranked = rankCarriers(bids);
    expect(topN(ranked, 3)).toHaveLength(3);
    expect(topN(ranked, 50)).toHaveLength(10);
    expect(topN(ranked, 0)).toHaveLength(0);
  });
});
