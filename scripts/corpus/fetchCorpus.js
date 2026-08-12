#!/usr/bin/env node
/**
 * fetchCorpus.js - pull the RFQ regression corpus from Karun's ShipCES_EmailParsing
 * repo into a LOCAL, GITIGNORED fixtures directory.
 *
 * Why a fetch script instead of committing the emails:
 * these are real customer RFQs (named shippers, real lanes, real rates). They are
 * fine to calibrate against, but committing them would put client data in our git
 * history permanently. So the payload stays out of the repo and only a manifest of
 * SHA-256 hashes plus non-identifying metadata is committed. That keeps the harness
 * reproducible and auditable (you can prove which bytes a run scored against)
 * without us becoming a second home for ShipCES customer data.
 *
 * Read-only against upstream. Never writes to Karun's repo.
 *
 * Usage:
 *   node scripts/corpus/fetchCorpus.js            # fetch + write manifest
 *   node scripts/corpus/fetchCorpus.js --verify   # verify local files vs manifest
 *
 * Requires: gh CLI authenticated with read access to the upstream repo.
 */
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const UPSTREAM = 'karunswaroop/ShipCES_EmailParsing';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CORPUS_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'corpus');
const MANIFEST = path.join(REPO_ROOT, 'tests', 'fixtures', 'corpus-manifest.json');
const VERIFY = process.argv.includes('--verify');

/**
 * Which upstream paths we take, and why.
 *
 * `emails/`  - 17 real production RFQs. Unlabeled, so they measure extraction
 *              (did we find the lane, weight, equipment, date) rather than
 *              end-state correctness.
 * `tests/fixtures/state_machine_emails/scenarios/` - 19 curated emails across 13
 *              scenarios, each carrying an expected state in the upstream
 *              manifest. These are the ones that can actually fail a build.
 *
 * Deliberately NOT taken: `emails_backup/` (near-duplicate of `emails/`, would
 * double-count every score), `test_email.eml` and `script_ocr/email.eml` (strays
 * with no provenance).
 */
const INCLUDE_PREFIXES = ['emails/', 'tests/fixtures/state_machine_emails/scenarios/'];
const UPSTREAM_MANIFEST = 'tests/fixtures/state_machine_emails/manifest.yaml';

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function ghBinary(apiPath) {
  // gh api returns base64 for contents; decode to a Buffer so byte-level hashes
  // match the upstream blob exactly.
  const out = execFileSync('gh', ['api', apiPath, '--jq', '.content'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return Buffer.from(out.replace(/\s+/g, ''), 'base64');
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** Flatten an upstream path to a safe, collision-free local filename. */
function localNameFor(p) {
  return p
    .replace(/^emails\//, 'real__')
    .replace(/^tests\/fixtures\/state_machine_emails\/scenarios\//, 'scenario__')
    .replace(/[\\/]/g, '__')
    .replace(/\s+/g, '_');
}

/**
 * Pull `expected_state` per scenario out of the upstream YAML.
 * Intentionally a narrow reader, not a YAML dependency: we need exactly two
 * fields and the file's shape is fixed.
 */
function parseUpstreamManifest(yaml) {
  const byScenario = {};
  let current = null;
  for (const line of yaml.split(/\r?\n/)) {
    const idm = line.match(/^\s*-\s+id:\s*(\S+)/);
    if (idm) {
      current = idm[1];
      byScenario[current] = { id: current, language: null, tags: [], steps: [] };
      continue;
    }
    if (!current) continue;
    const lang = line.match(/^\s*language:\s*(\S+)/);
    if (lang) byScenario[current].language = lang[1];
    const tags = line.match(/^\s*tags:\s*\[([^\]]*)\]/);
    if (tags) byScenario[current].tags = tags[1].split(',').map((s) => s.trim()).filter(Boolean);
    const file = line.match(/^\s*-\s+file:\s*(\S+)/);
    if (file) byScenario[current].steps.push({ file: file[1], expectedState: null });
    const st = line.match(/^\s*expected_state:\s*(\S+)/);
    if (st && byScenario[current].steps.length > 0) {
      byScenario[current].steps[byScenario[current].steps.length - 1].expectedState = st[1];
    }
  }
  return byScenario;
}

function main() {
  if (VERIFY) return verify();

  console.log(`Fetching corpus from ${UPSTREAM} (read-only)...`);
  const tree = gh(['api', `repos/${UPSTREAM}/git/trees/HEAD?recursive=1`, '--jq', '.tree[].path']);
  const all = tree.split(/\r?\n/).filter(Boolean);
  const wanted = all
    .filter((p) => p.endsWith('.eml'))
    .filter((p) => INCLUDE_PREFIXES.some((pre) => p.startsWith(pre)))
    .sort();

  if (wanted.length === 0) {
    console.error('No matching .eml files found upstream. Check gh auth and repo access.');
    process.exit(1);
  }

  const scenarios = parseUpstreamManifest(
    Buffer.from(
      gh(['api', `repos/${UPSTREAM}/contents/${UPSTREAM_MANIFEST}`, '--jq', '.content']).replace(/\s+/g, ''),
      'base64'
    ).toString('utf8')
  );

  fs.mkdirSync(CORPUS_DIR, { recursive: true });

  const entries = [];
  for (const p of wanted) {
    const buf = ghBinary(`repos/${UPSTREAM}/contents/${encodeURI(p)}`);
    const local = localNameFor(p);
    fs.writeFileSync(path.join(CORPUS_DIR, local), buf);

    const scenarioId = p.startsWith('tests/') ? p.split('/')[4] : null;
    const stepFile = scenarioId ? path.basename(p) : null;
    const sc = scenarioId ? scenarios[scenarioId] : null;
    const step = sc ? sc.steps.find((s) => s.file === stepFile) : null;

    entries.push({
      localFile: local,
      upstreamPath: p,
      sha256: sha256(buf),
      bytes: buf.length,
      kind: scenarioId ? 'scenario' : 'real',
      scenarioId,
      language: sc ? sc.language : null,
      tags: sc ? sc.tags : [],
      expectedState: step ? step.expectedState : null,
    });
    process.stdout.write(`  ${entries.length}/${wanted.length}\r`);
  }

  const manifest = {
    source: { repo: UPSTREAM, note: 'read-only reuse; payload deliberately not committed' },
    fetchedFrom: 'HEAD',
    counts: {
      total: entries.length,
      real: entries.filter((e) => e.kind === 'real').length,
      scenario: entries.filter((e) => e.kind === 'scenario').length,
      labeled: entries.filter((e) => e.expectedState).length,
    },
    files: entries,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`\nWrote ${entries.length} files to tests/fixtures/corpus/ (gitignored)`);
  console.log(`Manifest: tests/fixtures/corpus-manifest.json (committed, hashes only)`);
  console.log(`  real=${manifest.counts.real} scenario=${manifest.counts.scenario} labeled=${manifest.counts.labeled}`);
}

function verify() {
  if (!fs.existsSync(MANIFEST)) {
    console.error('No manifest. Run without --verify first.');
    process.exit(1);
  }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let missing = 0;
  let mismatched = 0;
  for (const f of m.files) {
    const p = path.join(CORPUS_DIR, f.localFile);
    if (!fs.existsSync(p)) {
      missing++;
      continue;
    }
    if (sha256(fs.readFileSync(p)) !== f.sha256) {
      mismatched++;
      console.error(`  hash mismatch: ${f.localFile}`);
    }
  }
  console.log(`verify: ${m.files.length} expected, ${missing} missing, ${mismatched} mismatched`);
  process.exit(missing || mismatched ? 1 : 0);
}

main();
