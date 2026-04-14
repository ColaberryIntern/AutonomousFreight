# Directive 200 — RFQ → Quote Pipeline + Quoting Agent

**Status:** active
**Owner:** Backend / Quoting + Frontend
**Phase:** V-2
**Last Updated:** 2026-04-15

---

## Goal

Build the upstream half of the V5 canonical lifecycle (Blueprint §2): an RFQ enters the system, the Quoting Agent prices it, the system sends a quote to the customer, and on a Won response the RFQ materializes into a `quoting`-state shipment ready for carrier ranking.

This is the first **agent** in the V5 sense (§5): a named actor that executes a deterministic routine path while emitting events with confidence and provenance, and surfacing edge cases to humans.

## State machine (per V5 §4)

```
received → parsed → priced → sent → won
                              ↓
                              lost
                              ↓
                          (terminal)

priced → exception → sent (after HITL override)
                  ↓
                  lost (after HITL kill)
```

## Outputs

### Schema (`rfqs` table)

| Column                 | Type          | Notes                                                        |
| ---------------------- | ------------- | ------------------------------------------------------------ |
| id                     | UUID          | PK                                                           |
| customer               | TEXT          | free-text in v1; SOP table comes later                       |
| origin                 | TEXT          |                                                              |
| destination            | TEXT          |                                                              |
| distance_miles         | INTEGER       |                                                              |
| equipment_type         | TEXT          | dry_van / reefer / flatbed                                   |
| pickup_date            | DATE          |                                                              |
| status                 | TEXT          | `received`/`parsed`/`priced`/`sent`/`won`/`lost`/`exception` |
| price_offered_usd      | NUMERIC(10,2) | populated at `priced`                                        |
| confidence             | NUMERIC(3,2)  | 0..1, populated at `priced`                                  |
| reason                 | TEXT          | populated for exception/lost                                 |
| created_at, updated_at | TIMESTAMPTZ   |                                                              |

### Pricing function (pure, deterministic v1)

`price = base_per_mile[equipment] * distance + accessorial`
where `base_per_mile = { dry_van: 2.10, reefer: 2.85, flatbed: 2.55 }`. Confidence `= 1 - |distance - 800| / 2000` clamped to `[0.5, 0.99]` (peaks for typical-distance loads, drops for outliers).

When confidence ≥ 0.85 → auto-`sent`. Below → `exception` (HITL).

### HTTP routes

| Route                                                           | Purpose                                             | RBAC           |
| --------------------------------------------------------------- | --------------------------------------------------- | -------------- |
| `POST /api/v1/rfqs`                                             | Submit a new RFQ                                    | admin / broker |
| `GET /api/v1/rfqs`                                              | List with status filter + pagination                | authenticated  |
| `GET /api/v1/rfqs/:id`                                          | Detail                                              | authenticated  |
| `POST /api/v1/rfqs/:id/respond` body `{outcome:'won'\|'lost'}`  | Customer response. On `won` materializes a shipment | admin / broker |
| `POST /api/v1/rfqs/:id/run-agent`                               | Manually trigger Quoting Agent on this RFQ          | admin / broker |
| `POST /api/v1/rfqs/:id/override` body `{action:'send'\|'kill'}` | Resolve an `exception`                              | admin / broker |

### Quoting Agent

In-process loop that runs every 5 seconds (configurable):

1. Pull all RFQs in `received` state, transition → `parsed` (no-op for v1).
2. Pull all `parsed` RFQs, run pricing, set `price_offered_usd` + `confidence` + status (`priced`).
3. Pull all `priced` RFQs, if confidence ≥ 0.85 → `sent`; else → `exception`.
4. Emit `rfq.priced@1` and `rfq.sent@1` / `rfq.exception@1` events.
5. Audit row per transition: `rfq.parsed`, `rfq.priced`, `rfq.sent`, `rfq.exception`.

### Customer response

Manual today (UI button); a tiny "customer simulator" (toggleable) randomly resolves `sent` quotes to `won`/`lost` after 3-10s for demo realism. Off in tests.

## Won → shipment materialization

When a customer responds `won`:

1. Insert into `shipments` table with status `quoting`, copy origin/destination/distance.
2. Audit `rfq.won` + `shipment.created_from_rfq`.
3. Emit `rfq.won@1` event.
4. The new shipment now flows through the V-1 cockpit (Queue → Approve → assigned).

## Edge Cases

1. RFQ with distance ≤ 0 or > 5000 → `400 invalid_distance`.
2. Unknown equipment_type → `400 invalid_equipment`.
3. Run-agent on already-priced RFQ → `409 already_priced`.
4. Respond on RFQ not in `sent` state → `409 not_responsive`.
5. Override on RFQ not in `exception` state → `409 not_overridable`.
6. Respond `won` when shipment for this RFQ already exists → `409 duplicate` (idempotency).

## Safety Constraints

- Quoting Agent is fire-and-forget per-RFQ; one bad RFQ never blocks others (try/catch around each).
- Loop has a hard upper bound of 100 RFQs processed per tick.
- Pricing function is pure and deterministic; same input → same price + confidence.
- Customer simulator MUST be off in `NODE_ENV=test`.

## Verification

- Unit: pricing function table-driven cases.
- Integration: full RFQ lifecycle (POST → agent → response → shipment materialized).
- Manual: Quotes tab in cockpit shows live RFQ progression.

## Change Log

- 2026-04-15 — Created in V-2.
