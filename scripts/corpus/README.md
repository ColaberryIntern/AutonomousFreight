# RFQ regression corpus

Real ShipCES broker RFQ emails, used to measure the RMS parser against
production mail instead of fixtures we wrote ourselves. Closes BC RMS S10
(`10095533272`, "Calibrated corpus + regression harness (D33)").

## Quick start

```bash
node scripts/corpus/fetchCorpus.js          # fetch into tests/fixtures/corpus/
npx jest --selectProjects unit --testPathPattern corpusHarness
```

Without the fetch, the harness **skips cleanly**. A fresh clone or a CI runner
with no upstream access still goes green; it just does not measure anything.

## Why the emails are not in this repo

They are real customer RFQs: named shippers, real lanes, real rates. Fine to
calibrate against, not fine to copy into our git history permanently.

So the split is:

| What | Where | Committed |
|---|---|---|
| The emails | `tests/fixtures/corpus/` | No, gitignored |
| SHA-256 hashes + metadata | `tests/fixtures/corpus-manifest.json` | Yes |

The manifest is what makes a run reproducible and auditable. The harness verifies
every file against its hash before scoring, so you can always prove which exact
bytes a number came from without the bytes living here.

## What is in it

35 emails, fetched read-only from `karunswaroop/ShipCES_EmailParsing`:

- **17 real production RFQs** (`emails/`). Unlabeled, so they measure extraction:
  did we find the lane, the weight, the equipment, the date.
- **18 curated scenario emails** across 13 scenarios
  (`tests/fixtures/state_machine_emails/scenarios/`). These carry an
  `expected_state` upstream, so they can actually fail a build.

Deliberately excluded: `emails_backup/` (near-duplicate of `emails/`, would
double-count every score) and two strays with no provenance.

The corpus is heavily Spanish and cross-border. That is not a sampling accident,
it is what ShipCES freight actually looks like, and it is the main reason our
US-centric regex extractor scores as low as it does.

## Reading the numbers

Upstream's state machine is not ours, so the harness only cross-checks the one
question both systems answer: **is this RFQ complete enough to quote, or does a
human have to fill gaps?** That is the D4 must-have validator. Anything more
specific would be comparing two different state vocabularies.

The floors in `tests/unit/rms/corpusHarness.test.ts` are pinned to measured
values, set slightly under so ordinary drift does not fail a build but a real
regression does. When RMS S1 makes the LLM extractor the default, re-measure and
raise the floors **in the same commit**, so accuracy can never quietly erode.

## Upstream is read-only

`fetchCorpus.js` only ever reads. It never writes to Karun's repo. Requires `gh`
authenticated with read access.

```bash
node scripts/corpus/fetchCorpus.js --verify   # check local files against the manifest
```
