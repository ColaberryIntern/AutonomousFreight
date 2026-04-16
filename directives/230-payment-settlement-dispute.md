# Directive 230 — Payment Match + Settlement + Dispute

**Status:** active
**Owner:** Backend / Financials + Agents
**Phase:** V-5
**Last Updated:** 2026-04-16

---

## Goal

Complete V5 §12 invoice-to-cash: after an invoice is paid, verify the payment via three-way match, queue the carrier settlement, and handle disputes when the match fails. Three new agents (#7, #8, #9) close the financial loop.

## Financial state machine (continued from directive 220)

```
invoiced → paid → matched → settled → cash_realized
                     ↓
                  match_failed → dispute_open → dispute_resolved → settled
```

## New agents

### Payment Match Agent (#7)

On invoice status `paid`:

1. Three-way match: invoice amount vs carrier bid cost vs BOL document presence.
2. All three present + amounts consistent → invoice status `matched`. Audit `agent.payment.matched`.
3. Any discrepancy → invoice status `match_failed`. Create a `disputes` row. Audit `agent.payment.match_failed`.

Match rules:

- Invoice `amount_usd` must be > 0
- Carrier `carrier_cost_usd` must be > 0
- At least one `shipment_documents` row with `doc_type = 'bol'` must exist for the shipment
- If all present → `matched`

### Settlement Agent (#8)

On invoice status `matched`:

1. Create a `settlements` row: carrier_id, amount = `carrier_cost_usd`, status = `pending`.
2. Invoice status → `settled`. Shipment status → `settled` (new terminal status).
3. Audit `agent.settlement.created`.

### Dispute Agent (#9)

On invoice status `match_failed`:

1. Dispute row already exists (created by Payment Match Agent).
2. Auto-investigate: compare invoice amount vs carrier cost, check doc presence.
3. If discrepancy is < 5% of invoice amount → auto-resolve with credit adjustment. Dispute → `resolved`. Audit `agent.dispute.auto_resolved`.
4. If discrepancy ≥ 5% → dispute stays `open` for HITL. Audit `agent.dispute.needs_review`.

## Schema

### `settlements` table

| Column     | Type                             |
| ---------- | -------------------------------- |
| id         | UUID PK                          |
| invoice_id | UUID FK → invoices UNIQUE        |
| carrier_id | UUID FK → carriers               |
| amount_usd | NUMERIC(10,2)                    |
| status     | TEXT (pending / approved / paid) |
| created_at | TIMESTAMPTZ                      |

### `disputes` table

| Column          | Type                              |
| --------------- | --------------------------------- |
| id              | UUID PK                           |
| invoice_id      | UUID FK → invoices UNIQUE         |
| reason          | TEXT                              |
| discrepancy_usd | NUMERIC(10,2)                     |
| status          | TEXT (open / resolved / credited) |
| resolution      | TEXT                              |
| created_at      | TIMESTAMPTZ                       |
| resolved_at     | TIMESTAMPTZ                       |

### Shipment status additions

`settled` added to CHECK.

## HTTP routes

| Route                                                   | Purpose                | RBAC            |
| ------------------------------------------------------- | ---------------------- | --------------- |
| `GET /api/v1/settlements`                               | List settlements       | admin / auditor |
| `GET /api/v1/disputes`                                  | List disputes          | admin / auditor |
| `POST /api/v1/disputes/:id/resolve` body `{resolution}` | HITL resolve a dispute | admin           |

## Verification

- Integration: paid invoice → match → settlement created → shipment settled.
- Integration: paid invoice with missing doc → match_failed → dispute created → auto-resolve or HITL.

## Change Log

- 2026-04-16 — Created in V-5.
