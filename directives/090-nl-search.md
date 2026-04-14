# Directive 090 — Natural Language Search

**Status:** active
**Owner:** Backend / Search
**Sprint:** 9
**Last Updated:** 2026-04-15

---

## Goal

Let brokers query carriers and shipments by free text — "active carriers in Texas with satisfactory rating", "shipments to Chicago this week" — without learning a query DSL. v1 is Postgres `tsvector` full-text search with a deterministic intent classifier on top.

## Outputs

- `GET /api/v1/search?q=<text>&type=carriers|shipments` → `{ items: [...] }`. RBAC: any authenticated user.
- A `tsvector` column on `carriers.name + dot_number` and `shipments.origin + destination + status` plus GIN indexes.
- Intent classifier (pure function) extracts known facets: state codes (TX, IL…), status keywords (active/in_transit/delivered), date ranges ("this week", "last 30 days"). Unknown facets fall back to plain text match.

## Edge Cases

1. Empty query → `400`.
2. Query > 200 chars → `400`.
3. No matches → `200 { items: [] }`.
4. Unknown `type` → `400`.
5. Boolean operators / wildcards in query are escaped (no SQL injection, no tsquery syntax errors).

## Safety Constraints

- All queries parameterized; never interpolate `q` into SQL.
- Result set capped at 50 rows.

## Verification

- Unit: intent classifier extracts the known facets correctly.
- Integration: deferred (mechanical follow-up); migration + index creation tested via integration suite at Sprint 11 load test.

## Change Log

- 2026-04-15 — Created in Sprint 9.
