# May 29 Karun + Ram internal call: digest, Drive docs integrated, game plan

**Call:** Autonomous Brokerage - Internal Calls
**When:** 2026-05-29, 12:21 PM CT, 57 minutes
**Attendees:** Ali, Karun, Ram (internal)
**Recording:** Otter (Karun shared at 12:31 PM)
**This doc supersedes** the open questions in [karun-email-parsing-eval.md](./karun-email-parsing-eval.md) section "Open questions". Many got answered on the call.

---

## TL;DR

Karun walked us through his (so-called scrapped) ShipCES email-parsing system, showed the architecture, and demonstrated working flows. Three things shifted: (1) **pricing is now the headline blocker, not just sourcing** — the team is hitting a paywall on what looks like a CPS-type data source costing $1,000+/month; (2) **Karun's repo is not actually dead** — he's still actively developing it (last push 2026-05-29) and showed it as a working reference, so it stops being "abandoned" and starts being our north star for engineering patterns; (3) **the HTML validation-deck pattern is validated** — Ali was told to "send CPS workflows as HTML via the new WhatsApp group" rather than do another verbal call.

## What the call covered (per the Otter summary)

- **Pricing strategy for RFQs.** High quoted prices driven by oil and government rules. The team discussed using historical data for quotes and the need for pricing strategy rules.
- **Platform access friction.** Ali couldn't get into a pricing platform (CPS?) that costs over $1,000/month. Search for alternatives is now an explicit workstream.
- **Karun shared architecture in detail.** Design patterns, Google Maps for border crossing updates, system documentation walkthrough.
- **Decisions.** Validate workflows (the v9 HTML deck pattern), explore cost-effective alternatives, run structured calls for focus.
- **Next.** Ali to review the codebase and documentation. Follow-up demo call scheduled.

## Action items captured (3 of 7 visible in the email; the other 4 are behind the Otter link)

| # | Owner | Action |
|---|---|---|
| A1 | Ali | Explore CPS and alternative data sources for pricing: research companies posting to CPS, calculate CPS API costs for the required setup, prepare a comparison of routes + costs. |
| A2 | Ali | Test CPS via manual login + browser automation to scrape available data — understand what can be extracted without automated login. |
| A3 | Ali | Send CPS workflows as HTML via the new WhatsApp group for review and validation without long verbal calls. |

Action items A4-A7 need to be pulled from Otter directly (login wall).

---

## How the Karun Google Drive docs map to what was discussed on the call

In parallel with the call I pulled 9 files from Karun's shared Drive folder (updated within the last month). They directly align with what Karun showed:

| Drive doc (modified) | What the call referenced |
|---|---|
| **CLIENT_DOCS_IMPLEMENTATION_AUDIT.docx** (May 14) | The "validate workflows" theme. This doc IS the validation, grounded in actual `file:line` citations against Brett's slides + the GTM PDF. It catalogs what's ✅ implemented, 🟡 partial, ❌ not implemented across every slide and every GTM requirement. **Authoritative gap list, more grounded than our v9 verification confidence matrix.** |
| **QUOTING_REQUIREMENTS_SUMMARY.md** (May 13) | The active design baseline locked at decision D33 on 2026-05-12. 5 use cases, 33 numbered decisions, sprint slicing A-F. **This is the design we'd port to our W1 build, not Brett's Dec 5 slides directly.** |
| **ARCHITECTURE_VISUAL_GUIDE.md / .docx** (May 6) | The "design patterns" Karun showed. 20 sections of Mermaid diagrams: C4 system context, Outlook v1 vs v2, InboundLedger lifecycle, the 15-agent LangGraph DAG, the 4 orthogonal state regions, bucket resolver priority chain, timer architecture, MVT 4-store sync, deployment topology, observability, design patterns catalog. |
| **State Desision Tree** (Drawing, May 8) | One of the state diagrams shown. |
| **Quoting_Requirements_Summary.png** (May 13) | The visual companion to the .md design. |
| **Things for initial GTM and initial release.docx** (Apr 30) | Mike's Phase 1 GTM brief. Defines what's "sellable": 3-5k emails/month, 1k quotes, $3k/month trial → $6k. "no silent failures or exceptions" is the non-negotiable. |
| **SDL_WORKFLOW_AND_GAP_PREVENTION.docx** (Apr 29) | Karun's SDLC playbook. Seven seams where gaps open between design → PRD → tasks → tests → ship; closure mechanism for each seam. The slash-command cadence (`/grill-me`, `/prd`, `/dev`, `/sprint-run`, `/reconcile`, `/walkthrough`, `/sprint-close`, `/gap`, `/autopilot`). |
| **SDLC.png** (Apr 29) | Visual of the SDLC. |

**Folder URL:** https://drive.google.com/drive/folders/1TVcOc8cI8JL-eSdCATypSS4vX_OKvMYK

**Status of Basecamp upload:** Started but not finished. Files identified; upload to the Vault is deferred to a focused session. In the meantime, all team members have Drive access via Karun's share.

---

## The shift since v9 (what changed in our model)

| Before | After |
|---|---|
| Sourcing (DAT/Sylectus credentials) framed as the headline Phase B blocker. | **Pricing is now the headline blocker**, ahead of sourcing. Without rate tables + market-rate data, the quote we send is a guess. |
| Karun's repo treated as abandoned reference for patterns only. | Karun's repo treated as **the working reference system** — actively developed, demo-able. We mine engineering patterns from it AND use its design docs (QUOTING_REQUIREMENTS_SUMMARY, ARCHITECTURE_VISUAL_GUIDE) as our W1 design baseline. |
| Brett's Dec 5 docs were the most concrete spec we had. | The Karun rewrite (D1-D33 locked May 12) **supersedes Brett's slides as our design source of truth for W1**, because it bridges between Brett's slides and an implementable schema (TimingSentiment, ServiceTypeMatch list, structured validator output, 5th HITL region). |
| v9 verification confidence (Mike / Brett / Jen / Karun / Ali) was our gap measure. | The **CLIENT_DOCS_IMPLEMENTATION_AUDIT (May 14)** is a more grounded gap measure — it cites actual `file:line` evidence in Karun's codebase against every Brett slide and every GTM requirement. Use it to recalibrate the v9 scores. |
| HTML deck framed as engineering review artifact. | HTML deck framed as **client-facing validation tool distributed via WhatsApp** for async review. The pattern is validated as the right format. |
| Cost not surfaced in our planning. | Cost discipline is now explicit. Per-tool cost (CPS at $1k+/month is the trigger) factors into Phase B integration decisions. |

---

## HTML deck process: how it has matured

| Version | Shipped | What it added |
|---|---|---|
| v6 | May 26 | May 26 internal-call findings (Ali + Ram + Karun); 5 amber annotations on W1 + W2 (DAT/FMCSA dependency, 3-to-8-day scope, board emails, pre/post-bid patterns, pricing intelligence gap). |
| v7 | May 28 AM | Brett's Dec 5 Quoting Documentation (PPTX + Visio) reconciled into W1 (SIPOC framing, six Service Types, sourcing-channel correction with Sylectus / Starboard / Full Circle as 90%, multi-option quote pattern). |
| v8 | May 28 PM | Confidence scores + gap analysis (Build / Client / Confirm) per workflow; all 27 live Basecamp todos slotted into workflows colored by assignee. System-wide confidence dashboard. |
| v9 | May 28 PM | **Validation reframing** (Brett's docs reframed as one input, not authority); 5-cell verification confidence matrix per workflow (Mike / Brett / Jen / Karun / Ali → YES / PARTIAL / NO); **Kanban board** with 5 columns; tickets bulk-assigned (21 CB System, 4 Ali governance, 2 multi-assigned); "300-person team" framing removed; 3-to-8-day positioning corrected; ShipCES asks tracker. |

The trajectory has been: **engineering reference → validation tool → distribution-ready artifact**. v9 is the form that the May 29 call validated as the right format for WhatsApp distribution.

**What v10 should add (informed by today's call):**
- Cost column on the ShipCES asks tracker (CPS vs alternatives, DAT subscription tier, etc.)
- Reconciled gap measure that blends v9 verification confidence with the CLIENT_DOCS_IMPLEMENTATION_AUDIT file:line citations
- Pricing layer surfaced as its own concern (not buried inside W1 + W2)
- The Karun system architecture diagrams (relevant Mermaid blocks from ARCHITECTURE_VISUAL_GUIDE) embedded as the engineering reference for our W1 build

---

## Game plan to attack the work

### This week (now through end of next week)

**Pricing exploration (Ali, A1 + A2 from the call):**
- [ ] Inventory: list every pricing data source mentioned across the docs (CPS, DAT, Sylectus, SONAR, customer rate tables) with subscription cost, API availability, coverage area (US / MX / cross-border)
- [ ] CPS specifically: manual login + browser automation scrape test to scope what we can get without paying for the API tier
- [ ] Cost-vs-coverage matrix for the team to choose from

**HTML deck v10 (Ali, builds on A3):**
- [ ] Add a Pricing-layer section to the deck (it's currently scattered across W1 and W2)
- [ ] Reconcile our v9 verification scores against Karun's May 14 implementation audit (use his ✅ 🟡 ❌ as the source of truth)
- [ ] Add cost column to the asks tracker
- [ ] Distribute v10 via the new WhatsApp group instead of email

**Drive doc absorption (Ali / engineering):**
- [ ] Upload the 9 Drive files to the Basecamp Vault for team-wide visibility (deferred earlier today)
- [ ] Schedule the follow-up demo Karun proposed
- [ ] Read QUOTING_REQUIREMENTS_SUMMARY and confirm we'll use D1-D33 as our W1 design baseline

### Next 30 days (after WhatsApp validation)

**Stand up the pricing layer (the new headline P0):**
- [ ] Build the canonical rate-table schema (zip-to-zip, lane, service type, customer-specific overrides) — schema-only deliverable first
- [ ] Wire one pricing data source (CPS scrape OR DAT trial OR customer-supplied table) to validate the integration pattern
- [ ] Persist historical quote outcomes to build the dataset for "use historical data for quotes" from Karun's design

**Port the W1 design from Karun's rewrite:**
- [ ] Take QUOTING_REQUIREMENTS_SUMMARY D1-D33 as the design doc, run `/grill-me`-equivalent to surface unresolved branches, then produce a PRD for our W1 module (this is where Karun's SDL_WORKFLOW playbook becomes our playbook)
- [ ] Build the Validate Details + Evaluate Opportunity stages first (Brett's slides 4 + 6); skip Sourcing until pricing is solid
- [ ] Adopt the inbound-ledger contract pattern from Karun's repo on day one
- [ ] Adopt Phoenix tracing for the Quoting Agent on day one

**Validate end-to-end:**
- [ ] Run a small batch (10-20 real RFQs) through our W1 module
- [ ] Compare extracted fields + service-type classification against Karun's audit's ✅ baseline
- [ ] Adjust thresholds, expand corpus

### Phase 2 (Sourcing) opens only after Phase 1 (Pricing + Quoting) is real

- Sourcing (W2) is currently gated on (a) the 4 client deliverables we've nudged twice with no response and (b) the load-board API credentials. **Without pricing first, sourcing has nothing to anchor against.** The call's pricing focus locks the right order.

---

## Open questions for the follow-up demo with Karun

1. What does "CPS" stand for and what data does it expose? (My best guesses: Customs Pricing Service, Capacity Pricing System — confirm on the call.)
2. The 4 unseen action items (A4-A7) from this call.
3. The status of Karun's repo — is he still treating it as production-bound or as a pure reference?
4. Are the QUOTING_REQUIREMENTS_SUMMARY D1-D33 decisions still locked, or has the design moved since 2026-05-12?
5. The "Google Maps for border crossing updates" pattern — does it live in [shipces_django/static/](https://github.com/karunswaroop/ShipCES_EmailParsing) (the Off-master Route map I noted earlier was India-only)?
6. Cost of running his stack today — does the $1k+/month CPS sit on top of a Vertex AI bill, a Phoenix bill, and a Cloud SQL bill?
