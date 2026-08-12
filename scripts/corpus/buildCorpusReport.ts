/**
 * buildCorpusReport.ts - render the corpus harness results as a self-contained
 * HTML page.
 *
 * Runs the SAME real parse chain the harness runs (parseEml -> parseEmailToRfq),
 * so the page can never drift from the test. If a number here disagrees with
 * `jest --testPathPattern corpusHarness`, that is a bug in this file, not a
 * difference of opinion.
 *
 * CONFIDENTIAL OUTPUT. The page embeds excerpts of real ShipCES customer email
 * (named shippers, real lanes, real rates). It is written to a local path and is
 * deliberately never published to a hosted URL. Treat the output file the same
 * way the corpus itself is treated: local, not committed, not shared onward
 * without a decision.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/corpus/buildCorpusReport.ts [outDir]
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseEml } from '../../services/adapters/src/email/emlParser';
import { parseEmailToRfq } from '../../services/rms/src/parser/emailParser';
import type { InboundEmail } from '../../services/adapters/src/email/emailAdapter';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CORPUS_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'corpus');
const MANIFEST_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'corpus-manifest.json');

/** Mirrors corpusHarness.test.ts. See that file for why each is defined this way. */
const WEIGHT_SENTINEL = 1;
const DEFAULTED_EQUIPMENT = new Set(['TRACTOR', 'FTL', 'VAN']);

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

interface Row {
  file: string;
  kind: string;
  scenarioId: string | null;
  expectedState: string | null;
  subject: string;
  from: string;
  lang: string;
  bodyExcerpt: string;
  origin: string | null;
  destination: string | null;
  weightLb: number | null;
  equipment: string | null;
  pickupDate: string | null;
  confidence: number;
  needsHumanReview: boolean;
  status: string;
  hitOrigin: boolean;
  hitDest: boolean;
  hitWeight: boolean;
  hitEquip: boolean;
  hitDate: boolean;
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function build(): { rows: Row[]; manifest: { files: ManifestFile[] } } {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as { files: ManifestFile[] };
  const rows: Row[] = [];

  for (const f of manifest.files) {
    const p = path.join(CORPUS_DIR, f.localFile);
    if (!fs.existsSync(p)) continue;
    const buf = fs.readFileSync(p);
    if (createHash('sha256').update(buf).digest('hex') !== f.sha256) {
      throw new Error(`hash mismatch on ${f.localFile}; re-run fetchCorpus.js`);
    }
    const e = parseEml(buf.toString('latin1'), { fallbackReceivedAt: '2026-01-01T00:00:00.000Z' });
    const email: InboundEmail = {
      messageId: e.messageId || `corpus-${f.localFile}`,
      from: e.from,
      to: e.to.length > 0 ? e.to : ['quotes@shipces.com'],
      subject: e.subject,
      body: e.body,
      receivedAt: e.receivedAt,
      hasAttachments: e.hasAttachments,
    };
    const res = parseEmailToRfq(email);

    const base = {
      file: f.localFile,
      kind: f.kind,
      scenarioId: f.scenarioId,
      expectedState: f.expectedState,
      subject: e.subject,
      from: e.from,
      bodyExcerpt: e.body.replace(/\r/g, '').split('\n').filter((l) => l.trim()).slice(0, 14).join('\n').slice(0, 900),
    };

    if (!res.ok) {
      rows.push({
        ...base,
        lang: f.language ?? '?',
        origin: null, destination: null, weightLb: null, equipment: null, pickupDate: null,
        confidence: 0, needsHumanReview: true, status: 'PARSE_FAILED',
        hitOrigin: false, hitDest: false, hitWeight: false, hitEquip: false, hitDate: false,
      });
      continue;
    }

    const rfq = res.value.rfq;
    const stops = [...rfq.shipment.stops].sort((a, b) => a.sequence - b.sequence);
    const pickup = stops[0];
    const drop = stops[stops.length - 1];
    const com = rfq.shipment.commodities[0];
    const equip = String(rfq.shipment.equipmentOptions[0]?.equipmentType ?? '');
    const place = (l: { city?: string; state?: string } | undefined) =>
      l?.city ? [l.city, l.state].filter(Boolean).join(', ') : null;

    rows.push({
      ...base,
      lang: rfq.language ?? f.language ?? '?',
      origin: place(pickup?.location),
      destination: place(drop?.location),
      weightLb: typeof com?.weightLb === 'number' && com.weightLb > WEIGHT_SENTINEL ? com.weightLb : null,
      equipment: equip,
      pickupDate: pickup?.timing?.windows?.[0]?.timeStart ?? null,
      confidence: rfq.rawExtraction?.overallConfidence ?? 0,
      needsHumanReview: res.value.needsHumanReview,
      status: String(rfq.status),
      hitOrigin: Boolean(pickup?.location?.city),
      hitDest: Boolean(drop?.location?.city),
      hitWeight: typeof com?.weightLb === 'number' && com.weightLb > WEIGHT_SENTINEL,
      hitEquip: rfq.shipment.equipmentOptions.length > 1 || !DEFAULTED_EQUIPMENT.has(equip),
      hitDate: Boolean(pickup?.timing?.windows?.[0]?.timeStart),
    });
  }
  return { rows, manifest };
}

// --- rendering -------------------------------------------------------------

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

/**
 * Horizontal bar, single series, sequential single hue. One series carries no
 * legend (the title names it); every bar is direct-labeled, which is also the
 * secondary encoding that keeps it readable without color.
 */
function barChart(items: { label: string; n: number; total: number; note?: string }[]): string {
  const rows = items
    .map((it) => {
      const p = pct(it.n, it.total);
      const w = Math.max(p, 0.6); // a zero bar still needs a visible stub
      return `<div class="bar-row" tabindex="0" role="listitem"
        aria-label="${esc(it.label)}: ${p} percent, ${it.n} of ${it.total}"
        data-tip="${esc(it.label)}: ${it.n} of ${it.total} emails (${p}%)${it.note ? ' · ' + esc(it.note) : ''}">
        <div class="bar-label">${esc(it.label)}</div>
        <div class="bar-track"><div class="bar-fill${p === 0 ? ' zero' : ''}" style="width:${w}%"></div></div>
        <div class="bar-val">${p}%<span class="bar-sub">${it.n}/${it.total}</span></div>
      </div>`;
    })
    .join('\n');
  return `<div class="bars" role="list">${rows}</div>`;
}

function statusCell(hit: boolean, value: string | null): string {
  // Status never rides on color alone: glyph + text label accompany the hue.
  return hit
    ? `<span class="st ok"><span class="gly" aria-hidden="true">&#10003;</span>${esc(value ?? 'found')}</span>`
    : `<span class="st miss"><span class="gly" aria-hidden="true">&#8212;</span>missed</span>`;
}

function render(rows: Row[]): string {
  const n = rows.length;
  const c = {
    parsed: rows.filter((r) => r.status !== 'PARSE_FAILED').length,
    origin: rows.filter((r) => r.hitOrigin).length,
    dest: rows.filter((r) => r.hitDest).length,
    both: rows.filter((r) => r.hitOrigin && r.hitDest).length,
    weight: rows.filter((r) => r.hitWeight).length,
    equip: rows.filter((r) => r.hitEquip).length,
    date: rows.filter((r) => r.hitDate).length,
    hitl: rows.filter((r) => r.needsHumanReview).length,
  };
  const meanConf = Math.round((rows.reduce((a, r) => a + r.confidence, 0) / n) * 100) / 100;
  const es = rows.filter((r) => r.lang === 'es').length;

  // Worked examples: one clean win, one lane miss, one Spanish miss. Chosen by
  // rule rather than hand-picked so the page cannot flatter itself.
  const win = rows.find((r) => r.hitOrigin && r.hitDest && r.hitWeight);
  const laneMiss = rows.find((r) => !r.hitOrigin && !r.hitDest && r.lang !== 'es');
  const esMiss = rows.find((r) => r.lang === 'es' && (!r.hitOrigin || !r.hitDest));
  const examples = [
    { tag: 'Parsed cleanly', r: win },
    { tag: 'Lane missed', r: laneMiss },
    { tag: 'Spanish, lane missed', r: esMiss },
  ].filter((x): x is { tag: string; r: Row } => Boolean(x.r));

  const tableRows = rows
    .map(
      (r) => `<tr>
      <td class="sub">${esc(r.subject || '(no subject)')}
        <span class="meta">${esc(r.kind === 'scenario' ? r.scenarioId ?? 'scenario' : 'real RFQ')} &middot; ${esc(r.lang)}</span></td>
      <td>${statusCell(r.hitOrigin, r.origin)}</td>
      <td>${statusCell(r.hitDest, r.destination)}</td>
      <td>${statusCell(r.hitWeight, r.weightLb ? r.weightLb.toLocaleString() + ' lb' : null)}</td>
      <td>${statusCell(r.hitEquip, r.equipment)}</td>
      <td>${statusCell(r.hitDate, r.pickupDate ? r.pickupDate.slice(0, 10) : null)}</td>
      <td class="num">${r.confidence.toFixed(2)}</td>
      <td>${
        r.needsHumanReview
          ? '<span class="st route"><span class="gly" aria-hidden="true">&#9873;</span>human</span>'
          : '<span class="st ok"><span class="gly" aria-hidden="true">&#10003;</span>auto</span>'
      }</td>
    </tr>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RMS parser vs real ShipCES email</title>
<style>
  :root{
    --surface:#ffffff; --plane:#f7fafc; --border:#e2e8f0;
    --ink:#1a365d; --text:#2d3748; --muted:#718096;
    --series:#2b6cb0;            /* single-hue sequential, validated light */
    --ok:#38a169;                /* status good, always paired with a glyph */
    --crit:#e53e3e;              /* lone status accent, never beside amber */
    --track:#edf2f7;
  }
  :root:not([data-theme="light"]){ }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --surface:#1b2029; --plane:#14181f; --border:#2c3440;
      --ink:#e8eef6; --text:#cbd5e1; --muted:#8b98a9;
      --series:#3785cf;          /* validated dark step */
      --ok:#2fa571; --crit:#f07070; --track:#252c37;
    }
  }
  :root[data-theme="dark"]{
    --surface:#1b2029; --plane:#14181f; --border:#2c3440;
    --ink:#e8eef6; --text:#cbd5e1; --muted:#8b98a9;
    --series:#3785cf; --ok:#2fa571; --crit:#f07070; --track:#252c37;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--plane);color:var(--text);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .wrap{max-width:1120px;margin:0 auto;padding:0 20px 72px}
  header{background:var(--ink);color:var(--surface);padding:34px 20px 28px}
  :root[data-theme="dark"] header, :root:not([data-theme="light"]) header{color:#0f1319}
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]) header{background:#e8eef6;color:#14181f}}
  header .in{max-width:1120px;margin:0 auto}
  header h1{margin:0 0 6px;font-size:25px;letter-spacing:-.3px}
  header p{margin:0;opacity:.85;font-size:14px;max-width:76ch}
  .conf{display:inline-block;margin-top:14px;font-size:11.5px;font-weight:700;letter-spacing:.7px;
    border:1px solid currentColor;border-radius:4px;padding:3px 9px;opacity:.9}
  h2{font-size:19px;color:var(--ink);margin:40px 0 3px;letter-spacing:-.2px}
  h2+.sub{margin:0 0 16px;color:var(--muted);font-size:13.5px;max-width:80ch}
  .hero{background:var(--surface);border:1px solid var(--border);border-radius:12px;
    padding:26px 28px;margin-top:26px;display:flex;gap:30px;align-items:center;flex-wrap:wrap}
  .hero .fig{font-size:60px;line-height:1;font-weight:680;color:var(--series);letter-spacing:-2px}
  .hero .txt{flex:1;min-width:280px}
  .hero .txt b{color:var(--ink)}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px;margin-top:14px}
  .kpi{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
  .kpi b{display:block;font-size:26px;font-weight:660;color:var(--ink);line-height:1.15}
  .kpi span{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 22px}
  .bars{display:flex;flex-direction:column;gap:11px}
  .bar-row{display:grid;grid-template-columns:190px 1fr 92px;gap:14px;align-items:center;
    border-radius:6px;padding:2px 4px;outline:none}
  .bar-row:hover,.bar-row:focus-visible{background:var(--plane);box-shadow:0 0 0 2px var(--series)}
  .bar-label{font-size:13.5px;color:var(--text)}
  .bar-track{background:var(--track);border-radius:4px;height:16px;position:relative}
  .bar-fill{background:var(--series);height:100%;border-radius:0 4px 4px 0;min-width:3px}
  .bar-fill.zero{background:var(--crit)}
  .bar-val{text-align:right;font-variant-numeric:tabular-nums;font-weight:650;color:var(--ink);font-size:14px}
  .bar-sub{display:block;font-size:11px;font-weight:400;color:var(--muted)}
  .flag{border-left:3px solid var(--crit);background:var(--surface);border-radius:0 10px 10px 0;
    border-top:1px solid var(--border);border-right:1px solid var(--border);border-bottom:1px solid var(--border);
    padding:16px 20px;margin-top:14px}
  .flag h3{margin:0 0 7px;font-size:15px;color:var(--crit)}
  .flag code{background:var(--plane);padding:1px 6px;border-radius:4px;font-size:12.5px}
  .ex{display:grid;grid-template-columns:1fr 300px;gap:0;background:var(--surface);
    border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:14px}
  .ex .mail{padding:16px 20px;border-right:1px solid var(--border);min-width:0}
  .ex .out{padding:16px 20px;background:var(--plane)}
  .ex .tag{font-size:10.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;
    padding:2px 8px;border-radius:4px;color:#fff;background:var(--series)}
  .ex .tag.bad{background:var(--crit)}
  .ex h4{margin:9px 0 4px;font-size:14.5px;color:var(--ink)}
  .ex .from{font-size:12px;color:var(--muted);margin-bottom:10px}
  .ex pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;
    color:var(--text);max-height:230px;overflow:auto;background:var(--plane);padding:11px 13px;border-radius:7px}
  .ex .out div{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--border);font-size:13px}
  .ex .out div:last-child{border-bottom:0}
  .ex .out .k{color:var(--muted)}
  .tablewrap{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:13px;min-width:900px}
  th{position:sticky;top:0;background:var(--plane);text-align:left;padding:10px 12px;font-size:10.5px;
    text-transform:uppercase;letter-spacing:.6px;color:var(--muted);border-bottom:1px solid var(--border);font-weight:650}
  td{padding:8px 12px;border-bottom:1px solid var(--border);vertical-align:top}
  tr:last-child td{border-bottom:0}
  tbody tr:hover{background:var(--plane)}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  td.sub{max-width:330px}
  .meta{display:block;font-size:11px;color:var(--muted);margin-top:2px}
  .st{display:inline-flex;align-items:center;gap:5px;font-size:12.5px}
  .st .gly{font-weight:700}
  .st.ok{color:var(--ok)} .st.miss{color:var(--muted)} .st.route{color:var(--crit)}
  #tip{position:fixed;z-index:20;pointer-events:none;opacity:0;transition:opacity .12s;
    background:var(--ink);color:var(--surface);padding:7px 11px;border-radius:7px;font-size:12.5px;max-width:300px}
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]) #tip{background:#e8eef6;color:#14181f}}
  footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--border);font-size:12.5px;color:var(--muted)}
  @media (max-width:760px){ .ex{grid-template-columns:1fr} .ex .mail{border-right:0;border-bottom:1px solid var(--border)}
    .bar-row{grid-template-columns:130px 1fr 78px} }
</style></head><body>
<header><div class="in">
  <h1>RMS parser vs real ShipCES email</h1>
  <p>${n} real broker RFQs run through the actual parse chain. Every previous accuracy figure in this project came from fixtures we wrote ourselves. This is the first measured against email real customers sent.</p>
  <div class="conf">CONFIDENTIAL &middot; CONTAINS REAL CUSTOMER DATA &middot; LOCAL FILE, DO NOT FORWARD</div>
</div></header>

<div class="wrap">

  <div class="hero">
    <div class="fig">${pct(c.both, n)}%</div>
    <div class="txt">
      <b>of emails gave us both ends of the lane.</b> That is the number that matters, because
      without an origin and a destination there is nothing to price. ${c.both} of ${n}.
      The rest were correctly handed to a human rather than guessed at.
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><b>${n}</b><span>real emails</span></div>
    <div class="kpi"><b>${pct(c.parsed, n)}%</b><span>parsed to contract</span></div>
    <div class="kpi"><b>${pct(c.hitl, n)}%</b><span>sent to a human</span></div>
    <div class="kpi"><b>${meanConf}</b><span>mean confidence</span></div>
    <div class="kpi"><b>${es}</b><span>Spanish emails</span></div>
  </div>

  <h2>What we extract, field by field</h2>
  <p class="sub">Share of the ${n} emails where the parser found each field. Hover or focus a bar for counts. Single measure, so no legend is needed.</p>
  <div class="card">
    ${barChart([
      { label: 'Both ends of lane', n: c.both, total: n, note: 'the one that gates pricing' },
      { label: 'Destination city', n: c.dest, total: n },
      { label: 'Origin city', n: c.origin, total: n },
      { label: 'Weight', n: c.weight, total: n, note: 'excludes the 1 lb sentinel' },
      { label: 'Equipment', n: c.equip, total: n, note: 'excludes the FTL fallback' },
      { label: 'Pickup date', n: c.date, total: n, note: 'regex only matches ISO dates' },
    ])}
  </div>

  <div class="flag">
    <h3>Pickup date is zero, and that is real</h3>
    <p style="margin:0">Our extractor only recognises ISO dates like <code>2026-05-25</code>. This corpus writes
    <code>10/04/2025</code>, <code>hoy</code> and <code>ma&ntilde;ana</code>. Not one email in ${n} matched. A fixture we wrote
    ourselves would have used an ISO date and hidden this completely.</p>
  </div>

  <div class="flag">
    <h3>A defect this corpus exposed</h3>
    <p style="margin:0 0 8px">When weight extraction misses, the assembler substitutes
    <code>weightLb: p.weightLb ?? 1</code>. Downstream, a 1 lb commodity is indistinguishable from a real
    weight and it satisfies the schema check silently, so a failed extraction can reach pricing looking like data.</p>
    <p style="margin:0">The first measurement of this corpus read <b>weight: 100%</b> because of that sentinel.
    The true figure is ${pct(c.weight, n)}%. Left unfixed on purpose: making weight properly optional is a
    contract change and belongs in its own ticket.</p>
  </div>

  <h2>Three emails, end to end</h2>
  <p class="sub">Chosen by rule, not hand-picked: the first clean parse, the first English lane miss, the first Spanish lane miss.</p>
  ${examples
    .map(
      (x) => `<div class="ex">
      <div class="mail">
        <span class="tag${x.tag.includes('missed') ? ' bad' : ''}">${esc(x.tag)}</span>
        <h4>${esc(x.r.subject || '(no subject)')}</h4>
        <div class="from">${esc(x.r.from)}</div>
        <pre>${esc(x.r.bodyExcerpt)}</pre>
      </div>
      <div class="out">
        <div><span class="k">Origin</span>${statusCell(x.r.hitOrigin, x.r.origin)}</div>
        <div><span class="k">Destination</span>${statusCell(x.r.hitDest, x.r.destination)}</div>
        <div><span class="k">Weight</span>${statusCell(x.r.hitWeight, x.r.weightLb ? x.r.weightLb.toLocaleString() + ' lb' : null)}</div>
        <div><span class="k">Equipment</span>${statusCell(x.r.hitEquip, x.r.equipment)}</div>
        <div><span class="k">Pickup date</span>${statusCell(x.r.hitDate, x.r.pickupDate ? x.r.pickupDate.slice(0, 10) : null)}</div>
        <div><span class="k">Confidence</span><b>${x.r.confidence.toFixed(2)}</b></div>
        <div><span class="k">Routed</span>${
          x.r.needsHumanReview
            ? '<span class="st route"><span class="gly">&#9873;</span>human review</span>'
            : '<span class="st ok"><span class="gly">&#10003;</span>auto</span>'
        }</div>
      </div>
    </div>`
    )
    .join('\n')}

  <h2>All ${n} emails</h2>
  <p class="sub">The full table behind every number above. Status is glyph plus label, so nothing depends on color alone.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>Email</th><th>Origin</th><th>Destination</th><th>Weight</th><th>Equipment</th><th>Pickup date</th><th class="num">Conf</th><th>Routed</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table></div>

  <footer>
    Generated by <code>scripts/corpus/buildCorpusReport.ts</code> from the same parse chain as
    <code>tests/unit/rms/corpusHarness.test.ts</code>; every file verified against its SHA-256 in
    <code>tests/fixtures/corpus-manifest.json</code> before scoring. Corpus fetched read-only from
    karunswaroop/ShipCES_EmailParsing. The emails themselves are gitignored and never committed.
    Regex baseline extractor. Re-generate after any parser change.
  </footer>
</div>

<div id="tip" role="status"></div>
<script>
  // Hover layer. An HTML chart is interactive by default; bars carry counts on
  // hover and on keyboard focus, so the detail is not mouse-only.
  (function () {
    var tip = document.getElementById('tip');
    function show(el, x, y) {
      var t = el.getAttribute('data-tip'); if (!t) return;
      tip.textContent = t; tip.style.opacity = '1';
      var r = tip.getBoundingClientRect();
      tip.style.left = Math.min(x + 14, window.innerWidth - r.width - 12) + 'px';
      tip.style.top = Math.max(y - r.height - 12, 8) + 'px';
    }
    function hide() { tip.style.opacity = '0'; }
    document.querySelectorAll('[data-tip]').forEach(function (el) {
      el.addEventListener('mousemove', function (e) { show(el, e.clientX, e.clientY); });
      el.addEventListener('mouseleave', hide);
      el.addEventListener('focus', function () {
        var r = el.getBoundingClientRect(); show(el, r.left + 40, r.top + r.height);
      });
      el.addEventListener('blur', hide);
    });
  })();
</script>
</body></html>`;
}

const { rows } = build();
const html = render(rows);

/**
 * Dash guard. Our own prose must carry zero em/en-dashes. Quoted customer email
 * is verbatim source and is exempt, so the check strips the <pre> excerpt blocks
 * (and the &#8212; entity used as a deliberate "missed" glyph) before counting.
 * A non-zero result therefore means WE wrote one.
 */
const DASH = new RegExp('[' + String.fromCharCode(8212) + String.fromCharCode(8211) + ']', 'g');
const ourProse = html.replace(/<pre>[\s\S]*?<\/pre>/g, '').replace(/&#8212;/g, '');
const dashHits = (ourProse.match(DASH) || []).length;
if (dashHits > 0) {
  console.error(`ABORT: ${dashHits} em/en-dash in our own prose`);
  process.exit(1);
}

const outDir = process.argv[2] || path.join(os.homedir(), 'Downloads');
const out = path.join(outDir, 'ShipCES-Corpus-Accuracy.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB, ${rows.length} emails)`);
console.log(`literal em/en-dash count: ${dashHits}`);
