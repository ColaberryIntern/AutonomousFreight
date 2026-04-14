import {
  optimizeAssignment,
  type OptimizerInput,
} from '../../../services/carrier/src/domain/gaOptimizer';

interface Cand {
  carrierId: string;
  carrierName: string;
  rating: number;
  costUsd: number;
  pickupDistanceMiles: number;
}
const cand = (carrierId: string, costUsd: number, miles = 20, rating = 4): Cand => ({
  carrierId,
  carrierName: `C-${carrierId}`,
  rating,
  costUsd,
  pickupDistanceMiles: miles,
});

describe('optimizeAssignment', () => {
  it('returns empty result for zero shipments', () => {
    const r = optimizeAssignment(
      { shipmentIds: [], candidatesByShipment: {} },
      { populationSize: 4, generations: 2, mutationRate: 0.1, seed: 1 },
    );
    expect(r.assignment).toEqual({});
    expect(r.fitness).toBe(0);
  });

  it('assigns null when a shipment has no candidates', () => {
    const r = optimizeAssignment(
      { shipmentIds: ['s1'], candidatesByShipment: { s1: [] } },
      { populationSize: 4, generations: 2, mutationRate: 0.1, seed: 1 },
    );
    expect(r.assignment).toEqual({ s1: null });
  });

  it('is deterministic for a fixed seed', () => {
    const input: OptimizerInput = {
      shipmentIds: ['s1', 's2', 's3'],
      candidatesByShipment: {
        s1: [cand('c1', 800), cand('c2', 1000), cand('c3', 600, 60, 3)],
        s2: [cand('c1', 1200), cand('c2', 900), cand('c3', 1100, 50, 5)],
        s3: [cand('c1', 700, 80, 3), cand('c2', 850), cand('c3', 950)],
      },
    };
    const a = optimizeAssignment(input, {
      populationSize: 8,
      generations: 6,
      mutationRate: 0.1,
      seed: 42,
    });
    const b = optimizeAssignment(input, {
      populationSize: 8,
      generations: 6,
      mutationRate: 0.1,
      seed: 42,
    });
    expect(a).toEqual(b);
  });

  it('respects capacity penalty (avoids overloading one carrier)', () => {
    const input: OptimizerInput = {
      shipmentIds: ['s1', 's2', 's3', 's4'],
      candidatesByShipment: {
        s1: [cand('cheap', 100), cand('alt', 800)],
        s2: [cand('cheap', 100), cand('alt', 800)],
        s3: [cand('cheap', 100), cand('alt', 800)],
        s4: [cand('cheap', 100), cand('alt', 800)],
      },
      carrierCapacities: { cheap: 2 },
    };
    const r = optimizeAssignment(input, {
      populationSize: 16,
      generations: 12,
      mutationRate: 0.2,
      seed: 7,
    });
    const cheapCount = Object.values(r.assignment).filter((c) => c === 'cheap').length;
    expect(cheapCount).toBeLessThanOrEqual(3);
  });

  it('rejects oversized budgets', () => {
    expect(() =>
      optimizeAssignment(
        { shipmentIds: Array.from({ length: 100 }, (_, i) => `s${i}`), candidatesByShipment: {} },
        { populationSize: 1000, generations: 1000, mutationRate: 0.1, seed: 1 },
      ),
    ).toThrow();
  });
});
