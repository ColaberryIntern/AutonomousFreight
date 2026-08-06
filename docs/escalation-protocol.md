# Escalation Protocol

Per CLAUDE.md: "Claude must never halt silently." Escalation must be rare and
high-signal. This document defines what is escalation-worthy, where the
escalation goes, the exact template to raise one, and worked examples from the
current state of this project. It pairs with `approval-gates.md` (who signs off)
and `managing-project-integration.md` (how this project reports up).

Companion rule: low confidence alone is not escalation. It triggers Diagnostic
Mode (root cause, minimal fix, protective test, one retry, log). Escalation
follows only if the resolution would cross one of the triggers below.

## 1. What counts as escalation-worthy (6 named triggers)

Escalate when, and only when, one of these is true.

| # | Trigger | Fires when |
|---|---------|------------|
| T1 | **Blocked more than one week** | An input or decision owned outside this project has not landed for 7+ calendar days and work cannot proceed without it. |
| T2 | **Scope conflict** | A ticket contradicts a directive or another ticket, or asks for work outside the agreed project scope. |
| T3 | **Governance boundary** | Any Strategic Decision from CLAUDE.md: architecture layer structure, schema redesign, a new paid external dependency, compliance or security posture, production infrastructure change, cost model shift, AI model class change, or a refactor over 25% of a module. |
| T4 | **Contract change** | A change to a module's or external adapter's input, output, or error contract that other layers depend on, or a change to a commitment already made to a stakeholder. |
| T5 | **Gated ticket stalled** | A Gate 1 or Gate 2 ticket has no gatekeeper action past the wait window (2 business days, or 1 if urgent or past due). |
| T6 | **Repeated failure after Diagnostic Mode** | The same failure three times, or no meaningful progress across two loops. |

If none of T1 through T6 is true, do not escalate. Log the assumption, pick the
simplest deterministic path with the lowest blast radius, and proceed.

## 2. Where the escalation goes

An escalation writes to three places, in this order. All three, every time.

1. **Machine record**: `/tmp/escalation.json` (the audit artifact, Block A below).
2. **Managing project**: a one-paragraph decision request posted to the
   managing-project anchor, Basecamp bucket `7463955`, anchor todo
   `10006979189` (Block B below). This is a decision request, not an FYI.
3. **Owner notify**: a Mandrill email to `ali@colaberry.com` (Block C below).
   Until a `notify_owner` worker exists in `/backend`, the Mandrill email is the
   operational substitute.

Every one of the three carries this project's bucket id (`47126345`) so the
parent process can trace the escalation back without detective work.

## 3. Escalation template (use without modification)

Copy the block, replace every `<...>` placeholder, delete nothing else. The
placeholders are the only edits required.

### Block A: `/tmp/escalation.json`

```json
{
  "escalation_id": "ESC-<YYYYMMDD>-<short-slug>",
  "raised_at": "<ISO-8601 timestamp>",
  "project": "ShipCES Autonomous Brokerage",
  "project_bucket": "47126345",
  "source_ticket": "https://app.basecamp.com/3945211/buckets/47126345/todos/<todo-id>",
  "trigger": "<one of: blocked_1_week | scope_conflict | governance_boundary | contract_change | gated_ticket_stalled | repeated_failure>",
  "problem_summary": "<one or two sentences: what is blocked and since when>",
  "root_cause": "<one sentence: why it is blocked; name the person or decision it waits on>",
  "options": [
    "<Option A> (cost: <...>, risk: <...>)",
    "<Option B> (cost: <...>, risk: <...>)"
  ],
  "risks_of_inaction": "<what breaks or slips if no decision is made>",
  "recommendation": "<the single option Claude recommends, and why in one line>",
  "required_decision": "<the exact question the owner must answer to unblock>",
  "decision_needed_by": "<YYYY-MM-DD>"
}
```

### Block B: managing-project post (bucket 7463955, todo 10006979189)

```
[ESCALATION | ShipCES 47126345 | <ESC-id>] <problem in one sentence>.
Blocked since <date> on <person or decision>. Options: <A>; <B>.
Recommendation: <one line>. Decision needed by <date>: <the exact question>.
Source: https://app.basecamp.com/3945211/buckets/47126345/todos/<todo-id>
```

### Block C: Mandrill email to ali@colaberry.com

```
To: ali@colaberry.com
Subject: [Escalation] ShipCES: <problem in 6 words>

<Problem in one or two sentences, including since when it has been blocked
and what decision or person it waits on.>

Options:
1. <Option A> (cost: <...>, risk: <...>)
2. <Option B> (cost: <...>, risk: <...>)

Recommendation: <one line>.
Decision needed by <date>: <the exact question you must answer>.

Source ticket: https://app.basecamp.com/3945211/buckets/47126345/todos/<todo-id>
Escalation id: <ESC-id>

<standard Colaberry email signature block>
```

## 4. How to escalate (mechanical steps)

1. Confirm a trigger (T1 through T6) is actually met. If not, do not escalate.
2. Fill Block A and write it to `/tmp/escalation.json`.
3. Post Block B to the managing-project anchor as a decision request.
4. Send Block C to `ali@colaberry.com` via the production Mandrill path.
5. Post a one-line pointer comment on the source ticket ("Escalated: `<ESC-id>`,
   awaiting decision, see managing-project anchor") so the ticket's own thread
   shows why it is paused.
6. Continue any work that is not blocked by the escalation. Escalation replaces
   paralysis; it never stops unrelated progress.

Idempotency: an escalation is keyed by `escalation_id`. Re-running the same
escalation is a no-op. Do not send a second email or post a second paragraph for
an escalation already raised; update the existing one if the situation changes.

## 5. Worked examples from current state (as of 2026-07-08)

### Example 1: fired escalation (T1 + T3) — Starboard adapter

The Starboard adapter (Sense Layer) cannot be built until Mike decides
hybrid-versus-isolated architecture. It was raised as a decision request with a
Jul 1 answer date. That date has passed with no answer, so as of Jul 8 it has
been blocked more than one week (T1) and the decision itself sets architecture
layer structure (T3). This is a live, fired escalation. Filled Block A:

```json
{
  "escalation_id": "ESC-20260708-starboard-arch",
  "raised_at": "2026-07-08T15:00:00Z",
  "project": "ShipCES Autonomous Brokerage",
  "project_bucket": "47126345",
  "source_ticket": "https://app.basecamp.com/3945211/buckets/47126345/todos/10011530266",
  "trigger": "blocked_1_week",
  "problem_summary": "The Starboard adapter is unbuilt because the hybrid-vs-isolated architecture call is unmade. Raised with a Jul 1 answer date; no answer as of Jul 8.",
  "root_cause": "Waiting on Mike's decision on whether Starboard runs in the shared adapter runtime (hybrid) or as an isolated service.",
  "options": [
    "Hybrid: build Starboard in the existing services/adapters runtime (cost: low, matches DAT/FMCSA/Sylectus/Email; risk: shared blast radius)",
    "Isolated: stand up a separate Starboard service (cost: higher, new deploy unit; risk: adds an ops surface for one adapter)"
  ],
  "risks_of_inaction": "Sense Layer coverage stays short one carrier source; every day of delay pushes the adapter and its downstream sourcing tests.",
  "recommendation": "Hybrid, to match the four adapters already shipped and keep one deploy unit, unless Mike has an isolation requirement we do not know.",
  "required_decision": "Does Starboard run hybrid (shared adapter runtime) or isolated (separate service)?",
  "decision_needed_by": "2026-07-11"
}
```

Block B (managing-project post) for the same escalation:

```
[ESCALATION | ShipCES 47126345 | ESC-20260708-starboard-arch] Starboard adapter
is unbuilt, blocked on an unmade architecture decision. Blocked since Jul 1 on
Mike (hybrid-vs-isolated). Options: hybrid (shared runtime, low cost); isolated
(separate service, higher cost). Recommendation: hybrid, to match the four
shipped adapters. Decision needed by 2026-07-11: does Starboard run hybrid or
isolated? Source:
https://app.basecamp.com/3945211/buckets/47126345/todos/10011530266
```

### Example 2: candidate, not yet fired (T5) — RMS D1-D33 port at Gate 1

The RMS D1-D33 port ticket (`10011515746`) is approved-with-conditions and waits
on Karun's Gate 1 design and doc review. It is not an escalation today: the port
doc Karun reviews against is not finished, so the gate has not truly been tagged.
It becomes a T5 escalation the moment the port doc lands, Karun is tagged, and
2 business days pass with no review. Trigger to watch: `gated_ticket_stalled`.

### Example 3: candidate (T4) — adapter contract change

`services/adapters/src/contract.ts` defines `AdapterResult`, the error
categories that drive retry, and correlation ids. RMS and OMS depend on that
shape. If an upstream system (for example DAT or Sylectus) changes its response
so the adapter's output contract must change, that ripples across module
boundaries and is a `contract_change` (T4) escalation the moment the break is
confirmed, because other layers cannot be quietly re-typed without review.

## 6. What this protocol is not

- Not a place to make the decision. Claude states a recommendation; the owner or
  managing project decides. Claude does not self-grant the answer.
- Not a stop-work order for the whole project. Only the blocked item pauses.
- Not an auto-approval path. An absent gatekeeper produces an escalation, never a
  self-granted pass (see the 2026-06-22 auto-pass precedent in `approval-gates.md`).
