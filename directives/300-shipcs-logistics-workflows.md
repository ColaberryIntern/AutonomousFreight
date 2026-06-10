# Directive 300 — ShipCS Logistics Workflows

**Status:** active
**Owner:** Ali Muwwakkil (Phase B lead) · Jen Theisen (operational rule set source) · Mike Said (margin and carrier policy)
**Project:** ShipCS Logistics (new division alongside CES Expedite)
**Last Updated:** 2026-05-22

---

## Goal

Capture the 7 end-to-end workflows that govern the ShipCS Logistics headless brokerage build, as derived from the May 21 kickoff call with Mike Said (ShipCES Founder), Brett Berry (Director of Continuous Improvement), Jen Theisen (Operations, ex-CH Robinson), Karun Swaroop (Colaberry AI Technical Director), and Ali Muwwakkil. This directive is the canonical spec the build references. Each workflow is owned by one or more named agents; agents are deterministic processes (pure code, no LLM in the decision loop).

Companion artifacts:
- HTML walkthrough deck (v2): `c:/Users/ali_m/Downloads/shipces-walkthrough-v2.html`
- HTML workflows deck (Mermaid): `c:/Users/ali_m/Downloads/shipcs-workflows.html`
- Basecamp project: https://3.basecamp.com/3945211/projects/47126345
- Workflows deck on Basecamp: https://3.basecamp.com/3945211/buckets/47126345/messages/9920426706
- Call recap message: https://3.basecamp.com/3945211/buckets/47126345/messages/9917688191

---

## Inputs

### From ShipCES (gating)
- DAT sandbox + production credentials — Mike
- Truckstop credentials (if held) — Mike
- Margin floor as % per lane/customer/urgency — Mike
- Carrier scoring weights (cost vs rating vs lane vs relationship) — Mike + Jen
- Continental rate confirmation template (PDF/Word) — Mike
- Carrier bank seed data: 20-25 core + 45 secondary carriers with lanes and pre-negotiated rates — Mike
- Customer-change matrix rules (the full rule set in Jen's head) — Jen, via 3 deep-dive sessions
- Call recordings (training corpus) — Cameron Crown via SharePoint (currently blocked on access)
- ELD vendor selection (Samsara / Motive / KeepTruckin / other) — Mike
- Walmart and large-shipper appointment credentials — Mike (if Continental has)
- Sample carrier invoices + PODs (30-50 pairs) — Continental ops
- TransCredit account — Mike
- Pilot customer profile (for week 6-8) — Mike

### From inside the build
- Shipment data model with mode flag (expedite vs standard)
- `carrier_bank` table (new)
- `carrier_performance_metrics` table (new)
- `customer_change_rules` table (new)
- `shipment_appointments` table (Phase C, new)
- Audit log (existing pattern)

---

## Outputs

### Per workflow (full enumeration in the deck)

| # | Workflow | Primary output | Status changes | Audit events |
|---|---|---|---|---|
| 1 | Quote → Award | `shipments` row with mode flag | RFQ: received → parsed → priced → sent → won/lost/exception | `rfq.*` |
| 2 | Sourcing | Carrier locked, signed rate-con | Shipment: awarded → sourcing → dispatched | `sourcing.*` |
| 3 | Execution | POD captured | Shipment: dispatched → in_transit → delivered | `tracking.*` |
| 4 | Billing | Carrier paid + customer invoice sent | Invoice: issued → matched → paid or disputed | `billing.*` |
| 5 | Change Matrix | Auto-update / alert / block decision | Shipment fields updated or paused | `change.*` |
| 6 | Appointment | Confirmed appointment + carrier notified | Shipment has appointment_id | `appointment.*` |
| 7 | Onboarding | Carrier at correct tier in bank | Carrier tier promoted/demoted | `carrier.*` |

### Agents driving the workflows (17 total)

| Agent | Workflow | Status |
|---|---|---|
| Quoting Agent | 1 | Phase A in flight (Ram) |
| Sourcing Agent | 2 | Phase B build (Ali) |
| Negotiation Engine | 2 sub | Phase B build (Ali, pure code, no LLM) |
| Rate Confirmation Agent | 2 | Phase B build (Ali) |
| Tracking Agent | 3 | Phase C lead-time |
| Exception Manager Agent | 3 | Phase C lead-time |
| Customer Notification Agent | 3 | Phase C lead-time |
| Document OCR Agent | 4 | Phase C lead-time |
| Payment Match Agent | 4 | Phase C lead-time |
| Dispute Agent | 4 sub | Phase C lead-time |
| Settlement Agent | 4 | Phase C lead-time |
| Invoice Agent | 4 | Phase C lead-time |
| Change Evaluation Agent | 5 | Phase B build (new from May 21) |
| Appointment Agent | 6 | Phase C lead-time |
| Compliance Agent | 7 | Phase B build |
| Performance Scorer Agent | 7 | Phase B build (new from May 21) |
| Tier Manager Agent | 7 | Phase B build (new from May 21) |
| Health Monitor Agent | cross | Pattern exists |
| Audit Logger | cross | Pattern exists |

---

## Edge Cases

Each edge case below MUST have a corresponding test in `/tests/`. Test names should mirror the case ID.

### W1 — Quote → Award

1. Parser cannot extract required fields → RFQ status = `exception`, broker review queue.
2. Pricing engine returns null for unknown lane → RFQ status = `exception`, broker manual quote.
3. Customer counter-offers with new terms → broker handles, system tracks revision history.
4. Customer unresponsive after N days → RFQ status = `stale`, no automated retries.

### W2 — Sourcing

5. No carrier responds to DAT post within X hours → escalate to broker, mark for re-pricing.
6. All Tier 1 and Tier 2 carriers over capacity → skip directly to DAT post.
7. Carrier fails validation (truck/transit/credentials) → notification to carrier with reason, no offer.
8. Counter offer rejected by carrier → move to next carrier in queue.
9. Negotiation deadlock (no convergence after N counter rounds) → broker takes over.
10. Carrier signs rate-con but goes silent before pickup → urgent re-source.

### W3 — Execution

11. Carrier truck breaks down mid-route → escalate, find rescue carrier (re-source).
12. Carrier no-shows at pickup → release, urgent re-source, customer notification.
13. Customer changes load mid-transit → invoke W5 change matrix.
14. Weather delays → customer notification with new ETA.
15. Carrier HOS violation imminent → relay/swap planning, may require new carrier.
16. POD missing or incomplete → blocks W4 billing.

### W4 — Billing

17. POD missing → block billing, chase carrier via notification.
18. POD shows damage or shortage → claim workflow (out of scope v1).
19. Carrier overcharges → dispute auto-created, broker review or auto-resolve.
20. ELD record missing for detention claim → manual broker review (cannot auto-validate).
21. Customer disputes invoice → AR follow-up (out of scope v1).

### W5 — Change Matrix

22. Conflicting changes from customer (two updates same load) → conflict resolution, second supersedes first only if compatible.
23. Carrier already in transit when change arrives → broker call to driver, may not be auto-propagatable.
24. Customer revokes a change after carrier already notified → reverse update, apology notification to carrier.

### W6 — Appointment

25. No appointment slots in customer's window → renegotiate with customer.
26. Carrier misses appointment → reschedule + truck-turned-away handling.
27. Shipper changes appointment policy mid-shipment → re-validate.

### W7 — Onboarding

28. Carrier loses insurance mid-engagement → hard block on assignment, alert.
29. Carrier safety rating downgrades → soft alert, optional broker review.
30. Performance regression sustained → automatic tier demote with audit reason.
31. Carrier requests Tier 1 status without earning it → declined with explanation.

---

## Safety Constraints

What must NEVER happen, regardless of any other rule:

1. **Margin floor breach.** The Negotiation Engine MUST never accept a carrier offer below `our_carrier_cost × (1 + min_margin_pct)`. Hard ceiling, no overrides, no exceptions. Logged to audit if attempted.
2. **No LLM in negotiation decision loop.** Negotiation Engine MUST be pure deterministic code. LLMs may assist with carrier-side natural language interpretation (e.g., parsing email replies) but never with the accept/counter/reject decision itself.
3. **Compliance gates are hard.** A carrier with hard-fail compliance (no insurance, suspended authority, unsatisfactory safety rating) MUST never receive a load assignment.
4. **No carrier double-booking.** A carrier MUST never be assigned two loads with overlapping pickup windows on the same truck.
5. **No silent failures.** Every agent decision MUST be logged to audit_log with rationale. Try/catch that swallows errors without logging is a defect.
6. **Detention auto-approval only with ELD evidence.** Detention claims without ELD records MUST be routed to broker review, never auto-approved.
7. **Tier promotion thresholds are enforced.** Tier Manager MUST not promote a carrier to Tier 1 without sustained Tier 2 metrics AND human approval.
8. **Rate-con must be signed before dispatch.** Shipment status MUST NOT move to "dispatched" until the carrier has signed the rate confirmation.
9. **No customer-change auto-propagation post-booking for material changes.** Block category in W5 matrix MUST always involve human renegotiation, never auto-propagate.
10. **Audit log is append-only.** No agent may modify or delete past audit entries.

---

## Verification Expectations

### Unit tests
- Negotiation Engine: every counter-offer branch covered, including edge cases (zero margin, missing rating, expired offer). Path: `/tests/unit/sourcing/negotiate.test.ts`. Target: >90% statement coverage.
- Change Evaluation Agent: every matrix cell exercised. Path: `/tests/unit/change/evaluateChange.test.ts`.
- Compliance Agent: hard/soft gate decisions across all carrier states. Path: `/tests/unit/onboarding/compliance.test.ts`.
- Performance Scorer: metric computation against golden shipment-history fixtures. Path: `/tests/unit/onboarding/scoring.test.ts`.
- Tier Manager: promotion/demotion threshold logic. Path: `/tests/unit/onboarding/tier.test.ts`.

### Integration tests
- W2 end-to-end (mock DAT): award → carrier bank lookup → DAT post → inquiry → negotiation → rate-con sent. Path: `/tests/integration/sourcing/end-to-end.test.ts`.
- W5 end-to-end: customer change → matrix lookup → auto/alert/block outcome. Path: `/tests/integration/change/end-to-end.test.ts`.
- W7 end-to-end: new carrier → compliance → tier 3 → metrics accumulate → tier 2 promotion. Path: `/tests/integration/onboarding/end-to-end.test.ts`.

### E2E tests (Playwright)
- Portal-based negotiation UI: carrier sees offer, accepts, rate-con generated, e-sign captured. Path: `/tests/systemV2/portal-negotiation.spec.ts`.
- Shipment lifecycle: quote → award → sourcing → dispatch → tracking → delivery → billing. Path: `/tests/systemV2/shipment-lifecycle.spec.ts`.

### Manual verification steps
- Mike validates margin floor enforcement against 10 historical loads (5 should accept, 5 should reject per the floor).
- Jen validates customer-change matrix outputs against 20 real change events from her CH Robinson experience.
- Brett validates portal-based negotiation flow against the JB Hunt pattern.
- Carrier bank tier promotions reviewed in weekly Friday sync.

---

## Dependencies

### Upstream directives this relies on
- Directive 010 — User registration (broker accounts)
- Directive 011 — RBAC (broker, admin, auditor roles)
- Directive 021 — Observability (audit log, structured logging)
- Directive 030 — Carrier selection (existing scoring, supersedes for ShipCS Logistics)
- Directive 040 — Event bus (cross-agent communication)
- Directive 060 — MFA + audit (security baseline)
- Directive 070 — Compliance (hard/soft gates pattern)

### External systems
- DAT API (load board, primary commodity carrier marketplace)
- Truckstop API (secondary marketplace)
- JB Hunt portal pattern (reference architecture for portal-based negotiation)
- ELD vendor (Samsara / Motive / KeepTruckin, TBD)
- Walmart appointment API + other large-shipper APIs
- TransCredit (industry credit rating)
- DocuSign or HelloSign (rate-con e-signatures)
- Mandrill (Colaberry email infrastructure, existing)
- FMCSA API (carrier safety ratings)
- SharePoint (Continental, call recording corpus, currently access-blocked)
- Continental's existing TMS (read access TBD, possibly Selectus)
- Basecamp (project management, existing)

### Internal services
- All existing Autonomous Freight backend services
- New: `services/sourcing/` (W2 agents)
- New: `services/change/` (W5 agent)
- New: `services/onboarding/` (W7 agents)
- New: `services/appointments/` (W6 agent, Phase C)
- Extended: `services/notifications/` (W3 customer notification)

---

## Change Log

- 2026-05-22 — Created. Captures the full workflow + agent set as derived from the May 21 kickoff call with Mike, Brett, Jen, Karun, Ali. Supersedes the implicit assumptions in v1 of the walkthrough deck (which framed sourcing as "most labor-intensive" rather than "hardest to automate" and did not include the Carrier Bank or Customer-Change Matrix as first-class concepts).
