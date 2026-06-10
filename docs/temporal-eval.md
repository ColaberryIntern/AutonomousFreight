# Workflow Orchestration: Build vs Buy

**Subject:** Temporal vs LangGraph vs Agno vs current custom approach
**Author:** Ali Muwwakkil
**Date:** 2026-05-26
**For:** Ram Katamaraja, ShipCS engineering review
**Framework:** TBI Vendor Advisor (INPACT + GOALS scoring)

---

## TL;DR

| Tool | INPACT (36) | GOALS (25) | Verdict for ShipCS |
|---|---|---|---|
| Custom (today) | 27 | 18 | Acceptable for decision logic. Inadequate for orchestration. |
| **Temporal** | **31** | **23** | **Recommended for the orchestration layer.** Replaces hand-rolled tick loops, cooldowns, retries. |
| LangGraph | 22 | 16 | Not recommended. Wrong fit. Designed for LLM-routed graphs, we explicitly do not want LLMs in our decision loops. |
| Agno | 28 | 20 | Worth a second look. Framework-agnostic, production-focused, but still LLM-first. Better than LangGraph if we ever add LLM-mediated reasoning. |

**Recommendation:**
1. **Keep custom for decision logic** (pricing, carrier ranking, compliance gates, negotiation rules). Pure functions, full auditability. Frameworks add overhead without value for rule tables.
2. **Adopt Temporal for orchestration** before Phase C (W3 tracking cadences, W6 appointment waits, W7 onboarding waits). Our `procurementAgent.ts` tick-loop + 60s cooldown column pattern will not scale to long-running multi-step flows.
3. **Skip LangGraph.** Designed for LLM-routed decisions, which we deliberately avoid.
4. **Defer Agno** unless we add LLM-mediated reasoning. Then re-evaluate.

---

## Problem Statement

Today our agents (RFQ quoting, carrier procurement, billing match, etc.) run as periodic tick loops:
- `procurementAgent.ts` polls every 60 seconds, filters by a `last_agent_check_at` column on the shipments table, and processes a batch of 50.
- Retries are implicit in the tick frequency. There is no exponential backoff, no per-failure-class policy, no dead-letter queue.
- Long-running multi-step flows (W6 appointment booking can wait hours for shipper response) require us to poll, store cursor state in our own tables, and reconstruct progress on restart.

This works at low volume. It will not scale to:
- W3 tracking with 15-min / 30-min / 2-hour cadences per shipment across hundreds of in-flight loads
- W6 appointment retry windows with shipper API timeouts
- W7 carrier onboarding waits across compliance gate latency

The decision logic itself (what tier to assign, what price to offer, accept/counter/reject) is rule-table-driven and pure. That should stay custom.

The orchestration logic (when to retry, how long to wait, how to recover from a worker crash mid-step, how to signal a workflow from outside) is what we are currently writing by hand. That is where a framework wins.

---

## Evaluation Framework (per TBI Vendor Advisor)

### INPACT (Agent Needs, 36 points max)

| Dim | Weight | What it measures |
|---|---|---|
| **I**nstant | 1-6 | Query latency to start/signal a workflow |
| **N**atural | 1-6 | NLU / API expressiveness for declaring workflows |
| **P**ermitted | 1-6 | Access control on workflow definitions and signals |
| **A**daptive | 1-6 | Ability to evolve workflows safely (versioning) |
| **C**ontextual | 1-6 | Multi-source integration into the orchestrated flow |
| **T**ransparent | 1-6 | Replayability and audit trail of every execution |

### GOALS (Operational Readiness, 25 points max)

| Dim | Weight | What it measures |
|---|---|---|
| **G**overnance | 1-5 | Policy enforcement, compliance, RBAC |
| **O**bservability | 1-5 | Monitoring, debugging, traceability |
| **A**vailability | 1-5 | Ease of adoption, learning curve |
| **L**exicon | 1-5 | API quality, SDK breadth, ecosystem |
| **S**olid | 1-5 | Reliability, production track record |

**Enterprise thresholds:** INPACT >= 24, GOALS >= 18.

---

## Option 1: Custom (Today)

What we have in `services/carrier/src/agent/procurementAgent.ts`, `services/rfq/src/agent/quotingAgent.ts`, etc.

| Dim | Score | Notes |
|---|---|---|
| Instant | 5 | Pure code, no framework startup cost |
| Natural | 4 | TypeScript reads well, but each agent reinvents the loop structure |
| Permitted | 5 | Full RBAC via existing middleware, since it is just Express |
| Adaptive | 3 | No versioning of workflows. Behavior changes require deploy. |
| Contextual | 5 | We control every integration directly |
| Transparent | 5 | Every decision logged to `audit_log` with metadata |
| **INPACT total** | **27** | Above 24 threshold, but Adaptive is a real weakness |
| Governance | 5 | We own everything, no external policy gaps |
| Observability | 3 | Logs to stdout, no per-workflow trace view, debugging multi-step flows is painful |
| Availability | 3 | New engineer ramp: must read every agent file individually |
| Lexicon | 2 | Internal-only, no SDK |
| Solid | 5 | What is built is rock-solid (pure functions, type-checked) |
| **GOALS total** | **18** | Right at threshold. Observability and Availability are weakest. |

**Verdict:** acceptable for the decision-logic layer (rule tables, pure functions). **Increasingly inadequate** for orchestration as we scale to long-running multi-step flows.

---

## Option 2: Temporal (Recommended for orchestration)

[temporal.io](https://temporal.io) - Durable execution platform, originally from Uber's Cadence project. Used by Snap, Coinbase, Stripe, Datadog, HashiCorp, Netflix.

### What it would replace

- The 60-second `procurementAgent.ts` tick loop → a `WorkflowExecution` that yields and resumes on signal
- The `last_agent_check_at` column on shipments → replaced by Temporal's internal state store
- Manual retry logic → declarative `RetryPolicy` with exponential backoff per activity
- Manual cron / scheduler patterns → `ScheduleClient` primitives
- Cross-service event publishing for "wake up when X happens" → signals into a running workflow

### TBI scoring

| Dim | Score | Notes |
|---|---|---|
| Instant | 5 | Sub-100ms to start a workflow on a warm cluster |
| Natural | 6 | Workflows are written as normal TypeScript / Go / Python / Java functions. Very readable. |
| Permitted | 5 | Namespace-level RBAC, mTLS, SSO integration |
| Adaptive | 6 | First-class versioning (`patched()`, `getVersion()`). Live migrations of long-running workflows are a solved problem. |
| Contextual | 5 | Activities are arbitrary code, integrate anywhere |
| Transparent | 4 | Every workflow execution is fully replayable from history. Web UI shows every step. Audit trail built in. |
| **INPACT total** | **31** | Strong across the board. Adaptive is a clear win over custom. |
| Governance | 5 | Namespaces, RBAC, encrypted payloads, SOC 2 Type II (Temporal Cloud) |
| Observability | 5 | Web UI with full workflow history, OpenTelemetry export, per-workflow trace |
| Availability | 4 | Real learning curve (durable execution mental model), but well-documented |
| Lexicon | 5 | SDKs in Go, Java, TypeScript, Python, .NET, PHP. Active ecosystem. |
| Solid | 4 | Production-proven at massive scale (Uber, Snap, Stripe). Self-hosted is operationally heavy. Cloud is mature. |
| **GOALS total** | **23** | Strong. The only soft spot is operational complexity if self-hosted. |

### Cost (Tier 2 budget per TBI guidance)

- **Temporal Cloud:** ~$200-500/month for our expected volume (5K-50K workflow executions / day, with 30-day retention). Pay-per-action billing scales linearly.
- **Self-hosted:** Cassandra + Elasticsearch + worker processes. Operationally heavy, only worth it if we need on-prem for compliance (we do not, currently).

### Migration path

- **Phase 1 (week 1-2):** Spin up Temporal Cloud namespace, port one agent (start with `procurementAgent`) as a workflow. Keep the existing agent running in parallel. Compare audit logs. Cost: low, fully reversible.
- **Phase 2 (week 3-4):** If Phase 1 lands well, port `quotingAgent` and add the W3 tracking cadence as a Temporal `ScheduleWorkflow`. Drop the `last_agent_check_at` column once Temporal owns the timing.
- **Phase 3 (Phase C build):** All new long-running flows (W6 appointment, W7 onboarding) are Temporal-native. Existing short-lived agents stay custom or get ported opportunistically.

### Risks

- **Operational dependency.** Temporal Cloud or our own Temporal cluster becomes a critical path. Mitigation: Cloud SLA, plus a graceful-degradation fallback to the existing tick loop.
- **Mental model shift.** Engineers need to learn durable-execution semantics (deterministic workflows, side-effect isolation in activities). Real but manageable. Their docs are excellent.
- **Vendor lock-in.** Temporal Cloud lock-in is moderate (the SDK is open-source, we can move to self-hosted at any time using the same code).

---

## Option 3: LangGraph (Not recommended)

[langgraph.dev](https://langgraph.dev) - LangChain's orchestration layer for LLM-routed decision graphs.

| Dim | Score | Notes |
|---|---|---|
| Instant | 4 | Fast enough |
| Natural | 4 | Graph DSL is clean if you accept LLM-routed nodes |
| Permitted | 3 | Less mature ACL story |
| Adaptive | 3 | Graph definitions evolve, no formal versioning |
| Contextual | 4 | Strong LangChain integrations |
| Transparent | 4 | LangSmith tracing is good for LLM calls, but our decisions are not LLM calls |
| **INPACT total** | **22** | **Below the 24 enterprise threshold.** |
| Governance | 3 | Early-stage |
| Observability | 4 | LangSmith is purpose-built |
| Availability | 3 | Python-first (we are TypeScript), small adoption curve |
| Lexicon | 3 | Python SDK strong, JS SDK weaker |
| Solid | 3 | Still maturing |
| **GOALS total** | **16** | **Below the 18 enterprise threshold.** |

**Verdict:** LangGraph is purpose-built for orchestrating LLM agents where the LLM decides which node to traverse next. Our explicit design constraint is **no LLM in the decision loop**, so we would be using the framework against its grain. Decision: **no**.

---

## Option 4: Agno (Defer)

[agno.com](https://agno.com) - Production-focused multi-agent framework, framework-agnostic, supports 23+ LLM providers. Flagged by TBI as a production-grade alternative to LangGraph.

| Dim | Score | Notes |
|---|---|---|
| Instant | 5 | Fast |
| Natural | 5 | Clean abstractions |
| Permitted | 4 | Reasonable ACL |
| Adaptive | 4 | Good versioning story |
| Contextual | 5 | Framework-agnostic, integrates broadly |
| Transparent | 5 | Built-in tracing |
| **INPACT total** | **28** | Above threshold. |
| Governance | 4 | Improving |
| Observability | 4 | Strong |
| Availability | 4 | Moderate ramp |
| Lexicon | 4 | Multi-language support |
| Solid | 4 | Production-focused, but younger than Temporal |
| **GOALS total** | **20** | Above threshold. |

**Verdict:** Agno is the strongest LLM-first alternative if we ever decide to add LLM-mediated reasoning (e.g., parsing carrier email replies into structured input vectors). But for the orchestration layer that we actually need today, Temporal is more mature and more directly suited. **Defer Agno** until we have a concrete LLM-mediated reasoning use case.

---

## Where each lives in our architecture

```
                  ShipCS Workflows
                        |
        +---------------+---------------+
        |                               |
   Decision logic                  Orchestration
   (custom, stays)                 (Temporal, new)
        |                               |
   - Pricing rules                  - Workflow definitions
   - Carrier scoring                - Long waits, signals
   - Compliance gates               - Retry policies
   - Negotiation table              - Schedules / cron
   - Validation (Zod)               - Replayable history
```

Custom owns the decisions. Temporal owns the timing, retries, and durable state across long waits. The two compose cleanly: a Temporal workflow calls our pure-function decision modules as Activities.

---

## What I would do next

1. **Spin up a Temporal Cloud trial namespace** (free, no commit). Port `procurementAgent.ts` as a proof-of-concept workflow. Compare audit logs against the existing tick loop. Estimated effort: 2-3 days.
2. **Write up findings** with concrete latency, observability, and operational comparisons. Estimated effort: 1 day.
3. **Decision point:** if Phase 1 lands well, commit to Temporal for the orchestration layer. If it does not, document why and stay with the custom approach plus targeted retry / scheduler improvements.
4. **Re-evaluate Agno** only when we have a concrete LLM-mediated reasoning requirement (W2 sourcing carrier email reply parsing is the most likely first such requirement).

---

## Open questions for Ram

1. **Operational appetite:** are you comfortable with another external service (Temporal Cloud) as a critical path, or do you want self-hosted? Self-hosted is doable but adds Cassandra + Elasticsearch + monitoring overhead.
2. **TBI catalog priorities:** are there other tools in the TBI catalog you want me to score before this is final? Specifically in the Workflow Orchestration or Multi-Agent Orchestration categories.
3. **Timing:** Phase C build kicks off in ~6 weeks. Do you want this decided before then, or is it fine to run Phase B without Temporal and re-decide before Phase C?

---

## References

- TBI Vendor Advisor knowledge base: [github.com/colaberry/trust-before-intelligence-book/.../kb_vendor_advisor.md](https://github.com/colaberry/trust-before-intelligence-book/blob/FirstCleanBookVersion/manuscript/tools/gpt_knowledge_bases/kb_vendor_advisor.md)
- Temporal docs: [docs.temporal.io](https://docs.temporal.io)
- LangGraph docs: [langchain-ai.github.io/langgraph](https://langchain-ai.github.io/langgraph)
- Agno docs: [agno.com](https://agno.com)
- Current procurement agent: `services/carrier/src/agent/procurementAgent.ts`
- Current quoting agent: `services/rfq/src/agent/quotingAgent.ts`
- ShipCS workflows directive: `directives/300-shipcs-logistics-workflows.md`
