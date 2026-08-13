# Approval Gates

How work in the ShipCES Autonomous Brokerage passes from built to accepted.
Every non-trivial ticket carries its gates in its own description; this document
defines the gate model once, so Claude Code and every reviewer know exactly
where work halts, who signs off, and what happens when a gatekeeper is away.

## At a glance

- 2 approval gates
- 3 gatekeepers: Karun (Gate 1), Ram and Ali (Gate 2)
- Gate 2 requires two keys: both Ram and Ali
- Wait window before escalation: 2 business days (1 if urgent or past due)

## The two gates

### Gate 1 (Karun): design + documentation review

Owner of visual coherence and doc/diagram consistency. Karun confirms:

- The change matches the architecture docs.
- Diagrams and flowcharts are refreshed to match the code.
- A junior developer could follow the change.
- Naming and structure stay consistent across the docs.

Applies to: every build ticket, before it is considered done.
Blocks on: design drift, stale diagrams, doc inconsistency.

### Gate 2 (Ram + Ali): scope + contract sign-off

Reached only for tickets that touch a governance boundary (see "Which gates
does my ticket need?"). Two owners, two distinct calls. Both must approve;
either can request changes.

- **Ram = engineering-judgement gate.** Owns: architecture layer structure,
  cross-module dependencies, schema changes, external paid dependencies, large
  refactors, technical risk. Ram asks: is this the right engineering decision,
  and is the blast radius acceptable?
- **Ali = product gate.** Owns: scope, product fit, contract shape, stakeholder
  commitments, cost model. Ali asks: is this the right thing to build, in scope,
  and the right contract to commit to?

Gate 2 is deliberately two keys: Ram cannot clear the product call and Ali
cannot clear the engineering call. Both signatures, or the gate stays shut.

## Which gates does my ticket need?

| Ticket type | Gates required |
|---|---|
| Local, reversible implementation (naming, helpers, tests, localized bug fix) | Gate 1 only |
| New doc, diagram, or UI surface | Gate 1 only |
| Touches a governance boundary (architecture, schema, paid dependency, compliance/security, production infra, cost model, refactor over 25%, external commitment) | Gate 1, then Gate 2 |
| Ambiguous or unsure | Default to Gate 1 then Gate 2 |

When unsure, default to Gate 2. Over-gating is cheap; under-gating is a
governance defect.

## The gate process (mechanical: Claude Code follows this exactly)

1. Reach the layer's Definition of Done: tests pass, `tsc --noEmit` green, no
   secrets, PROGRESS.md updated with evidence, assumptions logged.
2. Post the artifact in the ticket: the finished work (doc, diagram, diff
   summary, or deploy URL) as a comment, headed "ready for Gate N review" with
   the verification evidence attached.
3. Tag the gatekeeper by name in that comment: Karun for Gate 1; Ram and Ali
   for Gate 2.
4. Halt. Claude Code stops work on this ticket. It does not self-close, and it
   does not start dependent work that assumes approval.
5. Gatekeeper reviews and comments one of two verdicts: Approve (clears the
   gate) or Request changes (lists what to fix).
6. On approve, work resumes. If Gate 1 just cleared and the ticket also needs
   Gate 2, repeat steps 2 to 5 for Gate 2. The gate owner then closes the ticket
   or authorizes closure.
7. On request changes, the builder revises and returns to step 2. No partial
   credit; the gate re-runs from the artifact post.

Sequence rule: Gate 1 clears before Gate 2 opens. A ticket never reaches Ram and
Ali with unresolved design or documentation drift.

## Exception path: gatekeeper unavailable

No gate may be silently skipped. When a tagged gatekeeper does not respond:

1. Wait window: 2 business days from the tag for a project ticket; 1 business
   day if the ticket is marked urgent or is past due.
2. Backup reviewer: Gate 1 (Karun absent): Ram may stand in for design/doc
   review, or the ticket holds. Gate 2: a single gatekeeper never covers both
   roles. Ram cannot clear the product call alone and Ali cannot clear the
   engineering call alone; hold or escalate.
3. Escalate per the Escalation Protocol: write `/tmp/escalation.json` (problem
   summary, root cause, options, risk, recommendation, required decision) and
   notify the owner (Mandrill email to ali@colaberry.com until a `notify_owner`
   worker exists). Continue any work not blocked by the gate.
4. Log the exception: record which gate stalled, when it was tagged, and the
   escalation reference, so the audit trail shows why the delay was safe.

Never auto-approve. An absent gatekeeper produces an escalation, never a
self-granted pass. The 2026-06-22 auto-pass that corrupted a stakeholder's name
is the precedent this rule exists to prevent.

## Closure guardrail (fixes the 2026-06-18 Gate-1 bypass)

On 2026-06-18 an automated run closed all 13 audited backlog tickets about one
minute after they were created, bypassing the explicit "Ali signs off before any
closure" gate. Rule, enforced from now on:

1. No automated closure of a ticket whose description names an open Gate 1 or
   Gate 2. The gate owner closes it, or explicitly authorizes closure, first.
2. Automation posts progress; humans close gated tickets. For project tickets,
   an agent posts a "ready for Gate N review" comment with verification evidence
   and leaves the ticket open. It does not self-close.
3. Only the personal session anchor may auto-close (confidence >= 0.85), per the
   existing Op 4 doctrine.
4. Every automated closure logs its reason and the gate it verified as
   satisfied, so the audit trail shows why it was safe.

## Definition of Done (per CLAUDE.md)

A ticket is ready for its gate, not closed by the builder, only when all of the
following hold: tests exist and pass at the layer minimum; `tsc --noEmit` is
green; no secrets introduced; PROGRESS.md updated with verification evidence;
assumptions logged; no unresolved governance boundary crossed.
