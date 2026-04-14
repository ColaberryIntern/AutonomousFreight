# Directive 140 — OpenTelemetry + ELK

**Status:** active
**Owner:** Platform / Observability
**Sprint:** 14
**Last Updated:** 2026-04-15

---

## Goal

Wire OpenTelemetry SDK into the gateway so spans flow to an OTLP collector (Jaeger / Tempo / Datadog Agent — collector choice deferred). Add ELK to docker-compose for local log aggregation. Production OTel collector + ELK provisioning is part of the Sprint 13 deferred apply.

## Outputs

- `services/platform/src/tracing/initOtel.ts` — single function `initOtel(serviceName)` that starts the SDK if `OTEL_EXPORTER_OTLP_ENDPOINT` is set; no-op otherwise.
- `docker-compose.yml` extended with Jaeger all-in-one (UI on :16686, OTLP HTTP receiver on :4318) and Filebeat → Elasticsearch + Kibana.
- Gateway `index.ts` calls `initOtel('gateway')` at startup.
- Pino logs already JSON; Filebeat config tails container logs and ships to ES.

## Edge Cases

1. `OTEL_EXPORTER_OTLP_ENDPOINT` unset → SDK does nothing; no-op (CI default).
2. Collector unreachable → spans buffer up to a fixed memory ceiling, then drop oldest.
3. ELK volume corrupted in dev → documented `docker compose down -v` recovery in README.

## Safety Constraints

- NEVER export raw PII in span attributes — service name + http.route + status only.
- Sampling: head-based 10% in prod (configured by env `OTEL_TRACES_SAMPLER_ARG=0.1`).

## Verification

- Unit: initOtel returns a stop function and does nothing when env unset.
- Manual: `docker compose up jaeger`, hit gateway, see traces in Jaeger UI.

## Change Log

- 2026-04-15 — Created in Sprint 14.
