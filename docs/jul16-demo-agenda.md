# Jul 16 demo agenda (Thursday 10:00 CST)

One page. Two tracks run in parallel and meet in the middle: the forward track
takes a broker email to a tendered load; the backward track bills a delivered
load. Each item below is a Given / When / Then you can check live. Everything is
deterministic and runs with no network.

**Run it live:** `npx ts-node --transpile-only scripts/shipces-demo/forwardTrackDemo.ts`
**Open the artifacts:** the five files in `docs/demo-artifacts/`.

## Agenda (about 20 minutes)

| # | Segment | What Brett sees | Artifact |
|---|---|---|---|
| 1 | Forward: email to RFQ | The URGENT sprinter email becomes one canonical RFQ | ShipCES-RFQ-Card.html |
| 2 | Forward: idempotency | The identical email returns the same RFQ, no duplicate | ShipCES-Forward-Storyboard.html |
| 3 | Forward: stage + tender | The won RFQ is staged, priced 2400, and tendered EDI 910 | live demo, stage 3 |
| 4 | Backward: BMS on fake data | A delivered load bills itself: invoice AF-INV-0001 = 2982 | ShipCES-BMS-Demo.html |
| 5 | Backward: fail-closed | With no linehaul, BMS refuses to issue | ShipCES-BMS-Demo.html |
| 6 | Architecture | The four layers, the 15-state lifecycle, the agent map | ShipCES-Architecture.html |
| 7 | Sign-off | Brett approves or requests changes per deliverable | delivery report |

## The two demo scripts (given / when / then)

**Forward track (RMS/W1).** Given the "URGENT sprinter" email; When it is
ingested; Then one canonical RFQ is created (El Paso to Detroit, sprinter,
multi-option service types EXPEDITE_EXCLUSIVE + EXPEDITE_SOLO + EXPEDITE_TEAM +
ELTL + FTL, confidence 0.9); And re-ingesting the identical email returns the
same RFQ with no duplicate.

**Backward track (BMS).** Given a delivered shipment with a POD; When BMS runs on
fake data; Then invoice AF-INV-0001 is produced (linehaul 2400 + 18% fuel 432 +
detention 150 = 2982); And with no linehaul it refuses to issue.

## What this demo is and is not

- It IS the real code path (services/rms, oms, tms, bms, adapters), deterministic and test-pinned (AF-INV-0001 = 2982 is asserted in forwardChain.test.ts).
- It is NOT yet on live DAT data (mock engine, pending the DAT API) and the BMS field detail (accessorial codes, fuel model) is a scaffold pending Brett's invoice-anatomy walkthrough.

## The ask from Brett on the call

1. Approve the forward and backward tracks, or name what to change.
2. Provision the DAT user-level API (via Jen) so sourcing goes live.
3. Book the invoice-anatomy walkthrough so BMS moves past fake data.
