# Directive 021 — Observability Baseline

**Status:** active
**Owner:** Platform
**Sprint:** 2
**Last Updated:** 2026-04-14

---

## Goal

Establish the minimum observability surface every service emits so that latency, errors, and throughput are inspectable from day one. This is a foundation directive — later sprints layer on ELK (Sprint 14) and distributed tracing (Sprint 14) without changing the shape of what services emit.

## Inputs

- In-process HTTP traffic crossing the API Gateway.
- `LOG_LEVEL` env (`debug` | `info` | `warn` | `error`, default `info`).

## Outputs

### Structured Logs (pino, JSON lines to stdout)

Each HTTP access log entry:

```
{
  "level": 30,
  "time": 1714000000000,
  "requestId": "uuid-v4",
  "msg": "request completed",
  "req": { "method": "POST", "url": "/auth/login", "ip": "127.0.0.1" },
  "res": { "statusCode": 200 },
  "durationMs": 42
}
```

Fields that MUST be redacted in the log output: `req.headers.authorization`, `req.headers.cookie`, `req.body.password`.

### Prometheus Metrics (prom-client default registry + custom)

Minimum metric set:

- `http_requests_total{method,route,status}` — counter.
- `http_request_duration_seconds{method,route,status}` — histogram, buckets `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`.
- `nodejs_*` default metrics (GC, event loop, memory) — provided by `collectDefaultMetrics()`.

## Edge Cases

1. Route contains path params (`/users/:id`) → label uses the route pattern, not the concrete id (prevents cardinality blow-up).
2. Response status ≥ 500 → log level is `error`, not `info`.
3. Unhandled thrown error in a handler → logged with stack; response status `500`; metric recorded with status `500`.
4. `/metrics` itself is NOT instrumented (would recursively dirty its own output) — exempted in the middleware.

## Safety Constraints

- NEVER log secret values. Redaction list in `pino` config.
- NEVER record full URL with query string if the query could contain a token or email.
- Metric label cardinality MUST be bounded — do not emit per-userId or per-email labels.

## Verification Expectations

- Unit tests: `tests/unit/gateway/redaction.test.ts` (authorization and password fields redacted).
- Integration tests: assert `/metrics` exposes `http_requests_total` after traffic.
- Manual: `npm run dev:gateway` + curl + inspect stdout for JSON logs.

## Dependencies

- Directive 020 — gateway owns the middleware chain that implements this.
- Future: Sprint 14 ELK + OpenTelemetry.

## Grafana Dashboard

A skeleton dashboard is committed at `infra/grafana/autonomous-freight-gateway.json`. It is intentionally minimal in Sprint 2 (request rate, p95 latency, error rate) and expands per sprint.

## Change Log

- 2026-04-14 — Created in Sprint 2.
