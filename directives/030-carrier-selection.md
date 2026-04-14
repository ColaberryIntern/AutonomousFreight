# Directive 030 — Carrier Selection (v1: Deterministic)

**Status:** active
**Owner:** Backend / Carrier Service
**Sprint:** 3
**Last Updated:** 2026-04-14

---

## Goal

Given a shipment and a set of carrier bids, return the bids ranked by a deterministic composite score so a broker can see the top-N candidates. **v1 is pure math** — no ML, no external calls. The AI-driven optimizer replaces this scoring in Sprint 10 behind a feature flag; v1 remains the reference implementation forever (determinism oracle).

## Inputs

- Path param: `shipment_id` (UUID) — must exist in `shipments` and be in status `quoting`.
- Query param: `top` (integer, default 5, max 50) — number of ranked carriers to return.
- Header: `Authorization: Bearer <jwt>`. Caller must have role `admin` or `broker`.

## Outputs

- `200 OK` with `{ shipmentId, rankings: [{ carrierId, carrierName, rating, costUsd, pickupDistanceMiles, score }, ...] }`, sorted by `score` descending, ties broken by `costUsd` ascending, then `carrierId` ascending.
- `score` is a float in `[0, 1]` rounded to 4 decimal places.

## Scoring Formula (v1)

```
cost_score     = 1 - (costUsd - minCost) / (maxCost - minCost)        # lower cost is better
distance_score = 1 - (pickupMiles - minMiles) / (maxMiles - minMiles) # closer pickup is better
rating_score   = rating / 5                                            # rating is 1..5

score = 0.4 * cost_score + 0.3 * distance_score + 0.3 * rating_score
```

Weights (`0.4 / 0.3 / 0.3`) are constants in code for Sprint 3. When only one bid exists or all bids have the same value on a dimension, that dimension contributes `1.0` (neutral) to avoid divide-by-zero.

## Edge Cases

1. Shipment does not exist → `404 Not Found`.
2. Shipment exists but not in status `quoting` → `409 Conflict` with `{ error: 'shipment_not_quotable' }`.
3. Shipment exists but has zero bids → `200 OK` with `rankings: []`.
4. Only one bid → cost and distance dimensions neutralize to `1.0`; rating still contributes `rating/5`. Example: single bid with `rating=5` → `score=1.0`; single bid with `rating=3` → `score=0.88`.
5. All bids tie on cost / distance / rating → every bid gets the same score; tie-break by `costUsd` ascending, then `carrierId` ascending.
6. `top` < 1 or > 50 → `400 Bad Request`.
7. Caller lacks role `admin` or `broker` → `403 Forbidden` (enforced by gateway's requireRole).
8. Caller is unauthenticated → `401 Unauthorized`.

## Safety Constraints

- NEVER return bids from carriers marked `active = false`.
- NEVER expose carriers' internal DOT numbers or other PII in the ranking response.
- NEVER allow the caller to override weights via query — that is a Sprint-10 admin-only feature.
- Scoring function MUST be pure: same inputs → same output, always. It becomes the determinism oracle for the Sprint 10 GA optimizer.

## Verification Expectations

- Unit tests (pure function, no DB): `tests/unit/carrier/scoring.test.ts` — covers all edge cases above in isolation.
- Integration tests: `tests/integration/carrier/select.test.ts` — full flow via gateway (auth → route → DB → response).
- E2E: Sprint 5.

## Dependencies

- Directive 010/011 — authentication & RBAC (caller identity).
- Directive 020 — request traverses the gateway.

## Change Log

- 2026-04-14 — Created in Sprint 3.
