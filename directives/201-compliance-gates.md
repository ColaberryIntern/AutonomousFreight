# Directive 201 — Compliance as Enforced Gates

**Status:** active
**Owner:** Backend / Compliance + Carrier
**Phase:** V-2
**Last Updated:** 2026-04-15

---

## Goal

Operationalize V5 Blueprint §17 — compliance is **infrastructure**, not a feature. Every state transition that risks regulatory exposure passes through a gate evaluator. Hard gates **block** the transition; soft gates **warn** and require HITL override with a reason. Every gate decision is audited.

This directive applies first to the carrier-assign transition (the one mutation in V-1). Future transitions (dispatch, in-transit, deliver) get the same treatment as they're added.

## Gate types

| Type     | Behavior                                                                                                            | UI affordance                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **HARD** | Transition rejected with `422` + findings. No way to bypass via API.                                                | Red banner; Approve button disabled.                  |
| **SOFT** | Transition requires `?override=true` query param + `reason` body field. Decision audited as `gate.soft_overridden`. | Yellow modal: "Override anyway?" with reason textbox. |
| **PASS** | Transition proceeds normally.                                                                                       | Green check next to carrier.                          |

## v1 gate rules (assignCarrier)

| Condition                       | Type | Reason code              |
| ------------------------------- | ---- | ------------------------ |
| Carrier marked `active = false` | HARD | `carrier_inactive`       |
| Compliance snapshot missing     | HARD | `no_compliance_snapshot` |
| `operating_status != 'active'`  | HARD | `carrier_not_operating`  |
| Insurance not on file           | HARD | `no_insurance`           |
| Risk score ≥ 0.6                | SOFT | `high_risk_score`        |
| Snapshot age > 90 days          | SOFT | `snapshot_stale`         |
| Safety rating = `conditional`   | SOFT | `safety_conditional`     |

The evaluator is a pure function: `evaluateAssignmentGates(carrier, snap) → { result, findings }`.

## HTTP changes

### Existing route — `POST /api/v1/shipments/:id/assign-carrier`

New behavior:

1. Run gate evaluator before the DB update.
2. On HARD: respond `422 { error: 'compliance_blocked', findings: [...] }`.
3. On SOFT without `override=true`: respond `422 { error: 'compliance_warn', findings: [...], requiresOverride: true }`.
4. On SOFT with `override=true`: require `reason` (≥10 chars) in body; audit as `gate.soft_overridden` with `reason` + `findings`; proceed.
5. On PASS: existing audit row + event still fire.

### New route — `GET /api/v1/shipments/:id/gates/:carrierId`

Preflight check that returns `{ result: 'pass'|'soft'|'hard', findings: [...] }` without mutating. RBAC: admin/broker. Used by the UI to pre-render the right button (Approve vs Override-required vs disabled).

## Audit actions added

- `gate.hard_blocked` — metadata: shipmentId, carrierId, findings
- `gate.soft_warned` — metadata: shipmentId, carrierId, findings (preflight-only; no mutation occurred)
- `gate.soft_overridden` — metadata: shipmentId, carrierId, findings, reason, actorUserId

## Edge Cases

1. Gate finding list empty + `result=pass` → no audit override row (only the regular `shipment.assigned`).
2. SOFT override with reason < 10 chars → `400 invalid_reason`.
3. Carrier doesn't exist → `400 no_such_bid` (existing behavior; never reaches gate evaluator).
4. Multiple findings (e.g. soft + hard) → result is whichever is more severe; UI shows all findings.
5. Race: gate passes preflight, then carrier compliance changes between preflight and assign → assign re-runs gate; final result wins.

## Safety Constraints

- Gate evaluator is pure (test oracle).
- Override reasons are immutable once written to audit_log (existing append-only constraint).
- Hard gates have NO bypass via the public API; only operator CLI / SQL with explicit owner consent (governance boundary).
- Future addition of soft → hard promotions (e.g. risk score 0.5 → 0.6) MUST trigger a directive bump.

## Verification

- Unit tests: `evaluateAssignmentGates` table-driven for every rule above.
- Integration tests: assign with hard-block returns 422; assign with soft warn returns 422 unless override; soft override with reason < 10 chars rejected; preflight matches actual.
- Existing 192 tests must remain green (regression).
- Manual: in cockpit Queue, attempt to approve carrier with expired insurance — Approve button shows red gate badge, click → modal, no mutation possible.

## Dependencies

- Directive 030 (carrier selection) — existing.
- Directive 070 (compliance risk score) — existing risk function feeds the SOFT-risk gate.
- Directive 060 (audit log) — gate decisions are audit rows.

## Change Log

- 2026-04-15 — Created in V-2.
