# Directive 110 — Load Testing & Read Replica Config

**Status:** active
**Owner:** Platform / Performance
**Sprint:** 11
**Last Updated:** 2026-04-15

---

## Goal

Two things land:

1. **Load test harness** — k6 scripts that drive register / login / select-carrier at increasing RPS, with pass/fail thresholds matching the NFRs (p95 < 200 ms, error rate < 1%, throughput ≥ 1000 TPS at peak).
2. **Read-replica routing primitive** — a `RoutedPool` that takes a primary `pg.Pool` plus zero or more replica `Pool`s; `query()` defaults to the primary, `queryRead()` round-robins replicas (falls back to primary if no replicas configured).

## Outputs

- `loadtest/k6/register.js`, `loadtest/k6/login.js`, `loadtest/k6/select-carrier.js`.
- `loadtest/README.md` documenting how to run locally + interpret thresholds.
- `services/platform/src/db/routedPool.ts` with unit tests.
- Terraform note: read-replica HCL stub added to `infra/terraform/postgres.tf` (NOT applied).

## NFR Thresholds (encoded in k6 options)

```
http_req_duration{expected_response:true}: p(95) < 200
http_req_failed: rate < 0.01
iterations: > 60_000 over 60s window for the steady-state stage
```

## Edge Cases

1. Replica pool empty → `queryRead` uses primary.
2. Replica throws → caller may decide to retry on primary (helper `queryReadOrPrimary` provided).
3. Round-robin counter overflow → modular arithmetic on Number.MAX_SAFE_INTEGER.

## Safety Constraints

- Load tests MUST point at a non-production target (env-gated).
- NEVER include real user creds in scripts; tests register synthetic users with a unique email pattern.

## Verification

- Unit: routed pool routing decisions.
- Manual: `k6 run loadtest/k6/select-carrier.js` against local docker-compose stack.

## Change Log

- 2026-04-15 — Created in Sprint 11.
