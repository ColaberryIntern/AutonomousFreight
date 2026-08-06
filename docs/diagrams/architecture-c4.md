# ShipCES Autonomous Brokerage - architecture

Traced to [ADR-001](../adr/ADR-001-four-layer-architecture.md) and the canonical
lifecycle in `services/oms/src/schema/shipment.v1.ts` (`LIFECYCLE_STATES`). The
principle is "own the brain, rent the senses": the four domain layers hold the
logic; the Sense Layer adapters are engine-swappable senses.

## Layered view (own the brain, rent the senses)

```mermaid
flowchart LR
  EMAIL_IN([Broker RFQ email]):::ext
  CUST([Customer]):::ext

  subgraph BRAIN[Own the brain: four domain layers]
    direction LR
    RMS["RMS<br/>Email + RFQ intake"]:::rms
    OMS["OMS<br/>Order staging + tender"]:::oms
    TMS["TMS<br/>Transportation lifecycle"]:::tms
    BMS["BMS<br/>Billing + invoice"]:::bms
  end

  subgraph SENSE[Rent the senses: engine-swappable adapters]
    direction LR
    DAT["DAT<br/>capacity + rates"]:::sense
    FMCSA["FMCSA<br/>authority + insurance"]:::sense
    SYL["Sylectus<br/>post only"]:::sense
    EMAILA["Email<br/>RFQ intake"]:::sense
  end

  EMAIL_IN --> EMAILA --> RMS
  RMS -->|canonical RFQ| OMS
  OMS -->|EDI 910 load tender| TMS
  TMS -->|EDI 214 milestones drive state| TMS
  TMS -->|Delivered, Bill-Ready record| BMS
  BMS -->|EDI 210 invoice| CUST
  DAT -->|sourcing| TMS
  FMCSA -->|vetting gate| TMS
  SYL -->|reply catchment| TMS

  classDef ext fill:#ffffff,stroke:#718096,color:#4a5568;
  classDef sense fill:#f7fafc,stroke:#718096,color:#1a365d;
  classDef rms fill:#ebf3fb,stroke:#2b6cb0,color:#1a365d;
  classDef oms fill:#e9f7ef,stroke:#38a169,color:#1a365d;
  classDef tms fill:#fff5eb,stroke:#dd6b20,color:#1a365d;
  classDef bms fill:#fdecea,stroke:#e53e3e,color:#1a365d;
```

Each layer maps to a workspace package: `services/rms`, `services/oms`,
`services/tms`, `services/bms`, and `services/adapters` (the Sense Layer, one
contract per [ADR-002](../adr/ADR-002-adapter-contract-pattern.md)). The OMS
holds the single source of truth (the canonical shipment record); each layer
owns transitions only within its own state subset.

## Lifecycle state machine (the canonical shipment record)

The 15 states below are `LIFECYCLE_STATES` verbatim. OMS owns RECEIVED..TENDERED,
TMS owns SOURCING..DELIVERED, BMS owns BILL_READY..INVOICED. Every transition is
audited.

```mermaid
stateDiagram-v2
  [*] --> RECEIVED
  RECEIVED --> PARSED: parse
  PARSED --> PRICED: price
  PRICED --> QUOTE_SENT: send_quote
  QUOTE_SENT --> WON: win
  QUOTE_SENT --> LOST: lose
  WON --> TENDERED: tender
  TENDERED --> SOURCING: accept (EDI 910)
  SOURCING --> CARRIER_ASSIGNED: assign_carrier
  CARRIER_ASSIGNED --> DISPATCHED: 214 X3
  DISPATCHED --> IN_TRANSIT: 214 AF
  IN_TRANSIT --> DELIVERED: 214 D1
  DELIVERED --> BILL_READY: bill_ready
  BILL_READY --> INVOICED: invoice (EDI 210)
  LOST --> [*]
  INVOICED --> [*]
  EXCEPTION --> RECEIVED: reopen
  note right of EXCEPTION
    Reachable from any active state.
    Five sub-types, each with a recovery plan.
  end note
```

## Handoff contracts (the layer seams)

| Seam | Trigger | Artifact | Owning code |
|---|---|---|---|
| RMS to OMS | RFQ won | canonical RFQ + email hash | `services/oms/src/handoff.ts` |
| OMS to TMS | WON to TENDERED | EDI 910 load tender | `services/oms/src/tender.ts` |
| TMS internal | milestone codes | EDI 214 (X3, AF, D1) | `services/tms/src/milestones.ts` |
| TMS to BMS | DELIVERED | Bill-Ready record | `services/tms/src/handoffBms.ts` |
| BMS to customer | Bill-Ready billed | EDI 210 invoice | `services/bms/src/invoice.ts` |
