# Directive 190 — Supervisor Cockpit (Phase V-1)

**Status:** active
**Owner:** Platform / Frontend + Backend
**Phase:** V-1 (Visuals)
**Last Updated:** 2026-04-15

---

## Goal

Ship the first visual expression of the V5 Blueprint §7 **Supervisor UX**: an exception-resolution operating surface where a broker sees what needs attention, understands why the system is recommending what it is, and can approve / override with one click.

## Outputs

- **7 new HTTP routes** (6 GET + 1 POST mutation) behind the existing RBAC.
- **10 React components** forming the cockpit shell — sidebar nav, OpsHome, Queue, Shipments, Carriers, Compliance, Audit, Admin, Autonomy console, shared Drawer.
- **Mutation with audit trail**: `POST /api/v1/shipments/:id/assign-carrier` transitions a `quoting` shipment to `assigned`, records `shipment.assigned` in `audit_log`, emits `shipment.carrier_selected@1` on the event bus.
- **No new external deps server-side**; frontend adds `recharts` only.

## UX Principles (from Blueprint §7)

1. **Queue-first** — the supervisor's landing view is things needing decision, not a generic dashboard.
2. **Every item carries its evidence** — AI action, confidence, recommended next move, source data all visible inline. No tab-switching to reconstruct context.
3. **One-click default path** — Approve / Override / Escalate as the dominant interactions. The "hard case" gets a drawer with the full state machine.
4. **Risk over recency** — queue ordering reflects business risk (high-margin shipments, expiring compliance) not arrival time.
5. **Deterministic math visible** — the carrier score, the compliance risk score, and the audit log are all traceable back to their exact inputs. No black boxes.

## Scope (V-1 only)

| Surface    | V-1 behavior                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| OpsHome    | 4 stat cards + risk donut + recent audit feed                                                                |
| Queue      | Live list of `quoting` shipments; each row = top-ranked carrier + score + Approve; row disappears on success |
| Shipments  | Existing list + drill-down drawer with full bid table                                                        |
| Carriers   | Existing list + drill-down drawer with full compliance snapshot                                              |
| Compliance | Risk donut + expiring-artifacts table                                                                        |
| Audit      | Paginated log with action filter                                                                             |
| Admin      | Read-only user list (email, roles, mfa_enabled)                                                              |
| Autonomy   | Static explainer: L1→L4 cards, clearly labeled "graduation state persists in V-2"                            |

## Explicitly deferred to V-2 / V-3

- Persistent HITL exception queue (new domain)
- Autonomy graduation state (per-operation A/B logic)
- Role mutation from admin UI (governance boundary)
- Financial dashboards (no invoice backend)
- Invoice-to-cash views (V-3 new service)
- Carrier past-loads history (V-2 once assign data accumulates)
- Real-time push (polling is sufficient for pilot)

## Edge Cases

1. Assigning a carrier that has no bid on the shipment → `400 no_such_bid`.
2. Assigning to a shipment not in `quoting` → `409 shipment_not_quotable`.
3. Concurrent assign races → first-writer-wins at the DB level (`UPDATE ... WHERE status = 'quoting'` returning 0 rows triggers 409).
4. Event publish fails → assign still succeeds; failure logged; do not block the caller.
5. Audit write fails → assign still succeeds; failure logged (consistent with directive 060 pattern).
6. Admin list with no users → `200 { items: [] }`.
7. Audit feed with `action` filter that matches nothing → `200 { items: [] }`.
8. Overview counts when a table is empty → returns zeros, not an error.

## Safety Constraints

- Assign endpoint requires `admin` or `broker` role (not auditor — read-only).
- Audit + admin endpoints require `admin` only.
- Scoring weights endpoint is authenticated-only (no secret info, but no reason to leak to anon).
- Every state transition emits an audit row with `actorUserId` populated.
- Cockpit defers any mutation that would require CLAUDE.md governance approval (role changes, SMTP reconfig, etc.).

## Verification

- Unit tests: `listUsers`, `getSummary`, `listPage`, `assignCarrier` state transition + event emission.
- Integration tests: 7 specs (one per route), using a captured event bus to assert the `shipment.carrier_selected` event fires on approve.
- E2E smoke: extended `tests/e2e/smoke.test.ts` exercises register → login → overview → approve → audit visible.
- Existing 181 tests must remain green (regression gate).
- Manual: log in at http://95.216.199.47:8889 → approve a quoting shipment → see it move to assigned → see the audit entry.

## Dependencies

- Directives 010 (auth), 011 (RBAC), 030 (carrier scoring), 040 (event bus), 060 (audit), 070 (compliance).
- `recharts` on the frontend.

## Change Log

- 2026-04-15 — Created in Phase V-1.
