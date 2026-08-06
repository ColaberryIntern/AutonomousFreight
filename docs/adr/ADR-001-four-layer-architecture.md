# ADR-001: Four-layer RMS + OMS + TMS + BMS architecture, mapped onto the `services/*` monorepo

- Status: Accepted
- Date: 2026-07-02
- Deciders: Ali, Karun (Gate 1 review pending), Brett (advisory, Jun 18 framing)

## Context

Brett's Jun 18 framing decomposed the headless brokerage into four management
layers plus a sense layer:

- RMS (Request Management System): email + RFQ intake.
- OMS (Order Management System): order staging + tender. EDI 910 hands to TMS.
- TMS (Transportation Management System): sourcing through delivered. EDI 214
  milestones. Delivered triggers BMS.
- BMS (Billing Management System): POD to invoice (EDI 210) to accounting.
- Sense Layer: engine-swappable vendor adapters (DAT, FMCSA, Sylectus, Email).

The Basecamp build tickets specify paths under `/backend/src/...`. This repo,
however, is an npm-workspaces monorepo with code under `services/<name>/src`
(`@af/rfq`, `@af/carrier`, and so on) and a large existing Phase V codebase
(RFQ pipeline, quoting/procurement/invoice agents, 250+ tests). Building a
literal `/backend` tree would create an orphan not wired into the workspace,
the root tsconfig, or the jest projects, and would drift from the existing code.

A decision was required on two coupled questions: (1) where the new layers live,
and (2) how they relate to the existing Phase V code.

## Decision

1. Realize the four layers plus the sense layer as five new workspace packages
   following the existing convention, not a new `/backend` tree:
   - `services/rms`, `services/oms`, `services/tms`, `services/bms`,
     `services/adapters` (each `@af/<name>` with a tsconfig extending
     `tsconfig.base.json`). The Basecamp `/backend/src/...` paths map to
     `services/<layer>/src/...`.
2. Build the new layers as a clean, contract-first forward implementation. The
   canonical RFQ payload (ADR-003) and the adapter contract (ADR-002) are the
   seams. The existing Phase V services are treated as a working prototype: we
   harvest proven domain logic (pricing, three-way match, invoice numbering)
   into the new layers behind the new contracts as those tickets come up, rather
   than importing the prototype wholesale or running two parallel lifecycles.

## Consequences

- New code is wired into the workspace, the root tsconfig `include`, and jest
  automatically (no build-graph orphan).
- One shipment record (`services/oms/src/schema/shipment.v1.ts`) is the single
  source of truth across OMS, TMS, and BMS; each layer owns transitions within
  its own state subset, with explicit handoff edges (TENDERED to SOURCING,
  DELIVERED to BILL_READY).
- EDI alignment is designed in from the start (910 tender, 214 milestones, 210
  invoice) so real EDI integration is a thin adapter, not a redesign.
- We accept a period where Phase V and the new layers coexist. Harvest is
  incremental and ticket-driven; this ADR is the record that it is intentional,
  not accidental duplication.

## Alternatives considered

- Literal `/backend/src` tree as written in the tickets: rejected, would be an
  orphan outside the workspace/build/test graph and drift from `services/*`.
- Refactor the existing Phase V services in place into RMS/OMS/TMS/BMS: rejected
  for now, higher blast radius than a clean contract-first build; revisit once
  the new layers are demo-proven.
