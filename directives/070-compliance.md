# Directive 070 — Compliance Service

**Status:** active
**Owner:** Backend / Compliance
**Sprint:** 7
**Last Updated:** 2026-04-14

---

## Goal

Track regulatory artifacts (FMCSA broker authority, surety bond, state licenses) per organization, surface upcoming expirations, and provide a deterministic risk score for any carrier.

## Outputs

- Tables: `compliance_artifacts` (broker authority, surety bond, state license) with `expires_at`. `carrier_compliance` per carrier with FMCSA snapshot fields (DOT number, operating status, safety rating, insurance on file).
- `GET /api/v1/compliance/expiring?within_days=30` — lists artifacts expiring within window. RBAC: `admin` or `auditor`.
- `GET /api/v1/carriers/:id/compliance` — returns the carrier's compliance snapshot + a risk score in `[0, 1]`. RBAC: `admin`, `broker`, `auditor`.
- Risk score is a pure function of: operating status (active=0 vs other=0.5), safety rating (Satisfactory=0, Conditional=0.4, Unsatisfactory=1, Unrated=0.3), insurance on file (true=0 vs false=0.4), days since FMCSA snapshot (>180 → +0.2). Capped at 1.

## Edge Cases

1. Carrier with no compliance row → `404`.
2. `within_days` outside `[1, 365]` → `400`.
3. Expired artifact (expires_at in past) → still returned by `expiring` endpoint with `expired=true` flag.
4. Risk-score inputs partially missing → use worst-case defaults.

## Safety Constraints

- Risk-scoring function is pure (determinism oracle); algorithmic changes require directive bump.
- FMCSA fields stored verbatim — no client-side normalization that could lose information.

## Verification

- Unit: risk-score table-driven cases.
- Integration: GET endpoints with seeded data.

## Change Log

- 2026-04-14 — Created in Sprint 7.
