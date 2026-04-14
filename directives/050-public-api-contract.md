# Directive 050 — Public API Contract & Smoke Tests

**Status:** active
**Owner:** Platform / API Gateway
**Sprint:** 5
**Last Updated:** 2026-04-14

---

## Goal

Publish a machine-readable contract for every public endpoint and gate every CI promotion on a small, fast smoke-test suite that exercises the critical paths.

## Outputs

- `GET /openapi.json` — OpenAPI 3.0 document derived from zod schemas + route registry.
- `GET /docs` — Swagger UI rendering the spec.
- `npm run test:e2e` — runs smoke tests; ≤ 60s wall time; required green for production promotion.

## Edge Cases

1. New route lands without registry entry → `/openapi.json` omits it; smoke test added in same PR catches the gap.
2. Schema change breaks a smoke assertion → CI fails.
3. `/docs` exposed in production → acceptable for v1; gated by env flag in Sprint 13.

## Safety Constraints

- NEVER expose internal-only routes in `/openapi.json`.
- NEVER bake real secrets into the spec or examples.

## Verification

Smoke suite covers: register → login → /me → carrier-select happy path.

## Change Log

- 2026-04-14 — Created in Sprint 5 (Milestone 1).
