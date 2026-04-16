# Directive 210 — Procurement Agent

**Status:** active
**Owner:** Backend / Agents
**Phase:** V-3
**Last Updated:** 2026-04-16

---

## Goal

Second named agent (V5 §5). When a shipment enters `quoting` status (either from an RFQ won or seeded directly), the Procurement Agent automatically ranks available carriers, proposes the top pick, and — if confidence is high enough — auto-assigns subject to compliance gates.

## Behavior

Every 5s tick:

1. Find shipments in `quoting` that have ≥ 1 active bid.
2. Run `rankCarriers()` (directive 030) on each.
3. Run `evaluateAssignmentGates()` (directive 201) on the top carrier.
4. If gate = `pass` AND score ≥ 0.7 → auto-assign (same path as manual Approve). Emit `agent.procurement.auto_assigned` audit.
5. If gate = `soft` OR score < 0.7 → emit `agent.procurement.needs_review` audit. Shipment stays in queue for human.
6. If gate = `hard` → skip; emit `agent.procurement.blocked` audit.
7. Shipments with 0 bids → skip silently (no bids to rank).

## Edge Cases

1. Shipment has bids but all carriers fail hard gate → all blocked; shipment stays in queue.
2. Multiple shipments in one tick → process independently (one bad shipment never blocks another).
3. Agent races with human approve → first-writer-wins (existing `UPDATE WHERE status='quoting'`).

## Safety Constraints

- Auto-assign only when gate = `pass` AND score ≥ 0.7 — conservative default.
- Auto-assign threshold is a constant `PROCUREMENT_AUTO_THRESHOLD` in code; tuneable per directive bump.
- Agent NEVER overrides a hard gate.

## Verification

- Unit: mock tick with mixed gate/score scenarios.
- Integration: seed shipment + bid + compliance → agent tick → shipment becomes `assigned`.

## Change Log

- 2026-04-16 — Created in V-3.
