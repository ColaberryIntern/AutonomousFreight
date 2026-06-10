# May 28 ShipCES + Colaberry weekly call: digest and action items

**Call:** ShipCES_Colaberry - Weekly Call
**When:** 2026-05-28, 9:59 AM CT, 1 hour 42 minutes
**Attendees:** Ali, Karun, Ram (Colaberry); Mike Said "The Malibu", Brett, Jen (ShipCES)
**Recording:** Otter (transcript pulled to local; PDF in Downloads)
**Status of v9 deck on this call:** This is the call where the v9 HTML workflow deck was presented and validated as the right format for distribution.

---

## TL;DR

Three things landed on this call:

1. **DAT access is still blocked but the credit card is being charged.** Mike confirmed ShipCES is paying for DAT but cannot log in to a subscribed account. Jen provided a login during the call but it requires SMS authentication to Ali's cell phone, which Ali sent into the chat. Brett confirmed he has no DAT API contact info yet and that the API tier "runs into the thousands" per month with multiple separate APIs (posting, rate view, lane makers, trend lines, board) each with their own price. **This is the gating dependency for everything we need to build for both Quoting and Sourcing.**
2. **Brett's "scrapped" system is actually his live production site.** Soft rollout to one user (Arc account) at ~95% quoting capture; stager improved from 77 -> 91% with a single prompt iteration; extractor at rough 85-95%. Templates classed by domestic / MX-to-US / MX-to-Canada / MX-to-Canada-via-US. Sylectus already integrated for nearby trucks + hours of service. Geofencing zones used to estimate Mexico transit time because the math is non-mathematical (carrier-behavior driven, not Google-Maps driven).
3. **Ali's "post-on-DAT, link-to-negotiation-app" idea got a green light from Brett.** Brett's response: "in theory it sounds simple ... why is it not being done? It just hasn't caught on." This is a candidate differentiator. Phone calls are still 90% of DAT-side carrier negotiation because of culture, not technology constraint.

The v9 distribution channel (WhatsApp group) was created during the call. Mike confirmed "a significant portion is WhatsApp" for ShipCES business comms. Ali asked everyone to send their cell numbers in the meeting chat to form the group.

---

## The DAT access situation, captured precisely

| What | State |
|---|---|
| ShipCES is being charged for DAT | Confirmed by Mike (credit card statement) |
| Mike's login shows "no subscription" | Confirmed |
| Right login holder | Unknown, Mike doesn't know who has it |
| Jen-provided login | Requires SMS auth to Ali's cell; Ali sent number in chat |
| DAT API contact | Brett does not have one yet |
| DAT API cost | Brett: "insanely expensive ... thousands [per month] for what we do" |
| Separate DAT APIs | Posting, rate view, lane makers, trend lines, the board - all separately priced |
| Manual scraping feasible | Yes for posting; rate view is the protected high-value data |
| Carriers also pay for DAT | Yes, they see the same rate data; they "set the market" |
| Load-to-truck ratio out of Laredo | 35 loads per truck (extremely tight, May 2026) |
| Market volatility cause | Blitz week DOT inspections, fuel at multi-year high, immigration restrictions, driver language restrictions |

**Practical implication:** Until DAT login is resolved, we cannot validate any quoting workflow against real rate data. CPS (the >$1k/month platform Ali couldn't access) is now Plan B. DAT is the priority.

---

## What Mike confirmed about how ShipCES actually quotes

- **Expedite (their sweet spot, 0-2 days)** is "primarily what we do." Pricing is immediate; market moves too fast for any blanket-rate approach.
- **3 to 8 day quotes** are "not a huge part of what we do" and "not prioritized." If the team is busy, those shipments get quoted later. The process is:
  1. One person on the Monterey team with DAT experience (cross-border specialist, started February 2026, now in supervisory role) pulls a DAT 30-day average for the lane
  2. Quote sent with the format: "this rate is valid for one week / two weeks, 48 hours notice required"
  3. Anything that doesn't fit those parameters is re-quoted
- **RFQ work (multi-shipment Excel)** is recognizable immediately when the inbound has lanes without dates. Quoted on annual / 90-day / 13-month averages from DAT rate view, knowing some win some lose.
- **Cross-border specifics:** Mexican rates don't fluctuate much. American side fluctuates. Quote breaks at the border. Customer can ask for a different border crossing and the rate recalculates.
- **The cross-border specialist is the integration point.** Mike: "I think he could definitely be a resource for us on that. Now he's the one that's going to have access to all the active loads, those are all coming in via email, and right now, not being prioritized." This person is Phase A's human-in-the-loop, not an obstacle.

---

## What Brett showed (the "production site," not scrapped)

Brett walked us through the working system, which he calls "the production site right now." Key observations:

| Component | State Brett described |
|---|---|
| Soft rollout | Arc account ~95% of quoting captured. User given a sign-on, told "play with it, just know it's live." Within hours: "Oh this is great, can you add this, this is broken" feedback. |
| Stager (state transitions) | 77% -> 91% accuracy in one prompt iteration overnight. Target 95% at 500 training entries. Asked Karun for help with training. |
| Extractor | Rough estimate 85-95%. Not measured rigorously yet. Needs feedback mechanism + dataset outputs built. Asked Karun for help. |
| Templates | Classed by domestic / MX-to-US / MX-to-Canada / MX-to-Canada-via-US. Customer-based and team-based variants. Some language-specific. |
| Mexican transit time | Originally tried mathematical (Google Maps + 40 mph). Wrong. Real reason: carrier behavior (one carrier "likes to stop at the terminal for 4 hours on this lane" -> 18 hr actual vs 12 hr math). Solution: hardcoded geofence zones per state with empirical transit times. |
| Sylectus integration | Live. Pulls nearby trucks, hours of service. API token needs refresh. |
| RXO integration | Scraped, not API. "Could do API now but don't want to because of the price." |
| Tooling stack | Asana for tickets (one ticket per session). Claude skill that creates the ticket with detail. Codex for code review / bias check. Hermes ("Brett the Third") as orchestration / big-picture agent ("introducer to the sprint, project manager"). Was using Oakland Claw [OpenClaw], switched to Hermes for memory management. |
| Carry files | CLAUDE.md, AI prompts in workspace, developer guides. Brett calls this "my chair with four legs." |

**Karun's questions to Brett (and the review framework we should adopt for our own build):**
1. "Are you sure you're not missing anything from the scrape?" (Completeness of inbound capture)
2. "Something got a reply from the client, how do you make sure we are not missing those things?" (Conversation-thread continuity)
3. State transitions: "It can go only a few stages, it can't go to any other stage, cross check on the transition happening properly." (State-machine validation, matches Karun's 4-region RFQ state machine)
4. Token optimization (not blocking yet, but on the list)

---

## The differentiator Brett confirmed and the carrier-side reality

This is the part that should reshape how we frame the W1 + W2 product to ShipCES.

**Brett, carrier-side perspective:**
> "I love Book Now, sometimes I'll probably take less of a rate for that, but I look at the time and dealing with some cheese person that's gonna put me on hold for five minutes or try to negotiate with me, or do I ain't got time for that guy."

**The reality:**
- Most large brokers (TQL, CH Robinson "Cheap and Heavy", Radiant) don't offer Book Now and don't even publish email on DAT. They want you to call so they can negotiate.
- Brokers exist as administrative middlemen connecting shippers without carrier rolodexes.
- Carriers care about: getting paid (factoring eligibility, credit score), broker reputation (DAT ratings, reviews), lane details accuracy.
- Uber Freight failed because (a) carrier resistance to apps and (b) no human-set rate.

**Ali's response (Brett endorsed it):**
> "Having something like an app that's built that's really phone friendly. Post on DAT, just post a link for that negotiation. They can click on it and boom we're right there on a negotiation. Hey here's all the information on this load, you do all the negotiating through the app, and then we update with all the information."

**Brett:** "In theory it sounds like the most simple thing to do ... why is it not being done? It just hasn't caught on. I can't tell you why."

This is a candidate W2 differentiator: post on DAT, embed a deep link to a mobile-friendly carrier negotiation surface that runs the agent. The carrier never deals with a "cheese person" trying to grind them.

---

## Market context (May 28, 2026) Mike + Brett established

- Fuel: highest in years, still rising
- DOT blitz week last week: drivers refusing loads to avoid inspections
- Immigration + driver language restrictions: dropping driver supply
- Result: "supply shock of trucks" - market hot for reasons not tied to demand
- Brett's stock-market analogy: standard service = 90-day CD pricing; expedite = day trading. Expedite leads the market by ~24 hours but moves exponentially with it.

This is why Karun's question "how do we quote this Mike, can't rely on average price" got the answer "no, the market is volatile right now." **Pricing strategy in volatile markets is its own design problem, not a rate-lookup problem.** It belongs in the Pricing Layer P0 list.

---

## WhatsApp group

Ali asked everyone to send their cell number in chat. Mike, Brett, and Jen confirmed they use WhatsApp heavily. Ali confirmed v9 distribution channel will be WhatsApp going forward instead of long verbal calls. **Status: group being formed; need to confirm Ali pulled the trigger after the call.**

---

## Hard stops and follow-ups visible in the transcript

- Ali had a hard stop at 1:01:25 ("gotta jump on another call, but I will communicate through WhatsApp")
- Karun stayed and watched Brett's full system demo
- Karun offered to help train Brett's stager and extractor: "no matter what the priorities are, I can take some time into this, because this is critical"
- Brett offered to send Karun training data export
- No specific next-meeting time mentioned in the transcript window we have

---

## Action items derived from this call

These are new or sharpened by this call. Cross-reference against existing BC tickets in the next section.

| # | Owner | Action | Due | Tagged |
|---|---|---|---|---|
| W1 | Ali | Resolve DAT login: get Mike to find the paid-account holder, OR accept Jen's login with SMS auth routed to Ali's phone | 2026-06-04 | [HUMAN] |
| W2 | Ali | Press Mike on DAT credit-card-charged-but-no-subscription discrepancy; confirm which account is paid and who owns it | 2026-06-03 | [HUMAN] |
| W3 | Brett | Send Karun the stager training data export (offered on call) | 2026-06-02 | [HUMAN, Brett] |
| W4 | Karun | Help train Brett's stager toward 95% (currently 91%) | 2026-06-14 | [AI + HUMAN] |
| W5 | Karun | Help build feedback mechanism + dataset outputs for Brett's extractor | 2026-06-21 | [AI + HUMAN] |
| W6 | Ali | Confirm WhatsApp group created with Mike, Brett, Jen, Karun, Ram | 2026-06-01 | [HUMAN] |
| W7 | Ali + Karun | Identify cross-border specialist in Monterey (the DAT-experienced supervisor who joined Feb 2026) and define the human-in-the-loop integration for 3 to 8 day quotes | 2026-06-09 | [HUMAN] |
| W8 | Karun + CB System | Adopt the "completeness-of-scrape" review framework Karun used on Brett's RXO scrape, applied to OUR Phase A inbound capture | 2026-06-14 | [AI] |
| W9 | Karun + CB System | Adopt state-transition cross-check pattern from Karun's review of Brett's stager into our quoting state machine | 2026-06-21 | [AI] |
| W10 | Karun + CB System | Add geofencing-zones approach for Mexico transit time to our system (carrier-behavior-driven, not math-driven) | 2026-06-28 | [AI] |
| W11 | Ali | Add to v10 deck: broker reputation as an input/output in quoting (DAT ratings, credit score, factoring eligibility) | 2026-06-09 | [HUMAN] |
| W12 | Ali | Add to v10 deck: "post on DAT + link to mobile negotiation app" as a candidate W2 differentiator | 2026-06-09 | [HUMAN] |

---

## Reconciliation against existing Basecamp tickets (May 28 baseline of 41)

| New action | Maps to existing BC ticket? | Decision |
|---|---|---|
| W1 DAT login resolve | Existing client-ask ticket for DAT credentials (Client Asks list) | Update existing; do not create new |
| W2 Press Mike on DAT discrepancy | Subset of existing client-ask ticket | Add note to existing ticket |
| W3 Brett sends Karun training data | NOT EXISTING | **Create new BC ticket** |
| W4 Karun helps train Brett stager | NOT EXISTING | **Create new BC ticket** |
| W5 Karun helps Brett extractor | NOT EXISTING | **Create new BC ticket** |
| W6 WhatsApp group confirmation | NOT EXISTING | **Create new BC ticket** |
| W7 Cross-border specialist integration | Adjacent to Phase A tickets but not specific | **Create new BC ticket** |
| W8 Completeness-of-scrape review | Adjacent to Phase A inbound ticket | Add as sub-requirement; create explicit BC ticket |
| W9 State-transition cross-check | Adjacent to Phase A state-machine ticket | Add as sub-requirement; create explicit BC ticket |
| W10 Geofencing for Mexico transit | NOT EXISTING | **Create new BC ticket** |
| W11 Broker reputation in v10 | Existing v10 deck ticket | Add as sub-bullet |
| W12 Post-on-DAT + link-to-app pattern | NOT EXISTING (this is a v10 deck input AND a future W2 design ticket) | **Create new BC ticket for design ticket; add bullet to v10 ticket** |

**Net new BC tickets to create from this digest: 7.**

---

## What this call validates vs. what it surfaces as new

**Validates:**
- 3 to 8 day positioning ("not a huge part of what we do") - the v9 correction was right
- Sylectus is the 90% sourcing channel for ShipCES (now confirmed against Brett's integration)
- WhatsApp distribution is the right channel
- v9 validation-deck format works for live walkthrough
- Karun's questions about scrape completeness + state-transition cross-check are the right review framework
- "No silent failures" GTM constraint from Mike's Apr 30 brief is consistent with the operational reality

**Surfaces new (or sharpens):**
- DAT billing discrepancy at ShipCES (Mike is paying but can't log in)
- Cross-border specialist as the explicit human-in-the-loop for 3 to 8 day quotes
- Geofencing-zones pattern for non-mathematical transit time
- Brett's working system is not scrapped, it's live production with one user
- Carrier-side "Book Now" gap as a candidate differentiator
- Broker reputation (DAT ratings, credit score, factoring) as quoting inputs/outputs
- Brett's Asana-ticket-per-session pattern as a tooling reference for our own work
