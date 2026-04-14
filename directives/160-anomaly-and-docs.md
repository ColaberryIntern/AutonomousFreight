# Directive 160 — Invoice Anomaly Detection + Document Validation

**Status:** active
**Owner:** Backend / AI
**Sprint:** 16
**Last Updated:** 2026-04-15

---

## Goal

Two related capabilities:

1. **Anomaly detection** on invoices — flag invoices whose `(amount, line_count)` profile is statistically unusual versus the carrier's history. v1 uses a simplified Isolation-Forest-style depth score (no scikit-learn dependency).
2. **Document validation** — extract structured fields (BOL number, date, freight class) from broker-uploaded text. v1 uses deterministic regex parsers; BERT path skeletoned for Sprint 17+.

## Outputs

- `services/ai/src/domain/anomaly.ts` — `scoreAnomaly(point, points)` returns `[0, 1]`; higher = more anomalous.
- `services/ai/src/domain/docExtract.ts` — `extractBolFields(text)` returns `{ bolNumber, date, freightClass }` (any may be `null`).
- Both are pure functions (determinism oracles).

## Edge Cases

1. Empty `points` history → returns 0.5 (no signal).
2. Single-point history → returns 0 (matches by definition).
3. Document missing all known fields → returns object of nulls; not an error.
4. BOL number patterns vary by carrier — regex covers `BOL-12345` and `BOL: 12345` and `B/L 12345`.

## Safety Constraints

- Anomaly score is advisory only — never auto-rejects an invoice. Human review required.
- Document parser MUST NOT execute any extracted content; treats input as inert text.

## Verification

- Unit: anomaly scoring on synthetic outliers, doc-extract patterns.

## Change Log

- 2026-04-15 — Created in Sprint 16.
