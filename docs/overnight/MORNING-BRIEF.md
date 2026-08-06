# ShipCES overnight brief - Jul 16 demo prep

Loop Architect framework (Loop Spec, maker/checker, hard stops). Built and drafted
everything; on your go the report was deployed and the Gate-1 package posted to
Karun. Still held for you: the two client emails to Brett (cc Jen). No ticket
closures. Today is Wed 2026-07-15; the demo is tomorrow, Thu 2026-07-16 10:00 CST.

**Gates:** tsc -b exit 0 | jest unit exit 0 | em/en-dash 0 across all output and
source | independent verifier PASS.

## Do these when you wake up

1. Open the five artifacts in `docs/demo-artifacts/` (also in Downloads): invoice, BMS demo, RFQ card, storyboard, architecture.
2. Record the 60-second forward clip down `ShipCES-Forward-Storyboard.html`, or run `npx ts-node --transpile-only scripts/shipces-demo/forwardTrackDemo.ts`.
3. Send the two held emails after review: `docs/drafts/brett-dat-api-press.md` and `docs/drafts/brett-invoice-anatomy-questionnaire.md`.
4. Send the agenda `docs/jul16-demo-agenda.md` to Brett.
5. DONE on your go: Gate-1 package posted to Karun (BC 10081574109, comment 10099517830). Ticket left open.
6. DONE on your go: report deployed and cron repaired (it had been broken since Jul 12); validated with a --test send to you. New report sends Thu 7:55am CT.

## The 10 steps

| # | Step | State | Where |
|---|---|---|---|
| 1 | Flagship invoice AF-INV-0001 | DONE | `docs/demo-artifacts/ShipCES-Invoice-AF-INV-0001.html` ($2,982) |
| 2 | BMS demo screen (fail-closed) | DONE | `ShipCES-BMS-Demo.html` |
| 3 | Email to RFQ clip + RFQ card | BUILT | `ShipCES-RFQ-Card.html` + `ShipCES-Forward-Storyboard.html` (you record) |
| 4 | Deploy redesigned report | DONE | deployed + cron repaired; sends Thu 7:55am CT |
| 5 | Jul 16 demo agenda | DONE | `docs/jul16-demo-agenda.md` (send held) |
| 6 | Karun Gate-1 review | POSTED | posted to Karun (BC comment 10099517830); ticket open |
| 7 | Press Brett for DAT API | DRAFT | `docs/drafts/brett-dat-api-press.md` (send held) |
| 8 | Brett invoice-anatomy walkthrough | DRAFT | `docs/drafts/brett-invoice-anatomy-questionnaire.md` (send held) |
| 9 | Refresh diagrams + PMBOK ingest | DIAGRAMS | `docs/diagrams/` done; PMBOK PDF still needed from Brett |
| 10 | Backlog reconcile vs Releases R0-R6 | PARTIAL | two findings below |

## Two backlog findings (one-line fixes to dailyScrum.js)

- **A:** the live "Releases + Demo Schedule (R0 to R6)" list (10095533315) is not in the scrum `LISTS` array, so it is invisible on the report. Add it.
- **B:** `LISTS` references a Phase C list (9850502673) that is no longer live; that row renders NO DATA. Repoint or drop it.

Apply A and B, then run the container `dailyScrum.js --test` for the reconciled live backlog view.

## What is real vs staged

- Real, test-pinned: every artifact value comes from the `services/*` code path; AF-INV-0001 = $2,982 is asserted in `forwardChain.test.ts`.
- Still blocked on a human: BMS field detail (Brett walkthrough), live DAT sourcing (DAT API), PMBOK PDF ingest (the PDF).
