# ShipCES Autonomous Brokerage - agent map

The 12 operational agents in the `AGENT_REGISTRY` (`services/carrier/src/api/router.ts`,
served at `GET /api/v1/agents`), grouped by department. These are the Phase-V
operational plane; they run over the four-layer RMS/OMS/TMS/BMS domain plane
([architecture](architecture-c4.md)). Labels, departments, schedules and
directive numbers are taken verbatim from the registry.

## Agents by department

```mermaid
flowchart TB
  subgraph QUOTING[Quoting]
    Q1["Quoting Agent<br/>prices RFQs (dir 200)"]:::a
  end
  subgraph PROC[Procurement]
    P1["Procurement Agent<br/>auto-assigns carriers (dir 210)"]:::a
    P2["Capacity Shortage<br/>detects stuck shipments (dir 210)"]:::a
  end
  subgraph EXEC[Execution]
    E1["Tracking Agent<br/>milestone progression (dir 211)"]:::a
  end
  subgraph DOCS[Documents]
    D1["Document Agent<br/>BOL extraction (dir 212)"]:::a
  end
  subgraph FIN[Financials]
    F1["Rate Audit Agent<br/>margin check (dir 220)"]:::a
    F2["Invoice Agent<br/>auto-invoice (dir 220)"]:::a
    F3["Payment Match Agent<br/>three-way match (dir 230)"]:::a
    F4["Settlement Agent<br/>carrier payment queue (dir 230)"]:::a
    F5["Dispute Agent<br/>auto-resolve under 5% (dir 230)"]:::a
  end
  subgraph OPS[Operations]
    O1["Health Monitor<br/>KPI thresholds (dir 190)"]:::a
    O2["Admin Activity<br/>admin KPI thresholds (dir 060)"]:::a
  end
  classDef a fill:#ebf3fb,stroke:#2b6cb0,color:#1a365d;
```

## Which layer each department serves

```mermaid
flowchart LR
  RMS["RMS"]:::rms --> OMS["OMS"]:::oms --> TMS["TMS"]:::tms --> BMS["BMS"]:::bms
  QUOTING["Quoting"]:::dep -.-> OMS
  PROC["Procurement"]:::dep -.-> TMS
  EXEC["Execution"]:::dep -.-> TMS
  DOCS["Documents"]:::dep -.-> BMS
  FIN["Financials"]:::dep -.-> BMS
  OPS["Operations (cross-cutting)"]:::dep -.-> RMS
  OPS -.-> BMS
  classDef rms fill:#ebf3fb,stroke:#2b6cb0,color:#1a365d;
  classDef oms fill:#e9f7ef,stroke:#38a169,color:#1a365d;
  classDef tms fill:#fff5eb,stroke:#dd6b20,color:#1a365d;
  classDef bms fill:#fdecea,stroke:#e53e3e,color:#1a365d;
  classDef dep fill:#f7fafc,stroke:#718096,color:#1a365d;
```

## Registry reference

| Agent | Department | Type | Directive | Audit prefix |
|---|---|---|---|---|
| Quoting Agent | quoting | pricing | 200 | `rfq.` |
| Procurement Agent | procurement | assignment | 210 | `agent.procurement.` |
| Tracking Agent | execution | simulation | 211 | `agent.tracking.` |
| Document Agent | documents | validation | 212 | `agent.document.` |
| Rate Audit Agent | financials | audit | 220 | `agent.rate_audit.` |
| Invoice Agent | financials | generation | 220 | `agent.invoice.` |
| Payment Match Agent | financials | matching | 230 | `agent.payment.` |
| Settlement Agent | financials | settlement | 230 | `agent.settlement.` |
| Dispute Agent | financials | resolution | 230 | `agent.dispute.` |
| Health Monitor | operations | monitoring | 190 | `agent.health_monitor.` |
| Capacity Shortage | procurement | monitoring | 210 | `agent.capacity_shortage.` |
| Admin Activity | operations | monitoring | 060 | `agent.admin_monitor.` |

Note: these 12 agents are the operational automation over the existing Phase-V
stack. The new four-layer forward-track build (RMS/OMS/TMS/BMS + Sense) realizes
the same domain as typed, testable modules; the Invoice Agent and Rate Audit
Agent are the operational counterparts of the BMS invoice generator.
