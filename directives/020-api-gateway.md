# Directive 020 — API Gateway

**Status:** active
**Owner:** Platform / API Gateway
**Sprint:** 2
**Last Updated:** 2026-04-14

---

## Goal

Every external HTTP request to Autonomous Freight MUST enter through the API Gateway. The gateway is the single place that enforces cross-cutting concerns — request tracing, structured logging, rate limiting, metrics — before delegating to an internal service (User Service in Sprint 2; more services added per-sprint).

## Inputs

- Inbound HTTP request on gateway port `GATEWAY_PORT` (default `3000`).
- Optional inbound headers: `x-request-id`, `Authorization: Bearer <jwt>`.
- Environment: `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `RATE_LIMIT_WINDOW_MS` (default `60000`), `RATE_LIMIT_MAX` (default `120`).

## Outputs

- Every response carries an `x-request-id` header (echoed if client supplied a valid one, else UUIDv4).
- Every request emits exactly one structured JSON log line with: `requestId`, `method`, `path`, `status`, `durationMs`, `ip`.
- `/metrics` endpoint serves Prometheus text format.
- `/health` endpoint returns `200 {"status":"ok"}` without going through auth or rate limiting.
- Downstream-service routes are reachable under their declared mount point (e.g., User Service at `/`).

## Edge Cases

1. Client sends `x-request-id` matching `^[A-Za-z0-9-]{8,64}$` → echo it verbatim.
2. Client sends `x-request-id` that fails the format → replace with a fresh UUIDv4; do not error.
3. No `x-request-id` supplied → generate UUIDv4.
4. Rate limit exceeded for a given IP → `429 Too Many Requests` with `Retry-After` header; still emit the access-log line.
5. Unknown route → `404 Not Found` with `{ error: 'not_found' }`; still traced and logged.
6. `/metrics` and `/health` are exempt from rate limiting (operational endpoints).
7. Bearer token in `Authorization` header → NEVER logged; the logger redacts it.
8. Request body over 10kB → reject with `413 Payload Too Large` at the body parser.

## Safety Constraints

- NEVER log `Authorization` headers, passwords, bearer tokens, or request bodies containing them.
- NEVER allow rate-limit bypass via header spoofing; rate-limit key is derived from `req.ip` trusted via `trust proxy` only when `TRUST_PROXY=true` (default false).
- NEVER expose `/metrics` publicly in production — this is a Sprint 13 concern; for Sprint 2 document it and move on.
- NEVER block on logging — log writes are fire-and-forget via pino's async transport.

## Verification Expectations

- Unit tests: `tests/unit/gateway/traceId.test.ts`, `rateLimit.test.ts`, `metrics.test.ts`, `redaction.test.ts`.
- Integration tests: `tests/integration/gateway/endToEnd.test.ts` (register → login → /me via gateway, assert trace ID and metrics increments).
- Manual: `curl -i http://localhost:3000/health` shows `x-request-id`; `curl http://localhost:3000/metrics` returns text.

## Dependencies

- `pino` + `pino-http` — structured logging.
- `prom-client` — Prometheus metrics.
- `express-rate-limit` — rate limiting.
- Directives 010 / 011 — gateway mounts User Service routes.

## Known Gaps (deferred)

- Central auth middleware lives in User Service for Sprint 2; gateway enforces rate limiting and tracing. Moving JWT verify to the gateway requires a shared-secret story — handled in Sprint 13 with K8s secrets.
- Distributed tracing (OpenTelemetry / Jaeger) is Sprint 14.
- Per-user (not per-IP) rate limiting is deferred until after Sprint 6 session revocation.

## Change Log

- 2026-04-14 — Created in Sprint 2.
