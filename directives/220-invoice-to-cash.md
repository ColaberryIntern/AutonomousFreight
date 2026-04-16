# Directive 220 — Invoice-to-Cash Lifecycle

**Status:** active
**Owner:** Backend / Financials + Agents
**Phase:** V-4
**Last Updated:** 2026-04-16

---

## Goal

Close the RFQ-to-cash loop per V5 §12. When a shipment reaches `doc_verified`, the system audits the rate, generates a customer invoice, and tracks it through acceptance → payment → settlement. Two new agents join the fleet: **Rate Audit Agent** and **Invoice Agent**.

## Financial state machine (V5 §12)

```
doc_verified → rate_audited → invoice_issued → paid → settled
                    ↓                ↓            ↓
                  (exception)     (disputed)   (short_pay → dispute)
```

## New agents

### Rate Audit Agent (#5)

On `doc_verified`:

1. Compare `carrier_bids.cost_usd` against the RFQ's `price_offered_usd` (the customer quote).
2. Compute margin = `price_offered_usd - cost_usd`. Margin % = `margin / price_offered_usd`.
3. If margin % ≥ 5% → `rate_audited` (pass). Audit `agent.rate_audit.passed`.
4. If margin % < 5% or negative → `rate_audit_exception`. Audit `agent.rate_audit.exception`.

### Invoice Agent (#6)

On `rate_audited`:

1. Generate an invoice row: `invoice_number`, `customer`, `amount_usd` (= RFQ price), `carrier_cost_usd`, `margin_usd`, `status = 'issued'`.
2. Shipment status → `invoiced`.
3. Emit `invoice.issued@1` event. Audit `agent.invoice.issued`.

## Schema

### `invoices` table

| Column           | Type                                                 |
| ---------------- | ---------------------------------------------------- |
| id               | UUID PK                                              |
| shipment_id      | UUID FK → shipments UNIQUE                           |
| invoice_number   | TEXT UNIQUE                                          |
| customer         | TEXT                                                 |
| amount_usd       | NUMERIC(10,2)                                        |
| carrier_cost_usd | NUMERIC(10,2)                                        |
| margin_usd       | NUMERIC(10,2)                                        |
| margin_pct       | NUMERIC(5,2)                                         |
| status           | TEXT (issued / accepted / paid / disputed / settled) |
| issued_at        | TIMESTAMPTZ                                          |
| paid_at          | TIMESTAMPTZ                                          |

### Shipment status additions

`rate_audited`, `rate_audit_exception`, `invoiced` added to CHECK.

## HTTP routes

| Route                            | Purpose                                               | RBAC            |
| -------------------------------- | ----------------------------------------------------- | --------------- |
| `GET /api/v1/invoices`           | List invoices with status filter                      | admin / auditor |
| `GET /api/v1/invoices/:id`       | Invoice detail with shipment + margin                 | admin / auditor |
| `POST /api/v1/invoices/:id/pay`  | Mark invoice paid                                     | admin           |
| `GET /api/v1/financials/summary` | Total revenue, cost, margin, invoice counts by status | admin / auditor |

## Edge Cases

1. Shipment with no linked RFQ (seeded directly) → use carrier bid cost as both quote and cost (margin = 0). Rate audit passes with warning.
2. Margin negative → rate_audit_exception; human must approve before invoice.
3. Invoice already exists for shipment → skip (idempotent).
4. Pay on non-issued invoice → `409`.

## Safety Constraints

- Invoice numbers are sequential (`AF-INV-NNNN`), generated from a Postgres SEQUENCE.
- Financial amounts are NUMERIC(10,2), never floating-point.
- Rate Audit Agent NEVER auto-generates an invoice on negative margin — HITL required.
- All financial decisions audited with actorUserId (agent = null actor, human = user id).

## Verification

- Unit: margin computation, invoice number generation.
- Integration: doc_verified → rate audit → invoice issued → pay → status transitions.
- Manual: Financials tab in cockpit shows real revenue/margin.

## Change Log

- 2026-04-16 — Created in V-4.
