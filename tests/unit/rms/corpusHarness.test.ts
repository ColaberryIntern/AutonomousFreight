/**
 * RFQ regression harness against the real ShipCES email corpus (BC RMS S10 / D33).
 *
 * What this is: 35 real broker RFQ emails run through the actual RMS parse chain,
 * scored on what we extracted and where we routed. It is the first test in this
 * repo that measures the parser against production email rather than fixtures we
 * wrote ourselves, so it is the only one that can tell us the truth about
 * accuracy.
 *
 * Corpus provenance: fetched read-only from Karun's ShipCES_EmailParsing repo by
 * `scripts/corpus/fetchCorpus.js`. The emails are real customer RFQs and are
 * deliberately NOT committed; only `tests/fixtures/corpus-manifest.json` (SHA-256
 * hashes + non-identifying metadata) is. This suite SKIPS cleanly when the corpus
 * is absent so a fresh clone or CI without upstream access still goes green.
 *
 * Thresholds below are pinned to MEASURED baselines, not aspirations. They exist
 * to catch regressions. Raising them is the job of the RMS S1-S9 tickets (LLM
 * extractor as default, sentiment timing, locale dates, and so on); when one of
 * those lands, re-measure and raise the floor deliberately.
 *
 * Failure path note: a parse that throws is a defect, so every email is asserted
 * to return a typed result rather than raise. Emails we cannot understand must
 * route to human review, never fail silently or invent data.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { parseEml } from '../../../services/adapters/src/email/emlParser';
import { parseEmailToRfq } from '../../../services/rms/src/parser/emailParser';
import type { InboundEmail } from '../../../services/adapters/src/email/emailAdapter';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CORPUS_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'corpus');
const MANIFEST_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'corpus-manifest.json');

interface ManifestFile {
  localFile: string;
  upstreamPath: string;
  sha256: string;
  kind: 'real' | 'scenario';
  scenarioId: string | null;
  language: string | null;
  tags: string[];
  expectedState: string | null;
}

const manifest: { files: ManifestFile[] } | null = fs.existsSync(MANIFEST_PATH)
  ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  : null;

const corpusPresent =
  manifest !== null &&
  fs.existsSync(CORPUS_DIR) &&
  manifest.files.some((f) => fs.existsSync(path.join(CORPUS_DIR, f.localFile)));

/**
 * Upstream's state machine is not ours, but both answer the same underlying
 * question: does this email carry enough to quote, or must a human fill gaps?
 * That is the only claim we cross-check, and it is the D4 must-have validator.
 */
const EXPECT_COMPLETE = new Set(['ready_to_quote', 'awarded']);
const EXPECT_INCOMPLETE = new Set(['sent_missing_data', 'rfq_start']);

interface Score {
  file: string;
  kind: string;
  language: string | null;
  expectedState: string | null;
  parsed: boolean;
  errors: string[];
  origin: boolean;
  destination: boolean;
  weight: boolean;
  equipment: boolean;
  pickupDate: boolean;
  confidence: number;
  needsHumanReview: boolean;
  status: string;
}

function loadEmail(f: ManifestFile): InboundEmail {
  const raw = fs.readFileSync(path.join(CORPUS_DIR, f.localFile), 'latin1');
  const e = parseEml(raw, { fallbackReceivedAt: '2026-01-01T00:00:00.000Z' });
  return {
    messageId: e.messageId || `corpus-${f.localFile}`,
    from: e.from,
    to: e.to.length > 0 ? e.to : ['quotes@shipces.com'],
    subject: e.subject,
    body: e.body,
    receivedAt: e.receivedAt,
    hasAttachments: e.hasAttachments,
  };
}

function score(f: ManifestFile): Score {
  const email = loadEmail(f);
  const result = parseEmailToRfq(email);
  const base = {
    file: f.localFile,
    kind: f.kind,
    language: f.language,
    expectedState: f.expectedState,
  };

  if (!result.ok) {
    return {
      ...base,
      parsed: false,
      errors: result.errors,
      origin: false,
      destination: false,
      weight: false,
      equipment: false,
      pickupDate: false,
      confidence: 0,
      needsHumanReview: true,
      status: 'PARSE_FAILED',
    };
  }

  const rfq = result.value.rfq;
  const stops = [...rfq.shipment.stops].sort((a, b) => a.sequence - b.sequence);
  const pickup = stops[0];
  const drop = stops[stops.length - 1];
  const commodity = rfq.shipment.commodities[0];

  // NOTE on what counts as "extracted". The contract requires at least one
  // commodity, one equipment option and two stops, so the assembler always fills
  // those slots. Presence of the array therefore proves nothing. We score the
  // signal INSIDE it: a resolved city, a real weight, a real pickup window.
  // Equipment is scored as "not the fallback", since D5 defaults an unknown
  // vehicle to Tractor/FTL and counting that as a hit would flatter the numbers.
  // Weight excludes the WEIGHT_SENTINEL the assembler substitutes on a miss; a
  // 1 lb freight shipment does not exist, so counting it would report 100%.
  return {
    ...base,
    parsed: true,
    errors: [],
    origin: Boolean(pickup?.location?.city),
    destination: Boolean(drop?.location?.city),
    weight: typeof commodity?.weightLb === 'number' && commodity.weightLb > WEIGHT_SENTINEL,
    equipment: rfq.shipment.equipmentOptions.length > 1 || !DEFAULTED_EQUIPMENT.has(equipmentCodeOf(rfq)),
    pickupDate: Boolean(pickup?.timing?.windows?.[0]?.timeStart),
    confidence: rfq.rawExtraction?.overallConfidence ?? 0,
    needsHumanReview: result.value.needsHumanReview,
    status: String(rfq.status),
  };
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

/**
 * D5 defaults an unrecognised vehicle to a tractor/FTL. Counting that as a
 * successful equipment extraction would inflate the score on every email that
 * never mentioned equipment at all, so it is treated as a miss.
 */
const DEFAULTED_EQUIPMENT = new Set(['TRACTOR', 'FTL', 'VAN']);

/**
 * `emailParser.assembleRfq` substitutes `weightLb: p.weightLb ?? 1` when weight
 * extraction misses, so a 1 lb commodity means "we did not find a weight". This
 * sentinel is indistinguishable from real data downstream, which is tracked
 * separately as a defect; here it just must not be scored as a hit.
 */
const WEIGHT_SENTINEL = 1;
const equipmentCodeOf = (rfq: { shipment: { equipmentOptions: { equipmentType: string }[] } }) =>
  String(rfq.shipment.equipmentOptions[0]?.equipmentType ?? '');

(corpusPresent ? describe : describe.skip)('RMS regression harness: real ShipCES corpus (D33)', () => {
  const files = (manifest as { files: ManifestFile[] }).files.filter((f) =>
    fs.existsSync(path.join(CORPUS_DIR, f.localFile))
  );
  let scores: Score[] = [];

  beforeAll(() => {
    scores = files.map(score);
  });

  it('corpus files match the committed manifest hashes (provenance)', () => {
    const bad: string[] = [];
    for (const f of files) {
      const buf = fs.readFileSync(path.join(CORPUS_DIR, f.localFile));
      if (createHash('sha256').update(buf).digest('hex') !== f.sha256) bad.push(f.localFile);
    }
    expect(bad).toEqual([]);
  });

  it('never throws: every email yields a typed result, no exceptions', () => {
    for (const f of files) {
      expect(() => score(f)).not.toThrow();
    }
  });

  it('fails safe: anything we could not understand routes to human review', () => {
    // The cardinal rule. A low-confidence parse may exist, but it must never be
    // presented as quotable. Silent bad data is worse than an escalation.
    const unsafe = scores.filter((s) => !s.needsHumanReview && (!s.origin || !s.destination));
    expect(unsafe.map((s) => s.file)).toEqual([]);
  });

  it('reports the measured baseline', () => {
    const n = scores.length;
    const g = (k: keyof Score) => scores.filter((s) => Boolean(s[k])).length;
    const es = scores.filter((s) => s.language === 'es');
    const en = scores.filter((s) => s.language === 'en');
    const avgConf = Math.round((scores.reduce((a, s) => a + s.confidence, 0) / n) * 100) / 100;
    const bothEnds = scores.filter((s) => s.origin && s.destination).length;

    const lines = [
      '',
      `=== RMS parser vs ${n} real ShipCES RFQ emails ===`,
      `  parsed to contract-valid RFQ : ${g('parsed')}/${n}  (${pct(g('parsed'), n)}%)`,
      `  origin city extracted        : ${g('origin')}/${n}  (${pct(g('origin'), n)}%)`,
      `  destination city extracted   : ${g('destination')}/${n}  (${pct(g('destination'), n)}%)`,
      `  BOTH ends of the lane        : ${bothEnds}/${n}  (${pct(bothEnds, n)}%)   <- the number that matters`,
      `  weight extracted             : ${g('weight')}/${n}  (${pct(g('weight'), n)}%)`,
      `  equipment inferred           : ${g('equipment')}/${n}  (${pct(g('equipment'), n)}%)`,
      `  pickup date extracted        : ${g('pickupDate')}/${n}  (${pct(g('pickupDate'), n)}%)`,
      `  routed to human review       : ${g('needsHumanReview')}/${n}  (${pct(g('needsHumanReview'), n)}%)`,
      `  mean confidence              : ${avgConf}`,
      `  by language: en=${en.length} es=${es.length} unlabeled=${n - en.length - es.length}`,
      '',
    ];
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    const labeled = scores.filter((s) => s.expectedState);
    const complete = labeled.filter((s) => EXPECT_COMPLETE.has(s.expectedState as string));
    const incomplete = labeled.filter((s) => EXPECT_INCOMPLETE.has(s.expectedState as string));
    const agreeComplete = complete.filter((s) => !s.needsHumanReview).length;
    const agreeIncomplete = incomplete.filter((s) => s.needsHumanReview).length;
    // eslint-disable-next-line no-console
    console.log(
      [
        `=== agreement with upstream labels (quotable vs needs-a-human) ===`,
        `  labeled "ready to quote"  : ${agreeComplete}/${complete.length} we also judged quotable`,
        `  labeled "missing data"    : ${agreeIncomplete}/${incomplete.length} we also escalated`,
        '',
      ].join('\n')
    );

    expect(n).toBeGreaterThan(0);
  });

  // --- Regression floors. Pinned to measured values; see file header. ---

  it('extraction floor: lane recall does not regress', () => {
    const n = scores.length;
    const both = scores.filter((s) => s.origin && s.destination).length;
    expect(pct(both, n)).toBeGreaterThanOrEqual(LANE_FLOOR_PCT);
  });

  it('extraction floor: contract-valid parse rate does not regress', () => {
    const n = scores.length;
    expect(pct(scores.filter((s) => s.parsed).length, n)).toBeGreaterThanOrEqual(PARSE_FLOOR_PCT);
  });

  it('upstream agreement floor: incomplete RFQs are escalated', () => {
    const incomplete = scores.filter((s) => s.expectedState && EXPECT_INCOMPLETE.has(s.expectedState));
    if (incomplete.length === 0) return;
    const agree = incomplete.filter((s) => s.needsHumanReview).length;
    expect(pct(agree, incomplete.length)).toBeGreaterThanOrEqual(ESCALATION_FLOOR_PCT);
  });
});

/**
 * Measured 2026-08-06 against the REGEX BASELINE extractor, on 35 real emails:
 *
 *   contract-valid parse   100%    (35/35)
 *   both ends of the lane   34.3%  (12/35)   <- the number that matters
 *   origin city             37.1%  (13/35)
 *   destination city        42.9%  (15/35)
 *   weight                  48.6%  (17/35)
 *   equipment               17.1%  (6/35)
 *   pickup date              0%    (0/35)
 *   escalated to a human    71.4%  (25/35)
 *   mean confidence          0.41
 *
 * These are FLOORS, not targets, set a little under measured so ordinary drift
 * does not fail a build but a real regression does. The corpus is heavily
 * Spanish and cross-border, which is exactly where a US-centric regex gives up;
 * the LLM extractor (RMS S1) is the intended fix. When it becomes the default,
 * re-measure and raise these in the same commit, so a drop always breaks the
 * build rather than quietly eroding.
 */
const LANE_FLOOR_PCT = 30;
const PARSE_FLOOR_PCT = 100;
const ESCALATION_FLOOR_PCT = 60;
