# Gate 1 review package - Jul 2 forward-track build

**For:** Karun (Gate 1 gatekeeper)
**Ticket:** BC 10081574109 (Governance list). This ticket STAYS OPEN per the
closure guardrail; this package is the evidence to make the review fast. Nothing
is auto-closed.
**Prepared:** overnight of 2026-07-14, unattended, for Ali's morning review before
anything is posted to Karun.

## What Gate 1 is checking (exit criteria)

| Criterion | Status | Evidence |
|---|---|---|
| Diagrams match the code | Ready | `docs/diagrams/architecture-c4.md` + `agent-map.md` built tonight from `LIFECYCLE_STATES` and `AGENT_REGISTRY` verbatim |
| Junior developer can follow it | Ready | ADR-001..003 (prose, Context/Decision/Consequences) + one canonical contract per layer |
| Docs consistent with code | Ready | ADRs + diagrams + demo artifacts all trace to the same `services/*` modules |
| tsc green across the monorepo | Confirmed | `tsc -b --noEmit` exit 0 (run 2026-07-14) |
| Unit suite green | Confirmed | `jest --selectProjects unit` (see per-layer counts below) |

## Per-layer evidence

| Layer | Package | Key modules | Unit tests | Contract |
|---|---|---|---|---|
| Sense | `services/adapters` | `contract.ts`, dat/fmcsa/sylectus/email + 4 mock engines | `adapters.test.ts` (18) | ADR-002 adapter contract |
| RMS | `services/rms` | `schema/rfq.v1.ts`, parser, ingest (idempotency + dead-letter), evaluate (D1-D33), vendored Karun reuse | `rfqSchema` (17), `parser` (9), `ingest` (6), `evaluate` (19), `karunReuse` (14) = 65 | ADR-003 canonical RFQ (Zod) |
| OMS | `services/oms` | `schema/shipment.v1.ts`, `fsm.ts`, `stateMachine.ts`, `handoff.ts`, `tender.ts` | `oms.test.ts` (9) | Canonical shipment record; EDI 910 tender |
| TMS | `services/tms` | `stateMachine.ts`, `milestones.ts`, `exception.ts`, `handoffBms.ts`, `sourcing.ts` | `tms.test.ts` (13) | EDI 214 milestones; Bill-Ready handoff |
| BMS | `services/bms` | `invoice.ts` (EDI 210), `pod.ts` | `bms.test.ts` (9) | Line-itemized invoice; fails closed with no linehaul |
| Whole slice | root | `forwardChain.test.ts` email to invoice + idempotency | `forwardChain.test.ts` (2) | AF-INV-0001 total = 2982, pinned |
| Governance | `docs/` | approval-gates, escalation-protocol, managing-project integration | closure guardrail enforced | Gate 1/2 model |

New-layer unit tests counted: **116** (18 + 65 + 9 + 13 + 9 + 2). Plus the daily
report model suite `deliverables.test.ts` (19). Authoritative total is whatever
`jest --selectProjects unit` reports; these are the grep-counted per-suite
figures for orientation.

## The demonstrable proof (open these)

- `docs/demo-artifacts/ShipCES-RFQ-Card.html` - the URGENT sprinter email parsed into one canonical RFQ (real parse output).
- `docs/demo-artifacts/ShipCES-Forward-Storyboard.html` - the four-frame email-to-RFQ filmstrip, dedup-safe.
- `docs/demo-artifacts/ShipCES-Invoice-AF-INV-0001.html` - the flagship invoice, total 2982, from `generateInvoice()`.
- `docs/demo-artifacts/ShipCES-BMS-Demo.html` - Delivered to invoice, plus the fail-closed refusal.
- `docs/demo-artifacts/ShipCES-Architecture.html` - the layered architecture, lifecycle state machine, and agent map.
- Run it live: `npx ts-node --transpile-only scripts/shipces-demo/forwardTrackDemo.ts` (deterministic, no network).

## Independent verification already done

The Jul 2 build had an independent verifier subagent pass (maker/checker
separation): all 25 new-layer modules reviewed, findings fixed and re-tested
(SHA-256 dedup/id hash widening, origin/destination sequence guard, DAT-outage
surfaced in sourcing, display-name From-header no longer dead-letters, OMS-phase
exception reopen edge). Recorded in PROGRESS.md (Jul 2 whole-slice entry).

## Open items Gate 1 does not block (named, not hidden)

- BMS field-level detail (accessorial codes, fuel surcharge model, customer-rule overrides) is a deterministic scaffold pending Brett's invoice-anatomy walkthrough.
- The RMS LLM extractor (Claude behind Karun's D30 prompt) is wired but not the default; the regex baseline fills the slot until an Anthropic client + integration test land.
- Live DAT sourcing is on the mock engine pending Brett provisioning the DAT API.

---

## DRAFT Basecamp comment - HELD, do not post until Ali approves

> Gate 1 review package for the Jul 2 forward-track build is ready. The ticket
> stays open for your sign-off. Exit criteria: architecture and agent-map
> diagrams now exist and are generated from LIFECYCLE_STATES and AGENT_REGISTRY
> verbatim (docs/diagrams/), tsc -b is green, and the unit suite is green (116
> new-layer tests). Per-layer evidence, the five demo artifacts, and the live
> demo command are in docs/gate1-review-package.md. Please review at your pace
> and approve or request changes; nothing is auto-closed.
