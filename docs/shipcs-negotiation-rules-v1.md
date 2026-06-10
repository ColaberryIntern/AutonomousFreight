# ShipCS Logistics Negotiation Rules v1.0

**Status:** Colaberry strawman. Ship as the input for the Phase B deterministic negotiation engine (BC todo 9946715893, due 2026-08-09).
**Ownership:** Mike Said (ShipCES) reviews + redlines. Karun (Colaberry) translates accepted rules into pure-function code per CLAUDE.md.
**Supersedes:** nothing. **Superseded by:** Mike's written rules when delivered (becomes v2).
**Date:** 2026-06-03.
**Source inputs:** May 21 walkthrough call recap, May 26 internal call, May 28 weekly call digest, May 29 internal Karun + Ram call digest, Karun's May 14 `CLIENT_DOCS_IMPLEMENTATION_AUDIT.docx`, `docs/dat-rfq-payload-schema.json`, `docs/shipcs-rate-confirmation-template-v1.pdf`.

Every rule below is tagged:
- **[FROM_SHIPCES]** = stated verbally on a call or in client docs; reproduced here verbatim or paraphrased with citation.
- **[INDUSTRY_DEFAULT]** = standard freight-brokerage practice; documented for reviewer to keep, raise, or lower.
- **[COLABERRY_PROPOSAL]** = a value we are proposing because no client guidance exists yet.

---

## 1. Margin policy

**Purpose:** define the minimum, target, and aspirational margins the engine respects on every quote and every counter-offer.

| Rule | Value | Tag |
|---|---|---|
| `margin.absolute_floor_pct` | **7%** | [INDUSTRY_DEFAULT] |
| `margin.absolute_floor_usd` | **$50 per load** | [INDUSTRY_DEFAULT] |
| `margin.target_pct` | **12%** | [INDUSTRY_DEFAULT] |
| `margin.aspirational_pct` | **18%** | [INDUSTRY_DEFAULT] |
| `margin.expedite_premium_pct_over_target` | **+3 percentage points** (so 15% target on expedite) | [COLABERRY_PROPOSAL, May 28 call: expedite is volatile, requires higher buffer] |
| `margin.cross_border_premium_pct_over_target` | **+2 percentage points on the US segment, 0 on the MX segment** | [COLABERRY_PROPOSAL, May 28 call: Mike said Mexican rates do not fluctuate] |
| `margin.below_floor_action` | **WALK** (do not counter, log walk-away with `reason = below_floor`) | [INDUSTRY_DEFAULT] |
| `margin.below_target_above_floor_action` | **PROCEED with audit flag**, daily margin report shows these | [COLABERRY_PROPOSAL] |

**Margin calculation:**
```
sell_rate           = quoted rate to customer (USD)
buy_rate            = rate we paid carrier (USD)
margin_usd          = sell_rate - buy_rate
margin_pct          = margin_usd / sell_rate * 100
```

**Pure-function gate (pseudocode):**
```
function gateMargin(sell_rate, buy_rate, service_mode, is_cross_border) -> Gate:
    target_pct = 12
    if service_mode in {EXPEDITE_SOLO, EXPEDITE_TEAM, EXPEDITE_EXCLUSIVE}:
        target_pct += 3
    if is_cross_border:
        target_pct += 2  # only on US-side legs

    margin_pct = (sell_rate - buy_rate) / sell_rate * 100
    margin_usd = sell_rate - buy_rate

    if margin_pct < 7 or margin_usd < 50:
        return Gate(action="WALK", reason="below_floor")
    if margin_pct < target_pct:
        return Gate(action="PROCEED", audit_flag="below_target")
    return Gate(action="PROCEED")
```

---

## 2. Quote pricing inputs (rate basis)

**Purpose:** declare which sources the engine uses to set the sell-side quote, in priority order.

| Priority | Source | When applied | Tag |
|---|---|---|---|
| 1 | **Customer rate table match** on lane + service type | If a customer-specific contract rate exists for the lane | [FROM_SHIPCES, Karun May 14 audit GTM section 4] |
| 2 | **Historical Colaberry closed-deal average** on same lane over last 30 days | If at least 3 closed deals match the lane | [COLABERRY_PROPOSAL, builds on BC 9946715790 internal historical loop] |
| 3 | **DAT Rate View 7-day average** for lane + equipment type | If we have DAT API credentials AND the lane has 7-day data | [FROM_SHIPCES, May 28 call: Mike's standard practice] |
| 4 | **DAT Rate View 30-day average** | Fallback when 7-day is empty | [FROM_SHIPCES, May 28 call] |
| 5 | **DAT manual scrape spot rate** | If DAT API unavailable but scrape session is live | [COLABERRY_PROPOSAL, BC 9946715770 due 2026-06-07] |
| 6 | **HITL escalation** | None of the above resolve | [INDUSTRY_DEFAULT] |

**Selection rule:** use the **first** source in priority order that returns a non-null value. Log which source was used as `rate_basis.source` on the quote.

---

## 3. Service-mode pricing modifiers

**Purpose:** translate raw lane rate into a service-mode-specific quote.

| Mode | Modifier on base lane rate | Tag |
|---|---|---|
| FTL (Truckload) | **x 1.00** | [INDUSTRY_DEFAULT] |
| LTL | **x 0.60** + LTL classification fee | [INDUSTRY_DEFAULT] |
| ELTL | **x 0.85** | [INDUSTRY_DEFAULT] |
| PARTIAL | **x 0.70** | [INDUSTRY_DEFAULT] |
| EXPEDITE_SOLO | **x 1.35** | [INDUSTRY_DEFAULT, expedite spot premium] |
| EXPEDITE_TEAM | **x 1.75** | [INDUSTRY_DEFAULT, team drives 2x linehaul speed] |
| EXPEDITE_EXCLUSIVE | **x 2.10** (single-load truck, no co-load) | [INDUSTRY_DEFAULT] |
| INTERMODAL | **x 0.55** + ramp fees | [INDUSTRY_DEFAULT] |

Per Karun D5 multi-service-type pattern: when a single RFQ qualifies for multiple modes, emit **one quote option per mode** (Brett Pair A/B/C, slides 11-14). All options use the same base lane rate; the engine applies the modifier per mode.

---

## 4. Special-requirements premiums

**Purpose:** add fixed or percentage premiums for non-standard service.

| Requirement | Premium | Tag |
|---|---|---|
| Hazmat (class 3-9) | **+$300 flat**, capped at +8% of base | [INDUSTRY_DEFAULT] |
| Hazmat class 1 (explosives) / class 7 (radioactive) | **+$800 flat**, no cap, requires manual approval | [INDUSTRY_DEFAULT] |
| Team driver requirement (separate from EXPEDITE_TEAM mode) | **+$0.40 per mile** | [INDUSTRY_DEFAULT] |
| Liftgate | **+$75 flat per stop** | [INDUSTRY_DEFAULT] |
| Inside delivery | **+$150 flat** | [INDUSTRY_DEFAULT] |
| TWIC | **+$100 flat** | [INDUSTRY_DEFAULT] |
| TSA | **+$150 flat** | [INDUSTRY_DEFAULT] |
| FAST card (cross-border) | **+$0 (table stakes for MX cross-border)** | [COLABERRY_PROPOSAL] |
| Temp control (reefer) | **+12% of base** | [INDUSTRY_DEFAULT] |
| High-value cargo (>$100K declared) | **+$200 flat** + insurance verification | [INDUSTRY_DEFAULT] |
| Tarp | **+$50 flat** | [INDUSTRY_DEFAULT] |
| Driver assist (load/unload) | **+$100 flat per stop** | [INDUSTRY_DEFAULT] |

---

## 5. Cross-border specific rules (US-MX)

**Purpose:** lock the two-segment pricing pattern Mike described May 28.

| Rule | Value | Tag |
|---|---|---|
| `cross_border.us_segment_modifier` | use US rate basis (Section 2), apply Section 3 mode modifier | [FROM_SHIPCES, May 28 call] |
| `cross_border.mx_segment_modifier` | use MX rate table (BC 9946715804, due 2026-07-12); **no volatility premium** | [FROM_SHIPCES, May 28 call: "Mexican rates don't fluctuate"] |
| `cross_border.border_crossing_buffer_hours` | **18 hours** per geofence zone (matches BC 9946715176 geofencing approach) | [COLABERRY_PROPOSAL, derived from Brett's May 28 demo: Cadereyta to Laredo = 18 hours] |
| `cross_border.customer_default_crossing` | use customer override if present, else nearest geographic crossing | [INDUSTRY_DEFAULT] |
| `cross_border.requires_fast_card_carriers` | TRUE for southbound and northbound | [COLABERRY_PROPOSAL, MX cross-border best practice] |

---

## 6. Initial offer to carrier (sourcing side)

**Purpose:** define what dollar amount we tell carriers first when posting a load.

| Rule | Value | Tag |
|---|---|---|
| `carrier_initial_offer_pct_of_quoted` | **88%** of customer sell rate (= 12% margin baked in) | [COLABERRY_PROPOSAL, aligns with margin.target_pct] |
| `carrier_initial_offer_floor` | **= sell rate * (100 - margin.absolute_floor_pct) / 100** | [INDUSTRY_DEFAULT] |
| `carrier_initial_offer_disclosed` | FALSE (do not show on DAT postings); show only on direct outreach | [INDUSTRY_DEFAULT, May 28 call: most DAT postings hide the rate] |
| `carrier_tier_bonus_t1_over_floor_usd` | **+$200** for T1 carriers (pre-approved, lane-trusted) | [COLABERRY_PROPOSAL] |
| `carrier_tier_bonus_t2_over_floor_usd` | **+$100** for T2 carriers (pre-approved, no lane history) | [COLABERRY_PROPOSAL] |
| `carrier_tier_bonus_t3_over_floor_usd` | **+$0** for T3 (random DAT, no history) | [COLABERRY_PROPOSAL] |

---

## 7. Counter-offer policy (carrier side)

**Purpose:** define how the engine responds when a carrier counters our initial offer.

| Rule | Value | Tag |
|---|---|---|
| `negotiation.max_rounds` | **3** rounds | [INDUSTRY_DEFAULT] |
| `negotiation.round_1_concession_pct` | **+3% of initial offer** if carrier counter is within 15% of our offer | [COLABERRY_PROPOSAL] |
| `negotiation.round_2_concession_pct` | **+2%** if still negotiating | [COLABERRY_PROPOSAL] |
| `negotiation.round_3_concession_pct` | **+1%** (final), then walk if not accepted | [COLABERRY_PROPOSAL] |
| `negotiation.walk_trigger_margin_floor` | walk if our next offer would breach `margin.absolute_floor_pct` | [INDUSTRY_DEFAULT] |
| `negotiation.walk_trigger_time_minutes` | walk after **45 minutes** of inactivity on an expedite load, **6 hours** on standard | [COLABERRY_PROPOSAL] |
| `negotiation.walk_trigger_alternate_found` | walk immediately if another carrier accepts our open offer on the same load | [INDUSTRY_DEFAULT] |
| `negotiation.escalate_to_human_at_round` | escalate to dispatcher at round 3 if margin is within 1 percentage point of floor | [COLABERRY_PROPOSAL] |

**Pure-function pseudocode:**
```
function nextOffer(round, prior_offer, carrier_counter, sell_rate) -> Decision:
    if round > 3:
        return Decision(action="WALK", reason="max_rounds")

    concession = {1: 0.03, 2: 0.02, 3: 0.01}[round]
    candidate_offer = prior_offer * (1 + concession)

    if carrier_counter > sell_rate * 0.93:   # carrier wants more than 7% off sell
        return Decision(action="WALK", reason="below_floor")

    if candidate_offer < carrier_counter:
        candidate_offer = min(carrier_counter, sell_rate * 0.93)

    margin_pct = (sell_rate - candidate_offer) / sell_rate * 100
    if margin_pct < 8 and round == 3:
        return Decision(action="ESCALATE_HUMAN", reason="thin_margin_final_round")

    return Decision(action="COUNTER", new_offer=candidate_offer, round=round)
```

---

## 8. Customer-side rules (quote validity + re-quote)

**Purpose:** define how long a quote stands and what triggers a re-quote.

| Rule | Value | Tag |
|---|---|---|
| `quote.validity_expedite_hours` | **2 hours** | [INDUSTRY_DEFAULT] |
| `quote.validity_standard_hours` | **24 hours** | [FROM_SHIPCES, May 28 call: 1-2 week validity on RFQ batches] |
| `quote.validity_rfq_batch_days` | **7 days** with 48-hour notice required | [FROM_SHIPCES, May 28 call verbatim: "valid for one week, two weeks, 48 hours notice"] |
| `quote.requote_market_move_threshold_pct` | re-quote if DAT 7-day avg moves more than **10%** | [COLABERRY_PROPOSAL] |
| `quote.requote_time_threshold_pct_of_validity` | re-quote at **80%** of original validity if not awarded | [COLABERRY_PROPOSAL] |
| `quote.discount_for_re_engagement_max_pct` | max **3% discount** off original quote when re-engaging same customer same lane within 24h | [COLABERRY_PROPOSAL] |
| `quote.multi_option_emit` | one quote option per qualifying service type per Karun D5 | [FROM_SHIPCES, Karun D5 May 13] |

---

## 9. Customer-specific overrides (CustomerRule profile)

**Purpose:** allow per-customer adjustments to the universal rules. Maps to `customerRules` block on the canonical RFQ payload (BC 9917948332).

| Customer attribute | Engine behavior | Tag |
|---|---|---|
| `isBoardEmail = TRUE` | downgrade priority by 1 tier; do not auto-quote | [FROM_SHIPCES, Karun May 14 audit] |
| `kpiDriven = TRUE` | tag for weekly $ report; prioritize sourcing | [FROM_SHIPCES, Ram KPI directive May 21] |
| `premiumPricing = TRUE` | margin floor +2 percentage points; target +4 percentage points | [COLABERRY_PROPOSAL] |
| `competitionCount > 3` | tighten margin: target = floor + 2 percentage points | [COLABERRY_PROPOSAL] |
| `appointmentsRequired = TRUE` | add liftgate + dock check on every stop validator | [INDUSTRY_DEFAULT] |
| `fuelSurchargeConfig.model = INDEX_LINKED` | fuel rides separately, do not bake into all-in | [INDUSTRY_DEFAULT] |

---

## 10. Escalation matrix (when the engine refuses to act autonomously)

**Purpose:** define exactly when the engine pauses and asks a human, and which human.

| Trigger | Route to | Tag |
|---|---|---|
| Margin floor breached on initial pricing | **Dispatcher** | [INDUSTRY_DEFAULT] |
| Margin floor breached on round 3 counter | **Dispatcher** | [INDUSTRY_DEFAULT] |
| Customer requests discount > 5% off quoted | **Account owner** | [COLABERRY_PROPOSAL] |
| Carrier counter > sell rate * 0.93 (below 7% margin) | **Dispatcher** | [INDUSTRY_DEFAULT] |
| Market move > 10% post-quote, pre-award | **Account owner** | [COLABERRY_PROPOSAL] |
| Hazmat class 1 or 7 detected | **Compliance + Dispatcher** | [INDUSTRY_DEFAULT] |
| Cross-border without FAST-card carrier | **Cross-border specialist** (Monterey HITL per BC 9951047130) | [FROM_SHIPCES, May 28 call] |
| 3 consecutive walk-aways on same load | **Dispatcher + Account owner** | [COLABERRY_PROPOSAL] |
| Confidence score on RFQ extraction below 0.65 | **HITL queue** with reason `extraction` | [FROM_SHIPCES, Karun V3 validator] |

---

## 11. Audit and observability requirements

**Purpose:** what the engine must log so every decision is reviewable.

Each negotiation event emits one structured log row:

```json
{
  "event_id": "evt_01JV9R000000000000000000XX",
  "timestamp": "ISO-8601",
  "rfq_id": "rfq_...",
  "load_id": "ld_...",
  "carrier_id": "car_...",
  "event_type": "INITIAL_OFFER | COUNTER | ACCEPT | WALK | ESCALATE",
  "round": 1,
  "our_offer": 2200.00,
  "carrier_counter": 2250.00,
  "sell_rate": 2500.00,
  "margin_pct_at_close": 12.0,
  "rate_basis_source": "dat_rate_view_7day | customer_rate_table | historical_30d | manual_scrape | hitl",
  "decision_code": "COUNTER_ROUND_1 | WALK_BELOW_FLOOR | ESCALATE_THIN_MARGIN | ACCEPT_AT_TARGET",
  "rule_versions": { "negotiation_rules": "v1.0", "margin_policy": "v1.0" }
}
```

**Daily margin report** (broker-owner-facing): margin distribution by lane, service mode, customer class, carrier tier. Surfaces below-target deals so the rules can be tuned.

---

## 12. Out of scope for v1.0

- Spot-rate market arbitrage (buy-load-sell-load triangulation) - revisit Q4 2026 after internal historical loop has data.
- Multi-load contract bidding (annual RFQs with hundreds of lanes) - separate Phase D effort.
- Real-time fuel surcharge index integration (DOE weekly) - covered by `pricing-rules engine` BC 9946715801 due 2026-07-05.
- Carrier scoring weights (which carrier to call first) - separate spec, BC 9946715826 due 2026-06-06.
- Counter-offer language generation (the actual email reply) - belongs to the response generator agent, not the rules engine.

---

## 13. Open questions for Mike's review

Specific items where ShipCES input would replace a [COLABERRY_PROPOSAL] or [INDUSTRY_DEFAULT] tag:

1. **What is ShipCES current absolute margin floor in percent?** (Section 1)
2. **What is the target margin per service tier?** (Section 1)
3. **Margin uplift for cross-border vs domestic - confirm 2 percentage points US-side, 0 MX-side?** (Section 1, Section 5)
4. **Default initial-offer percentage of sell rate** - 88% reasonable? (Section 6)
5. **Walk-away inactivity timer on expedite** - is 45 minutes right or do you go longer? (Section 7)
6. **Quote validity for standard service** - we propose 24 hours; you mentioned 1-2 week validity for RFQ batches on May 28. Confirm both apply? (Section 8)
7. **Hazmat class 1 and 7 auto-escalate** - confirm manual-only? (Section 4, Section 10)
8. **Discount cap on customer re-engagement** - 3% off original quote acceptable? (Section 8)
9. **Are there customer-specific rules already in your current process** that we should encode in the CustomerRule profile? (Section 9)
10. **Are there carrier-tier definitions** (T1/T2/T3) you already use, or do we propose ours? (Section 6)

Replies inline on each numbered question land as v1.1; reply with a complete written rules doc lands as v2 and supersedes this.

---

*Built 2026-06-03 by Colaberry for ShipCES Autonomous Brokerage. BC ticket 9946715820. Em-dash count 0.*
