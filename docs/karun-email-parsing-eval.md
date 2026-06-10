# Karun's ShipCES Email Parsing Repo: Evaluation + What to Borrow

**Date documented:** 2026-05-29
**Repo:** [karunswaroop/ShipCES_EmailParsing](https://github.com/karunswaroop/ShipCES_EmailParsing) (private)
**Status at ShipCES:** Superseded. ShipCES decided to go with their COO's parallel build instead.
**Purpose of this doc:** Reference for the W1 (Quote → Award) email-parsing module we still need to build for Autonomous Freight. Patterns to borrow, traps to avoid, files worth reading carefully.

---

## TL;DR

Karun built a production-grade Django + LangGraph email-parsing system over many months. It runs on GKE at `https://aixcelerator.ai/freight/outlook_newui`, processes trucking RFQ emails through a 15-agent LangGraph pipeline, supports both Gmail IMAP and MS365 Outlook, deploys on GCP with Vertex AI (Gemini 2.0 Flash Lite), and ships with 4,000+ tests. The repo is at version 3.9.0 (pyproject) / 4.5.13+ (production). It was forked from his earlier HGTS (India trucking) work, then adapted for ShipCES with US + India + HGTS verticals.

ShipCES's COO built a parallel version and they chose that one. Karun's repo is now a reference, not a base. **We will not fork it. We will mine it for patterns when building our own W1 module.**

---

## Project identity

| Property | Value |
|---|---|
| Project name | aiXNegotiator |
| Repo | `karunswaroop/ShipCES_EmailParsing` (private, owned by Karun's personal account) |
| Primary language | Python (11 MB) |
| Other languages | JavaScript (1.4 MB), HTML (677 KB), CSS (391 KB), Shell (113 KB) |
| File count | 3,328 files |
| Last push | 2026-05-29 |
| pyproject version | 3.9.0 |
| Production version | v4.5.13+ |
| Default branch | `main` |

---

## Production architecture

### Deployment

| Layer | Technology |
|---|---|
| Production URL | `https://aixcelerator.ai/freight/outlook_newui` |
| GCP project | `shipces-aixnegotiator` |
| Compute | Google Kubernetes Engine (GKE), 3-10 pod replicas |
| App server | Daphne (ASGI), Django 5.0 + Channels |
| Load balancer IP | 34.59.62.24 |
| Cache | Redis (GCP Memorystore) for WebSocket channel layer + Celery broker |
| Database | PostgreSQL |
| Object storage | Google Cloud Storage (GCS) |
| LLM | Vertex AI - Gemini 2.0 Flash Lite |
| Auth | Firebase Authentication (role-based: Admin / Operator) |
| Email ingestion (prod) | MS365 Graph API v1 (multi-folder polling + webhooks via Cloud Pub/Sub) |
| LLM observability | Arize Phoenix tracing |

### Local development

- Triple LLM provider: Ollama (`gpt-oss:20b`), Gemini API, or Vertex AI
- Email sources: `.eml` / `.msg` files in folders, Gmail IMAP polling, MS365 webhooks
- Docker Compose for Redis + Ollama + Phoenix
- Manual mode for offline development (`MANUAL_MODE_README.md`)

---

## The 15-agent LangGraph pipeline

Per the README (the `MULTI_AGENT_SYSTEM_DOCUMENTATION.md` documents an earlier 6-agent version; the current production has 15):

| # | Agent | Responsibility |
|---|---|---|
| 1 | Classifier | Determine if email is `rate_request`, `shipment_inquiry`, `spam`, etc. |
| 2 | Image OCR | Tesseract over image attachments |
| 3 | PDF OCR | `pdfplumber` with OCR fallback for scanned PDFs |
| 4 | Extractor | Structured shipment data extraction from text + OCR output |
| 5 | Validator | Validate extracted data, trigger retry with corrections |
| 6 | PCMiler | Route distance + travel time calculation |
| 7 | Vehicle Selector | Recommend optimal vehicle from cargo specs |
| 8 | Feedback Interpreter | Parse natural language corrections from operator |
| 9 | Feedback Validation | Validate operator corrections before applying |
| 10 | Reply Composer | Generate email replies |
| 11 | Language Detection | Detect email language (US vs India market relevance) |
| 12 | Subject Analyzer | Extract service type / FTL / LTL / routes from subject lines |
| 13 | Board Email | Handle external board emails (their version of our "board emails" — Pro Trans / LandStar etc.) |
| 14 | Compose Service | Manage email composition lifecycle |
| 15 | Quote Generator | Generate shipping quotes from validated data |

### Extracted shipment data shape

From the older Multi-Agent doc; current shape is similar but extended:

```python
{
  "shipment": {
    "pickup":   [{"company_name", "street_address", "city", "state", "zip_code",
                  "country", "contact_name", "contact_phone", "contact_email",
                  "pickup_date", "pickup_time"}],   # plural — multi-pickup support
    "delivery": [...],                              # plural — multi-stop
    "dimensions": [{"length_in", "width_in", "height_in"}],
    "miles": float,
    "travel_time": "5h 30m",
    "others": {
      "weight_lbs": float,
      "piece_count": int,
      "service_type": "FTL" | "LTL",
      "stackable": bool,
      "hazardous": bool,
      "requirements": str,
      "us_vehicle": str,
      "mx_vehicle": str,
      "flatbed": bool
    }
  }
}
```

Pickup and delivery are arrays from the start, which directly answers Ram's question on our DAT Payload todo (#9917948332): does the schema support plural origins/destinations? Karun's shape does.

### Retry + fallback pattern

- Validator failure → routes back to Extractor with corrections embedded in the prompt
- Tesseract missing → logs error, continues without OCR (graceful degradation)
- Corrupted image → skips, processes remaining attachments
- LLM provider down → falls back to alternate provider (Ollama → Gemini → Vertex AI)

---

## Engineering practices worth borrowing

These are the patterns I would lift into our Autonomous Freight W1 build.

### 1. Layer separation (HackSoft Django styleguide)

- **Views** — thin, HTTP parsing + response only, no business logic
- **Services** — writes, `@transaction.atomic`, keyword-only args (`*`), `select_for_update()` on write paths
- **Selectors** — read-only queries, return QuerySets, use `select_related` / `prefetch_related`
- **Serializers** — input validation + output formatting in separate classes
- **Models** — schema + constraints, FSM via `django-fsm-2`
- **Signals** — cross-app decoupling (`email_moved`, `email_flagged`, `email_processed`)

Our stack is Node, not Django, but the pattern translates: keep route handlers thin, push writes into transactional services, read via dedicated selectors, validate at boundaries via Zod schemas. CLAUDE.md already aligns with this.

### 2. Inbound ledger contract

Per their CLAUDE.md (capitalized as IMPORTANT):

> Every exit from `ingestion_service._dispatch_sync` and `tasks.process_email` must call `ledger.mark_completed()`, `mark_permanently_skipped(reason=...)`, `mark_dead_letter(error=...)`, or `mark_attempted(error=...)` + `raise`. **Bare `return` is a regression** — guarded by `tests/unit/test_inbound_ledger_contract.py`.

This is the same pattern as our audit-trail-on-every-decision rule. They have it as a tested contract, not a convention. Adopt: every W1 RFQ row must reach a terminal state, enforced by a contract test.

### 3. The MVT (Model-View-Template) 4-store sync rule

Every workflow / state field must exist in all four stores:

1. The Email ORM model
2. Redis (via `CacheService`)
3. `processing_cache` (local pod memory)
4. GCS / local cache file

Add a workflow field → update Email model + migration, `valid_workflow_fields` in `update_workflow_status()`, `valid_extra_fields` in `EmailRepository.update_workflow_status()`, `save_to_cache()` defaults, Redis overlay key list + `get_email_info()` defaults in `FolderEmailsView._get_from_cache()`. They have a 10-location checklist in their internal `context/architecture-patterns.md`.

This is heavy. Verdict: **the principle (multi-store coherence is testable) is worth borrowing; the specific 4-store pattern is not** — they use it because they need pod-local caches in GKE. Our infrastructure is simpler. We'd pick at most two stores (DB + Redis) and have one source of truth.

### 4. Celery + Redis task queue with deterministic dispatch

- Email processing is dispatched via Celery tasks (not SKIP LOCKED queue)
- Broker: Redis (db 2)
- Task: `apps/inbound/tasks.py:process_email` with autoretry (5 attempts, 30s backoff)
- Dispatch: `ingest_message()` → `transaction.on_commit` → `process_email.delay()`
- Rollback flag: `USE_CELERY=false` for synchronous fallback

The `transaction.on_commit` hook is the important pattern — it guarantees the row exists before the worker is told about it. Without this, race conditions are easy. Borrow.

### 5. Pricing matrix lookups via active version

> Pricing matrix lookups MUST use the active `PricingMatrixVersion` via `get_active_version()`. Never filter `PricingMatrixEntry` by a hard-coded version id. Partial unique constraint `uniq_active_pricing_version` enforces one active version. Guarded by `tests/unit/test_claude_md_pricing_rule.py`.

Plus a v23 rule: activating a version checks `validation_status ∈ {passed, overridden}`, with `PricingMatrixVersion.can_activate()` as the single source of truth.

This is the right way to do versioned reference data. We don't have a pricing matrix yet in Autonomous Freight; when we add one (for the multi-option quote generator per Brett's docs), this is the pattern.

### 6. RFQ State Lifecycle: pipeline-layer vs state-machine-layer

They have two design docs:

- **V4** (`docs/RFQ_STATE_LIFECYCLE_DESIGN_V4.md`) — pipeline-layer: DAG ordering, REPLY/NEW bifurcation, `header_threading`, classifier post-extraction
- **V3** (`docs/RFQ_STATE_LIFECYCLE_DESIGN_V3.md`) — state-machine-layer: Rules 13+14, substate enums, HITL options, `missing_data` + Branch D

V4 supersedes only V3 §3.1; all other V3 sections remain authoritative. Active in sprints v194-v200.

**Worth reading both** before we design our W1 RFQ state machine. They've already debated REPLY vs NEW classification and `missing_data` handling in production.

### 7. Phoenix tracing for LLM observability

- Local: `cd deploy/phoenix && docker-compose up -d`, UI at `localhost:6006`
- Per-agent traces: classifier → extractor → validator → vehicle_selector
- LLM token usage + latency per agent
- PCMiler API call metrics
- Error tracking and debugging

We don't have LLM observability in Autonomous Freight yet. When we do, Phoenix or Langfuse is the right pattern. Default: trace every agent call with input + output + duration.

### 8. The `outlook_archive` sibling project

A standalone Python CLI (separate venv, separate Dockerfile, separate tests) that archives raw MS Outlook messages from `QuotesTeam@shipces.com` into BigQuery (`shipces_analytics.outlook_messages`). Deployed as a Cloud Run Job triggered by Cloud Scheduler daily at 02:00 America/Chicago.

The pattern is the borrow:

- Operational data (the live Email model) lives in OLTP (Postgres)
- Analytics data (raw archived messages) lives in OLAP (BigQuery)
- A nightly job moves data across
- Each system has its own deployment, dependencies, tests

We should add an equivalent for Autonomous Freight before we accumulate too much production data. Postgres for OLTP, BigQuery (or ClickHouse / Snowflake) for analytics, nightly archival.

### 9. Subject Analyzer as a separate agent

Karun split subject-line analysis from body extraction (agent 12). Subjects have very different structure (often just "FTL Dallas-Chicago 5/24") and benefit from a dedicated prompt + model config. Brett's Dec 5 docs also identified subject-line signal as load-bearing.

For our W1, the Quoting Agent should have a subject-first short-circuit: if the subject contains enough signal, route fast; otherwise fall through to body extraction.

### 10. Board email as a separate agent + cross-folder query

Their board email classifier (agent 13) is separate from the regular email classifier. And the cross-folder query is `Q(folder="BoardEmails") | Q(email_type="board_email")` — a board email might be in the regular inbox or in a dedicated folder.

This matches our v9 W1 model finding that board emails (Pro Trans, LandStar, RXO, Sylectus, Starboard, Full Circle) are a distinct intake channel needing per-board credentials. Their separation pattern is right.

---

## Patterns we should NOT copy

### India / HGTS verticals

The repo carries 3 verticals: US, India (IND), and HGTS (a separate Indian trucking customer). Artifacts:

- `India_Truck_Types.xlsx` (and v2)
- `Lane_Pricing_All_Vehicle_Types_FINAL.xlsx`
- `REQUIRE QUOATATION BHIWANDI WH.xlsx`, `REQUIRE QUOATATION CHENNAI.xlsx`
- `RFQ_CHN.docx`, `RFQ_MUM.docx`
- `HGTSEmail.docx`, `HGTS_logo.jpg`
- Three mockup views: `NewUIMockupView` (US), `NewUIMockupIndiaView` (India), `NewUIMockupHGTSView` (HGTS)
- Hyderabad 40-lane yearly contract
- IND single-lane RFQ fixtures (MUM-DEL, CHE-BLR, AMD-KOL, HYD-PUN, DEL-JAI)
- Off-master Route map (Google Maps button on IND single-lane rate-breakdown modal)

This is dead weight for our Autonomous Freight work. The repo originated as HGTS, was adapted for ShipCES, never got the India work pruned out. Ignore all of it.

### The salvage-PR strategy

They have ADR 0001 (`docs/adr/0001-dev-srini-salvage-not-merge.md`) describing a "Salvage PR" pattern for extracting operator-observable behavior from a stale branch (`dev_srini`) when the file-level diff has been poisoned by a refactor on `main`. Phase 1 and Phase 2 salvages, real-UI byte-identical regression tests via 1280×800 Playwright screenshots.

This is an artifact of their branch divergence with a parallel developer. It's a clever workaround but not a transferable pattern. We don't need it.

### The MS365 v1 vs v2 split

They built MS365 integration v2 (Inbox-only, SHA-256 attachments, dedicated GCS bucket), then reverted to v1 in production (multi-folder polling + webhooks). The v2 code is dormant but intact. Lessons:

- The reverted version (v2) is technically cleaner per the README's description
- Production reality forced v1 because of multi-folder polling needs
- This kind of dormant code is a maintenance tax

For our build, **pick one ingestion strategy and commit**. We already have MS365 v1-style polling working from prior context; stay with it.

---

## Files worth reading deep (when we start building)

| File | Why |
|---|---|
| `shipces_django/agents/` | The actual 15 agent implementations. Each is a self-contained module with a clear input / output contract. |
| `docs/SYSTEM_ARCHITECTURE.md` | Production architecture diagrams (GKE topology, request flow, email processing pipeline). |
| `docs/RFQ_STATE_LIFECYCLE_DESIGN_V3.md` + V4 | Their RFQ state machine design, including REPLY/NEW bifurcation and `missing_data` handling. |
| `MULTI_AGENT_SYSTEM_DOCUMENTATION.md` | Per-agent inputs, outputs, decision logic, LLM config (token counts, temperature). Older 6-agent version but still useful. |
| `apps/inbound/tasks.py` | Celery task pattern with autoretry, ledger contract, terminal state enforcement. |
| `apps/pricing/selectors/pricing_selectors.py` | Versioned pricing matrix pattern. |
| `apps/core/scheduler.py` + `apps/gmail/views/outlook_webhook_view.py` | MS365 v1 integration (polling + webhooks). |
| `outlook_archive/README.md` | OLTP-to-OLAP archival pattern (Cloud Run Job + BigQuery). |
| `tests/unit/test_inbound_ledger_contract.py` | Contract test for terminal-state enforcement. |
| `tests/unit/test_workflow_cache_fix.py` | MVT 4-store sync test pattern. |
| `tests/unit/test_claude_md_pricing_rule.py` | How to enforce a CLAUDE.md rule via test. |
| `CONTEXT.md` | Glossary of project-specific terms ("salvage PR", "operator-observable", "off-master route map"). |
| `CLAUDE.md` | Their engineering standards. Black 120 char, type hints required, class-based APIView only, MVT architecture, the v44 scheduler gunicorn fix, etc. |

---

## Implications for our W1 (Quote → Award) build

Cross-referencing against our [v9 workflows deck](https://app.basecamp.com/3945211/buckets/47126345/messages/9920426706) and the directive at [directives/200-rfq-quote-pipeline.md](../directives/200-rfq-quote-pipeline.md):

### Things our W1 model already aligns with Karun's approach

- Multi-channel email intake (email, board emails, WhatsApp, EDI)
- A Classifier-first pipeline with retry on extraction failure
- Plural pickup / delivery arrays
- Service Type taxonomy (FTL / LTL / Expedite variants) influencing both quoting and sourcing
- Separation of subject analysis from body extraction
- Board emails as a distinct intake type

### Things Karun's approach adds that we should adopt

1. **Split OCR by media type** (Image vs PDF). Each has different libraries and preprocessing.
2. **Separate Feedback Interpreter from Feedback Validation** for operator corrections — a two-step protects against garbled corrections.
3. **Language Detection agent** — relevant if ShipCES accepts non-English RFQs (Brett's Spanish-alias requirement in our W1 model implies yes).
4. **Inbound ledger with contract test** — every email reaches a terminal state, enforced by test.
5. **Versioned pricing matrix** when we build the multi-option quote generator (Phase A or early Phase B).
6. **Phoenix-style LLM tracing** from day one of our Quoting Agent.
7. **Subject-first short-circuit** for high-signal subject lines.
8. **OLTP-to-OLAP nightly archival** before we accumulate too much production data.

### Things to skip

- The Django HackSoft styleguide as-is (translate the patterns to our Node stack)
- The MVT 4-store sync (overkill for our smaller infra)
- The salvage-PR workflow (artifact of their branch divergence)
- The India / HGTS verticals (irrelevant)
- The Tesseract dependency (we already use a different OCR path; only adopt if we need to handle scanned-PDF RFQs at volume)

---

## Open questions

1. **Why did ShipCES go with the COO's version?** Was it for technical reasons, control reasons, or simpler architecture? If we can find out, it tells us what to avoid in our own build.
2. **What does the COO's version look like?** Is there a repo / doc we can see, or is it private to ShipCES?
3. **Are we expected to interop with the COO's version?** If yes, our W1 needs a defined integration contract.
4. **Did the 15-agent count grow from the 6 documented in MULTI_AGENT_SYSTEM_DOCUMENTATION?** The README says 15; the dedicated multi-agent doc says 6. Production version is somewhere between. We should ask Karun which agents are still in the canonical path vs experimental.
5. **Did Karun's Phoenix tracing reveal latency or accuracy issues with any specific agent?** That data, if logged, tells us which agents are easy and which are hard.
6. **What's the actual production accuracy on classification + extraction?** Their 4,000+ tests exist but I haven't seen accuracy / precision / recall numbers. Worth asking before we set targets on ours.

---

## Action items for Autonomous Freight

- [ ] Karun deep-dive (30 min): walk us through the 15 agents, which ones survived design changes, which patterns he'd repeat, which he'd skip.
- [ ] Get the ShipCES COO version (if available) for comparison.
- [ ] Decide whether to adopt Phoenix or Langfuse for LLM tracing on our Quoting Agent.
- [ ] Add a contract test for terminal-state enforcement on our RFQ ingestion path.
- [ ] Add OLTP-to-OLAP archival to the Phase B roadmap (low priority but lead time matters).
- [ ] Pull the RFQ State Lifecycle V3 + V4 designs and reconcile against our 7-state machine (`directives/200-rfq-quote-pipeline.md`).
