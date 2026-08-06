# Architecture Decision Records

One decision per file. Durable record of the choices that shape the ShipCES
Autonomous Brokerage build, so the reasoning survives past the call it was made
on (BC Architecture: "Decisions that shape the system need durable records").

Status values: Proposed, Accepted, Superseded by ADR-NNN.

| ADR | Title | Status |
|---|---|---|
| [ADR-001](ADR-001-four-layer-architecture.md) | Four-layer RMS + OMS + TMS + BMS architecture, mapped onto the `services/*` monorepo | Accepted |
| [ADR-002](ADR-002-adapter-contract-pattern.md) | Engine-swappable adapter contract for the Sense Layer | Accepted |
| [ADR-003](ADR-003-canonical-rfq-contract.md) | Canonical RFQ payload as a Zod v1 contract | Accepted |

## Template

```
# ADR-NNN: <title>

- Status: Proposed | Accepted | Superseded by ADR-NNN
- Date: YYYY-MM-DD
- Deciders: <names>

## Context
What forces are at play, what constraints, what prompted the decision.

## Decision
The choice, stated plainly.

## Consequences
What becomes easier, what becomes harder, what we accept.

## Alternatives considered
What else we weighed and why we did not pick it.
```
