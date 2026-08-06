# Managing-Project Integration

Per Ali (Jun 18): "there is a process that is managed by a different project that
will manage this project, so make sure you build it in a way where you and this
system work together." This doc is the integration map between the ShipCES
Autonomous Brokerage project and the managing project.

## Anchors

- **This project**: Basecamp bucket `47126345` (ShipCES - Autonomous Brokerage),
  todoset `9850502547`, 9 active lists (RMS, OMS, TMS, BMS, Sense, Governance,
  Architecture, Cadence, Backlog).
- **Managing project**: Basecamp bucket `7463955`, anchor todo `10006979189`.

## How they work together

1. **Weekly status sync (recurring Thursday).** After each Thursday demo and
   digest, post a one-paragraph status to managing-project todo `10006979189`:
   what we demoed, decisions taken, blockers, next milestone. This is the
   heartbeat the parent process reads.
2. **Escalation up.** Anything escalation-worthy (see `escalation-protocol.md`)
   posts to the same anchor as a decision request, not just an FYI.
3. **Direction down.** Strategic direction from the managing project enters here
   as new tickets in the appropriate layer list, with an ADR if it changes
   architecture.
4. **Status roll-up is one paragraph, not a data dump.** The parent process wants
   demoed / decided / blocked / next, not a ticket-by-ticket export.

## Contract between the two systems

- This project owns execution and reports status; it does not make
  cross-project strategic calls unilaterally (those go up as escalations).
- The managing project owns prioritization across projects and unblocks
  decisions this project escalates.
- Correlation: every escalation and status post references this project's bucket
  id (`47126345`) so the parent can trace it back without detective work.
