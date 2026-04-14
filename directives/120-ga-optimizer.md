# Directive 120 — Genetic Algorithm Carrier Optimizer

**Status:** active
**Owner:** Backend / AI
**Sprint:** 12
**Last Updated:** 2026-04-15

---

## Goal

For multi-shipment batch assignment problems (assigning N shipments to N carriers under capacity constraints), v1 deterministic scoring (directive 030) is per-shipment myopic. A genetic algorithm (GA) explores the joint assignment space. Behind a feature flag — when off, the v1 scorer remains the source of truth.

## Outputs

- Pure function `optimizeAssignment(shipments, candidatesByShipment, options)` → `{ assignment: Record<shipmentId, carrierId>, fitness: number, generations: number }`.
- Fitness = average of per-(shipment, carrier) directive-030 scores minus a penalty for over-capacity assignments.
- Seeded RNG (mulberry32 from Sprint 8) for determinism.
- Feature flag: `FEATURE_GA_OPTIMIZER` env (off by default). When on, the carrier router exposes `POST /api/v1/optimize`.

## Edge Cases

1. Zero shipments → returns `{ assignment: {}, fitness: 0, generations: 0 }`.
2. A shipment with no candidates → that shipment is unassigned (`carrierId === null` in the result map).
3. All carriers overloaded under the cap → best-effort solution returned; fitness reflects the penalty.
4. Determinism: same `(input, seed, generations)` → same output.

## Safety Constraints

- GA timeouts: hard-stop at `maxMs`; partial result returned with `generations` reflecting actual.
- Feature flag check happens at router level — never compute GA when flag off.
- Memory bounded: population × generations × shipments ≤ 1M cells (validated at start).

## Verification

- Unit: tournament selection, crossover, mutation, end-to-end `optimizeAssignment` produces fitness ≥ greedy baseline on a fixture.
- Determinism test: identical seed → identical output.

## Change Log

- 2026-04-15 — Created in Sprint 12.
