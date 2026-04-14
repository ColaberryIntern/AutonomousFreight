# Directive 080 — AI Carrier Recommendations (v1)

**Status:** active
**Owner:** Backend / AI
**Sprint:** 8
**Last Updated:** 2026-04-14

---

## Goal

Provide a learned model that re-ranks carrier bids using the broker's historical preference signal (which carrier they actually accepted on past shipments). v1 ships a deterministic ensemble — no Python sidecar, no external ML service, no PII leaving the process.

## Outputs

- `POST /api/v1/recommendations` body `{ shipmentId }` → `{ recommendations: [...] }` ranked by learned probability of acceptance.
- Model is a small **decision-tree ensemble** trained offline (or on synthetic data for v1) from `assignment_history` rows. Persisted as JSON on disk under `services/ai/data/model-v1.json`. Versioned by `MODEL_VERSION` field.
- `GET /api/v1/recommendations/model` → `{ version, trainedAt, featureCount, treeCount }` for explainability.
- Logs: each prediction emits a structured line with `traceId`, `shipmentId`, `modelVersion`, `topCarrierId`, `score` for audit (no inputs of inference logged in full — just the decision).

## Edge Cases

1. No assignment history → fall back to deterministic v1 scoring (directive 030).
2. Model file missing or version mismatch → fall back to deterministic v1; log warning.
3. Shipment in non-quoting state → `409`.
4. Caller without `admin` or `broker` → `403`.

## Safety Constraints

- Model never emits raw feature vectors externally (privacy).
- Inference is pure: same `(shipment, candidates, model)` → same ranking. Tests assert determinism.
- No live online learning in v1 — model updates require explicit retrain script.

## Verification

- Unit: tree node evaluation, ensemble averaging, training on a tiny fixture, fallback path.
- Integration: model loads, predicts, returns ranked list.

## Change Log

- 2026-04-14 — Created in Sprint 8.
