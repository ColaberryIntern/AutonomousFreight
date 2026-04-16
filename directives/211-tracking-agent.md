# Directive 211 — Tracking Agent

**Status:** active
**Owner:** Backend / Agents
**Phase:** V-3
**Last Updated:** 2026-04-16

---

## Goal

Third named agent (V5 §5). Simulates shipment milestones for `assigned` shipments. In production this would consume GPS/ELD/carrier-API events; in v1 it generates synthetic milestones on a timer to prove the lifecycle and the cockpit timeline.

## Milestones

| Milestone                 | Trigger               | Shipment status after     |
| ------------------------- | --------------------- | ------------------------- |
| `carrier_confirmed`       | 30s after assignment  | `assigned` (unchanged)    |
| `picked_up`               | 60s after assignment  | `dispatched` (new status) |
| `in_transit`              | 90s after assignment  | `in_transit`              |
| `approaching_destination` | 120s after assignment | `in_transit` (unchanged)  |
| `delivered`               | 150s after assignment | `delivered`               |

## Schema

New `shipment_milestones` table:

| Column      | Type                      |
| ----------- | ------------------------- |
| id          | BIGSERIAL PK              |
| shipment_id | UUID FK → shipments       |
| milestone   | TEXT                      |
| occurred_at | TIMESTAMPTZ DEFAULT NOW() |
| metadata    | JSONB DEFAULT '{}'        |

## Behavior

Every 5s tick:

1. Find shipments in `assigned` / `dispatched` / `in_transit` that have fewer milestones than expected for their elapsed time since assignment.
2. Insert the next milestone row.
3. Update shipment status if milestone warrants it.
4. Emit `shipment.milestone@1` event + audit row.

## Edge Cases

1. Shipment assigned but clock not yet at first milestone → skip.
2. Shipment already has all 5 milestones → skip (idempotent).
3. Milestone insertion race → `ON CONFLICT DO NOTHING` on `(shipment_id, milestone)`.

## Safety Constraints

- Simulation only runs when `FEATURE_TRACKING_SIM=true` env (off in tests by default).
- Never transitions backward (delivered → in_transit).
- Production integration (GPS/ELD) replaces this loop in a future sprint; directive bump required.

## Verification

- Unit: milestone sequencing logic.
- Integration: seed assigned shipment → run ticks → milestones appear → status progresses to `delivered`.

## Change Log

- 2026-04-16 — Created in V-3.
