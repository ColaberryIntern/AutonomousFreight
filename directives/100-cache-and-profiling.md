# Directive 100 — Redis Cache + Query Profiling

**Status:** active
**Owner:** Platform / Performance
**Sprint:** 10
**Last Updated:** 2026-04-15

---

## Goal

Make the read-heavy paths fast: cache hot lookups in Redis with explicit TTL + invalidation, and instrument every Postgres query with a duration histogram so slow queries surface in Grafana.

## Outputs

- `Cache` interface (`get`, `set`, `del`, `wrap`) backed by ioredis. `InMemoryCache` for tests.
- `wrap<T>(key, ttlSeconds, loader)` — get-or-load pattern; emits cache hit/miss metrics.
- `instrumentPool(pool, histogram)` — wraps `pg.Pool.query` to record `pg_query_duration_seconds{op}`.
- Two metric series added: `cache_operations_total{op,result}`, `pg_query_duration_seconds{op}`.

## Edge Cases

1. Redis down → `wrap` falls through to loader; logs error; emits `cache_operations_total{op="get",result="error"}`.
2. Cache returns malformed JSON → treated as miss, evicted, loader runs.
3. TTL ≤ 0 → bypass cache entirely.
4. Concurrent loaders for same key → no de-dup in v1; both run, last writer wins. Stampede protection deferred to Sprint 14.

## Safety Constraints

- NEVER cache sensitive PII at rest beyond the TTL — keys naming conventions documented.
- Cache key MUST be namespaced (`af:<service>:<key>`).
- Wrap loader errors are NEVER cached.

## Verification

- Unit: in-memory cache hit/miss/expiry, wrap behavior, error-path fallthrough.
- Integration covered by Sprint 11 load test.

## Change Log

- 2026-04-15 — Created in Sprint 10.
