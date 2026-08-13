/**
 * buildScreenMockups.ts - an interactive prototype of the whole cockpit.
 *
 * Two things this has to show that static mockups cannot:
 *   1. Each screen in DETAIL. The left nav works; clicking it switches panes.
 *   2. The applications working TOGETHER. A load-trace bar follows one real load
 *      (AF-2041) across the RMS to OMS to TMS to BMS handoffs, and clicking a
 *      stage jumps to the screen that owns it, so the seams between the four
 *      apps are visible rather than implied.
 *
 * Data is real wherever real data exists: lanes, customers and confidence values
 * come from the ShipCES corpus, the invoice is the real AF-INV-0001 at $2,982
 * from generateInvoice(), the agent roster is the real registry, and the accuracy
 * figures are the measured 35-email baseline. Handoff contracts (EDI 910, 214,
 * 210) are the ones the code actually emits.
 *
 * Self-contained, no dependencies, works offline.
 *
 * Spec: docs/design-system-v2.md
 * Usage: npx ts-node --transpile-only scripts/design/buildScreenMockups.ts [outDir]
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildInbox } from './inboxData';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Kind = 'ok' | 'attn' | 'block' | 'idle';
const GLY: Record<Kind, string> = { ok: '&#10003;', attn: '&#9873;', block: '&#10005;', idle: '&#8226;' };
const chip = (k: Kind, l: string) => `<span class="chip ${k}"><i aria-hidden="true">${GLY[k]}</i>${l}</span>`;
const meter = (v: number) =>
  `<span class="meter ${v >= 0.85 ? 'hi' : v >= 0.6 ? 'mid' : 'lo'}"><span class="mt"><span class="mf" style="width:${Math.round(v * 100)}%"></span></span><b>${v.toFixed(2)}</b></span>`;
const lyr = (l: string) => `<span class="lyr ${l}">${l}</span>`;

/* ------------------------------------------------------------------ screens */

const fld = (k: string, v: string, rule: string, ev: string | null) =>
  `<div class="fl${ev === null ? ' asm' : ''}"><div class="flk">${k}</div>
   <div class="flv">${v}${ev === null ? '<span class="asmt">assumed</span>' : ''}</div>
   <div class="flr"><code>${rule}</code></div>
   <div class="fle">${ev === null ? '<span class="ev none">nothing in the email supports this</span>' : `<span class="ev">&ldquo;${esc(ev)}&rdquo;</span>`}</div></div>`;

const QUEUE = [
  ['Laredo, TX to Nashville, TN', 'Berpar', 'RMS', 0.42, 'Lane found, pickup date missing', 'D4 must-have', '4m', '$2,242'],
  ['Acatl&aacute;n to Atlanta, GA', 'Arizlu', 'RMS', 0.2, 'Spanish body, regex found no lane', 'D14 route', '11m', 'not priced'],
  ['El Paso, TX to Detroit, MI', 'MKS Global', 'OMS', 0.9, 'Quote 3% under margin floor', 'margin gate', '26m', '$2,982'],
  ['Toccoa, GA to Monterrey', 'Hartrodt', 'TMS', 0.61, 'Cross-border, no Monterrey specialist', 'HITL W7', '1h', '$4,180'],
];

const S_QUEUE = `
<div class="kpis">
  <div class="k"><b>25</b><span>auto-cleared today</span><i class="ok">&#10003; no human touched these</i></div>
  <div class="k"><b>4</b><span>waiting on you</span><i class="attn">&#9873; oldest 1h</i></div>
  <div class="k"><b>0.71</b><span>mean confidence</span><i>across 35 parsed</i></div>
  <div class="k"><b>$11,404</b><span>value in queue</span><i>3 of 4 priced</i></div>
</div>
<div class="sec">Needs a human <span class="sec-n">sorted by age, oldest first</span></div>
<div class="q">
${QUEUE.map(([lane, cust, l, c, why, rule, age, val]) => `<div class="qr">
  <span class="lbar ${l}"></span>
  <div class="qm"><div class="ql">${lane}</div><div class="qc">${cust} &middot; ${lyr(String(l))} &middot; ${age} ago &middot; ${val}</div></div>
  <div class="qw">${why}<code>${rule}</code></div>
  <div class="qf">${meter(Number(c))}</div>
  <div class="qa"><button class="b">Override</button><button class="b p">Approve</button></div>
</div>`).join('')}
</div>
<div class="empty-demo"><div class="ed-in">${chip('ok', 'Queue clear')}
  <b>Nothing needs you right now.</b><span>The goal state, not a blank screen. 25 RFQs cleared themselves in the last hour.</span></div></div>`;

const INBOX = buildInbox(12);

/**
 * RFQ intake: the three-pane review workspace.
 *
 * Borrowed wholesale rather than invented, per the brief:
 *  - Rossum / Docsumo / Hyperscience: click a field and the exact source text
 *    highlights in the document. Confidence under threshold flags the field for
 *    review. This is THE established pattern for extraction review and it is
 *    what makes an extraction auditable instead of a guess.
 *  - Drumkit: a triaged inbox with a decision sidebar, so a rep sees what needs
 *    them at a glance rather than reading top to bottom.
 *  - Front / Superhuman: the list, message, context three-pane shape.
 *
 * The emails are REAL, straight from the ShipCES corpus, and so are the parses:
 * the same parseEml to parseEmailToRfq chain the tests run. Where the parser
 * failed, the screen shows it failing.
 */
const S_RFQ = `
<div class="inbox">
  <div class="ib-list">
    <div class="ib-lh"><b>Intake</b><span>${INBOX.filter((i) => i.needsHumanReview).length} need you of ${INBOX.length}</span></div>
    <div class="ib-items" id="ibItems">
    ${INBOX.map((it, n) => `<button class="ib-i${n === 0 ? ' on' : ''}" data-n="${n}">
      <div class="ib-top"><span class="ib-from">${esc(it.fromName)}</span>
        <span class="ib-conf ${it.confidence >= 0.85 ? 'hi' : it.confidence >= 0.6 ? 'mid' : 'lo'}">${it.confidence.toFixed(2)}</span></div>
      <div class="ib-sub">${esc(it.subject)}</div>
      <div class="ib-meta">${it.needsHumanReview ? chip('attn', 'needs you') : chip('ok', 'auto')}
        <span class="ib-fill">${it.found}/${it.total} fields</span>
        ${it.lang === 'es' ? '<span class="ib-lang">ES</span>' : ''}</div>
    </button>`).join('')}
    </div>
  </div>

  <div class="ib-mail">
    <div class="ib-mh">
      <div><div class="ib-msub" id="mSub"></div>
        <div class="ib-mfrom" id="mFrom"></div></div>
      <div id="mSrc"></div>
    </div>
    <div class="ib-body"><pre id="mBody"></pre></div>
    <div class="ib-hint">Click any field on the right to highlight where it was read from.</div>
  </div>

  <div class="ib-side">
    <div class="ib-sh">
      <div class="sck">Extracted</div>
      <div id="mOverall"></div>
    </div>
    <div id="mFields"></div>
    <div class="ib-acts" id="mActs"></div>
  </div>
</div>
<div class="drill" id="drill" aria-hidden="true">
  <div class="drill-bd" id="drillBd"></div>
  <aside class="drill-p" role="dialog" aria-label="Field detail">
    <div class="drill-h"><b id="dTitle"></b><button class="b" id="dClose">Close</button></div>
    <div class="drill-c" id="dBody"></div>
  </aside>
</div>`;

const LOADS = [
  ['AF-2041', 'El Paso, TX to Detroit, MI', 'MKS Global', 'OMS', 'Quote sent', 0.9, '$2,982', 'attn'],
  ['AF-2040', 'Laredo, TX to London, ON', 'Berpar', 'TMS', 'In transit', 0.94, '$3,120', 'ok'],
  ['AF-2039', 'Toccoa, GA to Monterrey', 'Hartrodt', 'TMS', 'Sourcing', 0.61, '$4,180', 'attn'],
  ['AF-2038', 'Holland, MI to Duncan, SC', 'ACS', 'TMS', 'Delivered', 0.97, '$2,455', 'ok'],
  ['AF-2037', 'Laredo, TX to Shelby Twp, MI', 'Vasa', 'BMS', 'Invoiced', 0.99, '$2,982', 'ok'],
  ['AF-2036', 'Acatl&aacute;n to Atlanta, GA', 'Arizlu', 'RMS', 'Awaiting human', 0.2, 'not priced', 'block'],
];

const S_LOADS = `
<div class="pipe">
${[['RMS', 'Intake &amp; RFQ', '12 open', 'rms'], ['OMS', 'Stage &amp; tender', '8 staged', 'oms'],
   ['TMS', 'Source &amp; track', '3 moving', 'tms'], ['BMS', 'Bill &amp; settle', '1 invoiced', 'bms']]
  .map(([k, t, m, c]) => `<div class="ps ${c}"><div class="psk">${k}</div><div class="pst">${t}</div><div class="psm">${m}</div></div>`).join('')}
</div>
<div class="filters"><span class="fchip on">All 24</span><span class="fchip">Needs a human 4</span>
<span class="fchip">Moving 3</span><span class="fchip">Billing 1</span><span class="fspace"></span>
<span class="fchip ghost">Lane</span><span class="fchip ghost">Customer</span><span class="fchip ghost">Age</span></div>
<table class="tbl"><thead><tr><th>Load</th><th>Lane</th><th>Customer</th><th>Stage</th><th>Status</th><th>Confidence</th><th class="ra">Value</th></tr></thead><tbody>
${LOADS.map(([id, lane, cust, l, st, c, val, k]) => `<tr${id === 'AF-2041' ? ' class="hl"' : ''}>
  <td><b>${id}</b></td><td>${lane}</td><td>${cust}</td><td>${lyr(String(l))}</td>
  <td>${chip(k as Kind, String(st))}</td><td>${meter(Number(c))}</td><td class="ra">${val}</td></tr>`).join('')}
</tbody></table>`;

const S_TMS = `
<div class="split">
 <div>
  <div class="sec">Milestones <span class="sec-n">EDI 214 codes drive the state machine, nothing is typed by hand</span></div>
  <div class="tl">
   ${[['X3', 'Carrier assigned', 'Sanchez Trucking, MC 884201', 'ok', '08:14'],
      ['AF', 'Departed origin', 'El Paso, TX', 'ok', '09:02'],
      ['X6', 'In transit', 'Last ping Amarillo, TX &middot; 12m ago', 'ok', '14:31'],
      ['D1', 'Delivered', 'ETA Detroit, MI 2026-08-08 11:00', 'idle', 'pending'],
      ['', 'Bill-Ready handoff to BMS', 'fires on D1', 'idle', 'pending']]
     .map(([c, t, s, k, tm]) => `<div class="tli ${k === 'idle' ? 'future' : ''}">
       <div class="tld"></div><div class="tlb"><div class="tlt">${c ? `<code>${c}</code> ` : ''}${t}</div>
       <div class="tls">${s}</div></div><div class="tlm">${tm}</div></div>`).join('')}
  </div>
  <div class="sec">Carrier vetting <span class="sec-n">FMCSA, direct against the public API</span></div>
  <table class="tbl"><tbody>
   <tr><td>Operating authority</td><td>${chip('ok', 'active')}</td><td class="dim">MC 884201, verified 08:13</td></tr>
   <tr><td>Insurance on file</td><td>${chip('ok', '$1M auto, $100K cargo')}</td><td class="dim">expires 2027-02-11</td></tr>
   <tr><td>Safety rating</td><td>${chip('ok', 'satisfactory')}</td><td class="dim">last audit 2025-09</td></tr>
  </tbody></table>
 </div>
 <div>
  <div class="side-card"><div class="sck">Sourced from</div>
   <p class="scp"><b>DAT</b> returned 7 trucks on this lane. Ranked by score, vetted through FMCSA, top
   match booked automatically at <b>$2,450</b>.</p>
   <div class="wbar"><span>Sell $2,982</span><span>Buy $2,450</span></div>
   <div class="wtrack"><span style="width:82%"></span></div>
   <p class="scp" style="margin-top:8px">Margin <b>17.8%</b>, above the 7% floor.</p></div>
  <div class="side-card"><div class="sck">Exception paths armed</div>
   <ul class="mt3"><li>${chip('idle', 'ready')} Detention over 2 hr</li>
   <li>${chip('idle', 'ready')} Missed pickup window</li>
   <li>${chip('idle', 'ready')} Carrier unreachable 3 pings</li>
   <li>${chip('idle', 'ready')} Cross-border hold</li></ul>
   <p class="scp">Each has a recovery plan, so an exception routes rather than stalls.</p></div>
 </div></div>`;

const S_BMS = `
<div class="split">
 <div><div class="inv">
  <div class="invh"><div><div class="invn">AF-INV-0001</div>
   <div class="invd">MKS Global &middot; issued 2026-08-06 &middot; Net 30, due 2026-09-05</div></div>
   <div class="invt"><div class="invtl">Total due</div><div class="invtv">$2,982.00</div></div></div>
  <table class="tbl inner"><thead><tr><th>Line</th><th>Code</th><th class="ra">Amount</th></tr></thead><tbody>
   <tr><td>Linehaul, El Paso TX to Detroit MI</td><td><code>400</code></td><td class="ra">$2,450.00</td></tr>
   <tr><td>Fuel surcharge, 18%</td><td><code>405</code></td><td class="ra">$441.00</td></tr>
   <tr><td>Detention, 1.5 hr at $60</td><td><code>ADET</code></td><td class="ra">$90.00</td></tr>
   <tr><td>Dock high delivery</td><td><code>ASRV</code></td><td class="ra">$1.00</td></tr>
   <tr class="tot"><td colspan="2"><b>Total</b></td><td class="ra"><b>$2,982.00</b></td></tr>
  </tbody></table></div></div>
 <div>
  <div class="side-card"><div class="sck">Three-way match</div><ul class="mt3">
   <li>${chip('ok', 'matched')} Rate confirmation $2,982</li>
   <li>${chip('ok', 'matched')} Carrier invoice $2,450</li>
   <li>${chip('ok', 'matched')} POD received, signed</li></ul>
   <p class="scp">Margin <b>17.8%</b>, above the 5% audit floor, so Rate Audit cleared it without a human.</p></div>
  <div class="side-card warn"><div class="sck">Fails closed</div>
   <p class="scp">With no linehaul rate on the Bill-Ready record the generator <b>refuses to invoice</b>
   rather than emitting a zero. A tested path, not a hope.</p>
   <pre class="mailx err">cannot invoice: no linehaul rate on
Bill-Ready record or params</pre></div>
 </div></div>`;

const AGENTS = [
  ['Intake', 'RMS', 'act', 'confidence &ge; 0.90', ''],
  ['Evaluate Opportunity', 'RMS', 'act', 'D4 must-haves present', ''],
  ['Extractor', 'RMS', 'draft', 'regex baseline live', 'Act at 80% lane recall. Now 34.3% over 35 emails.'],
  ['Quoting', 'OMS', 'draft', 'margin floor 7%', 'Act at 95% agreement over 200 quotes. Not started.'],
  ['Tender', 'OMS', 'act', 'EDI 910, WON only', ''],
  ['Procurement', 'TMS', 'suggest', 'DAT on mock engine', 'Draft when the DAT account lands. Blocked on ShipCES.'],
  ['Tracking', 'TMS', 'act', 'EDI 214 codes only', ''],
  ['Rate Audit', 'BMS', 'act', 'margin &ge; 5%', ''],
  ['Invoice', 'BMS', 'draft', 'fails closed with no linehaul', 'Act after Brett invoice walkthrough. Overdue.'],
];

const S_AUTO = `
<div class="rungkey"><span><i class="rd s"></i>Suggest <em>proposes, never writes</em></span>
<span><i class="rd d"></i>Draft <em>prepares, a human sends</em></span>
<span><i class="rd a"></i>Act <em>executes inside stated limits</em></span></div>
<table class="tbl"><thead><tr><th>Agent</th><th>Layer</th><th>Rung</th><th>Operating limit</th><th>To earn the next rung</th></tr></thead><tbody>
${AGENTS.map(([n, l, r, lim, next]) => `<tr><td><b>${n}</b></td><td>${lyr(String(l))}</td>
 <td><span class="rung"><i class="rd ${r === 'act' ? 'a' : r === 'draft' ? 'd' : 's'}"></i>${r === 'act' ? 'Act' : r === 'draft' ? 'Draft' : 'Suggest'}</span></td>
 <td class="dim">${lim}</td><td class="dim">${next || chip('ok', 'at ceiling')}</td></tr>`).join('')}
</tbody></table>`;

const NODES: [string, string, number, number][] = [
  ['Intake', 'cat1', 130, 90], ['Extractor', 'cat1', 250, 150], ['Evaluate', 'cat1', 130, 210],
  ['Quoting', 'cat2', 420, 90], ['Tender', 'cat2', 520, 170],
  ['Procurement', 'cat3', 660, 100], ['Tracking', 'cat3', 700, 230],
  ['Rate Audit', 'cat4', 480, 300], ['Invoice', 'cat4', 330, 330], ['Settlement', 'cat5', 180, 300],
];

const S_AGENTS = `
<div class="warroom"><div class="wr-top">${chip('ok', 'LIVE')}
 <span class="wr-note">Every node is labelled, so colour is never the only way to tell departments apart</span></div>
<svg viewBox="0 0 800 400" class="wr-svg">
 <defs><marker id="ar" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
  <path d="M0,0 L6,3 L0,6 z" fill="#475569"/></marker></defs>
 ${[[130, 90, 250, 150], [250, 150, 130, 210], [250, 150, 420, 90], [420, 90, 520, 170], [520, 170, 660, 100],
    [660, 100, 700, 230], [700, 230, 480, 300], [480, 300, 330, 330], [330, 330, 180, 300]]
   .map(([a, b, c, d]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" class="wr-edge" marker-end="url(#ar)"/>`).join('')}
 ${NODES.map(([n, c, x, y]) => `<g><circle cx="${x}" cy="${y}" r="26" fill="var(--${c})"/>
  <circle cx="${x + 19}" cy="${y + 19}" r="5" fill="var(--ok)" stroke="var(--canvas)" stroke-width="2"/>
  <text x="${x}" y="${y + 45}" class="wr-lab">${n}</text></g>`).join('')}
</svg>
<div class="wr-legend">${[['cat1', 'Quoting'], ['cat2', 'Orders'], ['cat3', 'Transport'], ['cat4', 'Billing'], ['cat5', 'Settlement']]
  .map(([c, l]) => `<span><i style="background:var(--${c})"></i>${l}</span>`).join('')}</div></div>
<div class="feed">
${[['10:02:15', 'Quoting', 'priced RFQ-01JQ7 at $2,982, held by margin gate', 'attn', 'held'],
   ['10:02:14', 'Extractor', 'parsed 6 fields at 0.90 confidence', 'ok', 'done'],
   ['10:01:58', 'Tracking', 'AF-2040 milestone AF, in transit', 'ok', 'done'],
   ['10:01:32', 'Invoice', 'AF-INV-0001 issued, $2,982', 'ok', 'done'],
   ['10:00:41', 'Procurement', 'no DAT capacity Toccoa to Monterrey, escalated', 'block', 'escalated']]
  .map(([t, a, m, k, lab]) => `<div class="fi"><span class="ft">${t}</span><span class="fa">${a}</span>
   <span class="fm">${m}</span>${chip(k as Kind, String(lab))}</div>`).join('')}</div>`;

/* ------------------------------------------------- the load trace (together) */

const TRACE = [
  { k: 'rms', app: 'RMS', t: 'Email arrives', s: 'HOT SHOT from dispatch@mksglobal.com', screen: 'rfq', out: 'idempotency hash, dedup passed', at: '10:02:14' },
  { k: 'rms', app: 'RMS', t: 'Parsed to canonical RFQ', s: '6 fields, confidence 0.90, 5 service options', screen: 'rfq', out: 'RFQ v1 contract (Zod)', at: '10:02:15' },
  { k: 'oms', app: 'OMS', t: 'Staged as a shipment', s: 'dedup by email hash, one row not two', screen: 'loads', out: 'canonical shipment record', at: '10:02:15' },
  { k: 'oms', app: 'OMS', t: 'Priced, held by the margin gate', s: '3% under the 7% floor, routed to a human', screen: 'queue', out: 'human decision required', at: '10:02:15' },
  { k: 'oms', app: 'OMS', t: 'Won, tendered to carrier', s: 'after approval', screen: 'loads', out: 'EDI 910 load tender', at: '10:41:02' },
  { k: 'tms', app: 'TMS', t: 'Sourced and vetted', s: 'DAT returned 7 trucks, FMCSA cleared the winner', screen: 'tms', out: 'carrier assigned, X3', at: '11:14:20' },
  { k: 'tms', app: 'TMS', t: 'Tracked to delivered', s: 'milestones drive state, nothing typed by hand', screen: 'tms', out: 'EDI 214 X3, AF, X6, D1', at: '2 days' },
  { k: 'bms', app: 'BMS', t: 'Billed', s: 'line-itemised, three-way matched, margin 17.8%', screen: 'bms', out: 'EDI 210 invoice AF-INV-0001', at: '+1 day' },
];

const SCREENS: Record<string, { title: string; sub: string; body: string }> = {
  queue: { title: 'Exception queue', sub: '4 need you &middot; 25 cleared automatically in the last hour', body: S_QUEUE },
  rfq: { title: 'RFQ-01JQ7 &middot; El Paso, TX to Detroit, MI', sub: 'MKS Global &middot; parsed by Extractor (Claude, D30 prompt)', body: S_RFQ },
  loads: { title: 'Loads', sub: 'Every load, coloured by how far along quote-to-cash it is', body: S_LOADS },
  tms: { title: 'AF-2041 &middot; in transit', sub: 'Sanchez Trucking &middot; last ping Amarillo, TX 12m ago', body: S_TMS },
  bms: { title: 'AF-INV-0001', sub: 'MKS Global &middot; EDI 210 &middot; generated from the Bill-Ready record', body: S_BMS },
  auto: { title: 'Autonomy', sub: 'What each agent may do, and what it must earn to do more', body: S_AUTO },
  agents: { title: 'Agent network', sub: '12 agents &middot; live feed &middot; 25 actions in the last hour', body: S_AGENTS },
};

const NAV: [string, string, string, string][] = [
  ['Work', 'queue', 'Exception queue', '4'],
  ['Quote to cash', 'rfq', 'RFQ intake', '12'],
  ['Quote to cash', 'loads', 'Orders', '8'],
  ['Quote to cash', 'tms', 'Transport', '3'],
  ['Quote to cash', 'bms', 'Billing', '1'],
  ['Control', 'auto', 'Autonomy', ''],
  ['Control', 'agents', 'Agents', ''],
];

const navHtml = (() => {
  let out = '';
  let grp = '';
  for (const [g, id, label, badge] of NAV) {
    if (g !== grp) { out += `<div class="nav-grp">${g}</div>`; grp = g; }
    const dot = ['rfq', 'loads', 'tms', 'bms'].includes(id) ? ['rms', 'oms', 'tms', 'bms'][['rfq', 'loads', 'tms', 'bms'].indexOf(id)] : '';
    out += `<button class="nav-i" data-screen="${id}"><span class="nav-dot ${dot}"></span>${label}${badge ? `<span class="nav-b">${badge}</span>` : ''}</button>`;
  }
  return out;
})();

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ShipCES Cockpit: interactive prototype</title>
<style>
:root{color-scheme:light;
 --plane:#f4f6f9;--surface:#fff;--raised:#fbfcfd;--line:#e3e8ef;
 --ink:#0f1729;--ink2:#4a5568;--muted:#7b8794;
 --rms:#86b6ef;--oms:#5598e7;--tms:#2a78d6;--bms:#1c5cab;
 --accent:#2a78d6;--accent-soft:#eaf2fd;
 --ok:#0a7a37;--ok-bg:#e8f6ed;--attn:#8a5a00;--attn-bg:#fdf3e0;
 --block:#a32020;--block-bg:#fceceb;--idle:#64748b;--idle-bg:#f1f4f8;
 --track:#e8edf4;--canvas:#0f172a;
 --cat1:#2a78d6;--cat2:#eb6834;--cat3:#1baf7a;--cat4:#eda100;--cat5:#e87ba4;--page:#eef1f6;}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;
 --plane:#0f1319;--surface:#171c24;--raised:#1e242e;--line:#2a323e;
 --ink:#e8eef6;--ink2:#a7b3c4;--muted:#7b8794;
 --rms:#184f95;--oms:#256abf;--tms:#3987e5;--bms:#6da7ec;
 --accent:#3987e5;--accent-soft:#16243a;
 --ok:#4ade80;--ok-bg:#132a1d;--attn:#fbbf24;--attn-bg:#2e2410;
 --block:#f87171;--block-bg:#2f1618;--idle:#8b98a9;--idle-bg:#1c222b;
 --track:#242c38;--cat1:#3987e5;--cat2:#d95926;--cat3:#199e70;--cat4:#c98500;--cat5:#d55181;--page:#090c11;}}
:root[data-theme="dark"]{color-scheme:dark;
 --plane:#0f1319;--surface:#171c24;--raised:#1e242e;--line:#2a323e;
 --ink:#e8eef6;--ink2:#a7b3c4;--muted:#7b8794;
 --rms:#184f95;--oms:#256abf;--tms:#3987e5;--bms:#6da7ec;
 --accent:#3987e5;--accent-soft:#16243a;
 --ok:#4ade80;--ok-bg:#132a1d;--attn:#fbbf24;--attn-bg:#2e2410;
 --block:#f87171;--block-bg:#2f1618;--idle:#8b98a9;--idle-bg:#1c222b;
 --track:#242c38;--cat1:#3987e5;--cat2:#d95926;--cat3:#199e70;--cat4:#c98500;--cat5:#d55181;--page:#090c11;}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink2);
 font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3{color:var(--ink);letter-spacing:-.3px;margin:0}
code{font:11.5px ui-monospace,Menlo,monospace;background:var(--raised);border:1px solid var(--line);padding:1px 5px;border-radius:4px;color:var(--ink2)}
.wrap{max-width:1340px;margin:0 auto;padding:0 24px 90px}
header{padding:40px 24px 28px;background:var(--surface);border-bottom:1px solid var(--line)}
header .in{max-width:1340px;margin:0 auto}
.eyebrow{font-size:11.5px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:var(--accent)}
header h1{margin:8px 0;font-size:30px}header p{margin:0;max-width:78ch}
.toggle{margin-top:18px;display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.toggle button{background:var(--surface);border:0;padding:7px 15px;font-size:13px;color:var(--ink2);cursor:pointer;font-family:inherit}
.toggle button[aria-pressed="true"]{background:var(--accent);color:#fff}
.cap{margin:46px 0 14px}
.cap .n{font-size:11.5px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:var(--accent)}
.cap h2{font-size:22px;margin:5px 0}.cap p{margin:0;max-width:84ch;font-size:14.5px}

/* system map */
.map{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:22px;overflow-x:auto}
.maprow{display:flex;align-items:stretch;gap:0;min-width:900px}
.mapapp{flex:1;border-radius:10px;padding:14px 16px;color:#fff;position:relative}
.mapapp.rms{background:var(--rms);color:#0f1729}.mapapp.oms{background:var(--oms)}
.mapapp.tms{background:var(--tms)}.mapapp.bms{background:var(--bms)}
:root[data-theme="dark"] .mapapp.rms{color:#fff}:root[data-theme="dark"] .mapapp.bms{color:#0f1729}
.mapapp b{display:block;font-size:10.5px;letter-spacing:1px;opacity:.92}
.mapapp .t{font-size:15px;font-weight:650;margin-top:2px}
.mapapp .d{font-size:11.5px;opacity:.9;margin-top:5px;line-height:1.45}
.seam{width:104px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 4px}
.seam .arw{color:var(--muted);font-size:17px;line-height:1}
.seam .sc{font-size:9.5px;font-weight:700;letter-spacing:.5px;color:var(--ink);background:var(--raised);
 border:1px solid var(--line);border-radius:4px;padding:2px 7px;margin-top:4px;text-align:center}
.seam .sn{font-size:10px;color:var(--muted);margin-top:3px;text-align:center;line-height:1.3}
.sense{margin-top:16px;border-top:1px dashed var(--line);padding-top:14px}
.sense-k{font-size:9.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.sense-row{display:flex;gap:8px;flex-wrap:wrap}
.sensor{border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:var(--raised);font-size:12px;flex:1;min-width:150px}
.sensor b{display:block;color:var(--ink);font-size:12.5px}
.sensor span{color:var(--muted);font-size:11px}

/* trace */
.trace{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-top:14px}
.trace-h{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:12px}
.trace-h h3{font-size:15px}
.trace-h .sub{font-size:12.5px;color:var(--muted)}
.tsteps{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}
.tstep{flex:1;min-width:132px;text-align:left;border:1px solid var(--line);border-radius:9px;padding:10px 12px;
 background:var(--surface);cursor:pointer;font-family:inherit;color:var(--ink2)}
.tstep:hover{border-color:var(--accent)}
.tstep.on{border-color:var(--accent);background:var(--accent-soft)}
.tstep .ta{font-size:9.5px;font-weight:700;letter-spacing:.7px;padding:1px 6px;border-radius:3px;color:#fff;display:inline-block}
.tstep .ta.rms{background:var(--rms);color:#0f1729}.tstep .ta.oms{background:var(--oms)}
.tstep .ta.tms{background:var(--tms)}.tstep .ta.bms{background:var(--bms)}
:root[data-theme="dark"] .tstep .ta.rms{color:#fff}:root[data-theme="dark"] .tstep .ta.bms{color:#0f1729}
.tstep .tt{font-size:12.5px;font-weight:600;color:var(--ink);margin-top:5px;line-height:1.3}
.tstep .tm{font-size:10.5px;color:var(--muted);margin-top:3px}
.tdetail{margin-top:12px;border-top:1px solid var(--line);padding-top:12px;display:flex;gap:18px;flex-wrap:wrap;align-items:center}
.tdetail .td-s{font-size:13px;flex:1;min-width:240px}
.tdetail .td-o{font-size:11.5px;color:var(--muted)}
.tdetail .td-o b{color:var(--ink);font-weight:600}

/* frame */
.frame{border-radius:12px;overflow:hidden;border:1px solid var(--line);box-shadow:0 18px 50px rgba(15,23,41,.13);background:var(--surface);margin-top:14px}
.chrome{display:flex;align-items:center;gap:7px;padding:9px 13px;background:var(--raised);border-bottom:1px solid var(--line)}
.dot{width:10px;height:10px;border-radius:50%}.dot.r{background:#ef6b60}.dot.y{background:#f5bd4f}.dot.g{background:#61c554}
.url{margin-left:10px;font-size:11.5px;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:5px;padding:2px 12px}
.app{display:flex;min-height:600px}
.side{width:200px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--line);padding:14px 0;display:flex;flex-direction:column}
.brand{font-size:13.5px;font-weight:700;color:var(--ink);padding:2px 14px 16px;display:flex;align-items:center;gap:7px}
.logo{width:22px;height:22px;border-radius:6px;background:var(--accent);color:#fff;font-size:10px;display:inline-flex;align-items:center;justify-content:center;font-weight:700}
.brand-sub{font-weight:400;color:var(--muted);font-size:11px}
.nav-grp{font-size:9.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--muted);padding:12px 14px 5px}
.nav-i{display:flex;align-items:center;gap:8px;padding:6px 14px;font-size:12.5px;border:0;border-left:3px solid transparent;
 color:var(--ink2);background:transparent;width:100%;text-align:left;cursor:pointer;font-family:inherit}
.nav-i:hover{background:var(--raised)}
.nav-i.on{background:var(--accent-soft);border-left-color:var(--accent);color:var(--ink);font-weight:600}
.nav-dot{width:7px;height:7px;border-radius:2px;background:var(--muted);flex-shrink:0}
.nav-dot.rms{background:var(--rms)}.nav-dot.oms{background:var(--oms)}.nav-dot.tms{background:var(--tms)}.nav-dot.bms{background:var(--bms)}
.nav-b{margin-left:auto;font-size:10px;font-weight:700;background:var(--raised);border:1px solid var(--line);border-radius:9px;padding:0 6px;color:var(--muted)}
.side-foot{margin-top:auto;padding:12px 14px 2px;border-top:1px solid var(--line)}
.lm-k{font-size:9.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)}
.lm-bar{height:5px;background:var(--track);border-radius:3px;margin:6px 0 4px;overflow:hidden}
.lm-bar span{display:block;height:100%;background:var(--accent);border-radius:3px}
.lm-v{font-size:11px;color:var(--muted)}
.pane{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--plane)}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 20px;background:var(--surface);border-bottom:1px solid var(--line)}
.top h3{font-size:16px}.top-sub{font-size:12px;color:var(--muted);margin-top:1px}
.top-r{display:flex;align-items:center;gap:10px}
.search{font-size:11.5px;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:5px 12px;background:var(--raised)}
.avatar{width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;font-size:10.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.body{padding:18px 20px}
.sec{font-size:10px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--muted);margin:0 0 9px}
.sec-n{font-weight:400;letter-spacing:0;text-transform:none;font-size:11.5px;margin-left:8px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
.k{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:12px 14px}
.k b{display:block;font-size:23px;font-weight:660;color:var(--ink);letter-spacing:-.6px}
.k span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);font-weight:700;margin-top:2px}
.k i{display:block;font-style:normal;font-size:11.5px;color:var(--muted);margin-top:5px}
.k i.ok{color:var(--ok)}.k i.attn{color:var(--attn)}
.q{background:var(--surface);border:1px solid var(--line);border-radius:9px;overflow:hidden}
.qr{display:grid;grid-template-columns:5px 1fr 190px 108px 168px;align-items:center;border-bottom:1px solid var(--line)}
.qr:last-child{border-bottom:0}
.lbar{align-self:stretch}.lbar.RMS{background:var(--rms)}.lbar.OMS{background:var(--oms)}.lbar.TMS{background:var(--tms)}.lbar.BMS{background:var(--bms)}
.qm{padding:11px 14px;min-width:0}.ql{font-size:13.5px;font-weight:600;color:var(--ink)}
.qc{font-size:11.5px;color:var(--muted);margin-top:1px}
.qw{padding:11px 8px;font-size:11.5px}.qw code{display:block;margin-top:3px;width:fit-content}
.qf{padding:11px 8px}.qa{padding:11px 14px;display:flex;gap:6px;justify-content:flex-end}
.b{font:600 11.5px inherit;font-family:inherit;border:1px solid var(--line);background:var(--surface);color:var(--ink2);border-radius:5px;padding:5px 10px;cursor:pointer}
.b.p{background:var(--accent);border-color:var(--accent);color:#fff}
.b.full{width:100%;margin-bottom:6px;padding:7px 10px}
.empty-demo{margin-top:12px;border:1px dashed var(--line);border-radius:9px;background:var(--surface);padding:16px}
.ed-in{display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:13px}
.ed-in b{color:var(--ink)}.ed-in span{color:var(--muted);font-size:12px}
.chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px;white-space:nowrap}
.chip i{font-style:normal;font-weight:700}
.chip.ok{color:var(--ok);background:var(--ok-bg)}.chip.attn{color:var(--attn);background:var(--attn-bg)}
.chip.block{color:var(--block);background:var(--block-bg)}.chip.idle{color:var(--idle);background:var(--idle-bg)}
.meter{display:inline-flex;align-items:center;gap:7px}
.mt{width:44px;height:5px;border-radius:3px;background:var(--track);overflow:hidden;display:inline-block}
.mf{display:block;height:100%;border-radius:3px;background:var(--tms)}
.meter.hi .mf{background:var(--bms)}.meter.mid .mf{background:var(--oms)}.meter.lo .mf{background:var(--rms)}
.meter b{font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--ink)}
.lyr{display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:.6px;color:#fff;padding:1px 6px;border-radius:3px}
.lyr.RMS{background:var(--rms);color:#0f1729}.lyr.OMS{background:var(--oms)}.lyr.TMS{background:var(--tms)}.lyr.BMS{background:var(--bms)}
:root[data-theme="dark"] .lyr.RMS{color:#fff}:root[data-theme="dark"] .lyr.BMS{color:#0f1729}
.split{display:grid;grid-template-columns:1fr 292px;gap:16px}
.flds{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:9px;overflow:hidden;margin-bottom:18px}
.fl{background:var(--surface);padding:10px 13px}
.flk{font-size:9.5px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);font-weight:700}
.flv{font-size:14px;font-weight:600;color:var(--ink);margin-top:2px}
.fl.asm .flv{color:var(--muted);font-weight:500;text-decoration:underline dashed var(--muted) 1px;text-underline-offset:3px}
.asmt{margin-left:6px;font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--attn);background:var(--attn-bg);padding:1px 5px;border-radius:3px;vertical-align:middle}
.flr{margin-top:5px;min-height:18px}.fle{margin-top:4px;font-size:11px;line-height:1.4}
.ev{color:var(--ink2);background:var(--accent-soft);padding:1px 5px;border-radius:3px}
.ev.none{background:transparent;color:var(--muted);font-style:italic}
.opts{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.opt{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px 11px}
.opt.best{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}
.on{font-size:10px;font-weight:700;letter-spacing:.5px;color:var(--muted)}
.rec{display:block;margin-top:2px;color:var(--accent);font-size:9px}
.op{font-size:17px;font-weight:660;color:var(--ink);margin:3px 0;letter-spacing:-.4px}
.or code{font-size:10px}
.side-card{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:13px 15px;margin-bottom:12px}
.side-card.warn{border-color:var(--block)}
.sck{font-size:9.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.scv{margin-bottom:7px}.scp{margin:0 0 10px;font-size:12.5px;line-height:1.5}.scp b{color:var(--ink)}
.mailx{margin:0;background:var(--raised);border:1px solid var(--line);border-radius:6px;padding:10px;font:11px/1.5 ui-monospace,Menlo,monospace;color:var(--ink2);white-space:pre-wrap}
.mailx.err{color:var(--block);border-color:var(--block)}
.aud{margin:0;padding:0;list-style:none;font-size:11.5px}
.aud li{padding:4px 0;border-bottom:1px solid var(--line)}.aud li:last-child{border-bottom:0}
.aud span{color:var(--muted);font-variant-numeric:tabular-nums;margin-right:7px}
.mt3{margin:0 0 10px;padding:0;list-style:none;font-size:12px}
.mt3 li{padding:4px 0;display:flex;gap:8px;align-items:center}
.pipe{display:flex;gap:2px;background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:5px;margin-bottom:14px}
.ps{flex:1;border-radius:6px;padding:9px 11px;color:#fff}
.ps.rms{background:var(--rms);color:#0f1729}.ps.oms{background:var(--oms)}.ps.tms{background:var(--tms)}.ps.bms{background:var(--bms)}
:root[data-theme="dark"] .ps.rms{color:#fff}:root[data-theme="dark"] .ps.bms{color:#0f1729}
.psk{font-size:9.5px;font-weight:700;letter-spacing:.9px;opacity:.92}
.pst{font-size:12.5px;font-weight:600;margin-top:1px}.psm{font-size:11px;opacity:.88;margin-top:2px}
.filters{display:flex;gap:6px;align-items:center;margin-bottom:11px;flex-wrap:wrap}
.fchip{font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink2)}
.fchip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.fchip.ghost{color:var(--muted);font-weight:400}.fspace{flex:1}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--surface);border:1px solid var(--line);border-radius:9px;overflow:hidden}
.tbl th{text-align:left;padding:8px 12px;background:var(--raised);border-bottom:1px solid var(--line);font-size:9.5px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);font-weight:700}
.tbl td{padding:8px 12px;border-bottom:1px solid var(--line)}
.tbl tr:last-child td{border-bottom:0}.tbl td b{color:var(--ink)}
.tbl .ra{text-align:right;font-variant-numeric:tabular-nums}
.tbl.inner{border:0;border-radius:0}.tbl .tot td{background:var(--raised)}
.tbl tr.hl td{background:var(--accent-soft)}
.dim{color:var(--muted);font-size:11.5px}
.tl{background:var(--surface);border:1px solid var(--line);border-radius:9px;overflow:hidden;margin-bottom:18px}
.tli{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line)}
.tli:last-child{border-bottom:0}.tli.future{opacity:.55}
.tld{width:9px;height:9px;border-radius:50%;background:var(--ok);flex-shrink:0}
.tli.future .tld{background:var(--track);border:2px solid var(--line)}
.tlb{flex:1}.tlt{font-size:13px;font-weight:600;color:var(--ink)}
.tls{font-size:11.5px;color:var(--muted);margin-top:1px}
.tlm{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
.wbar{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-bottom:4px}
.wtrack{height:7px;background:var(--track);border-radius:4px;overflow:hidden}
.wtrack span{display:block;height:100%;background:var(--tms);border-radius:4px}
.rungkey{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:12px;font-size:12px}
.rungkey em{color:var(--muted);font-style:normal;font-size:11.5px;margin-left:4px}
.rd{width:10px;height:10px;border-radius:50%;border:2px solid var(--accent);display:inline-block;margin-right:6px;vertical-align:-1px}
.rd.d{background:linear-gradient(90deg,var(--accent) 50%,transparent 50%)}.rd.a{background:var(--accent)}
.rung{display:inline-flex;align-items:center;font-size:12px;font-weight:600;color:var(--ink)}
.inv{background:var(--surface);border:1px solid var(--line);border-radius:9px;overflow:hidden}
.invh{display:flex;justify-content:space-between;align-items:flex-start;padding:16px 18px;border-bottom:1px solid var(--line)}
.invn{font-size:19px;font-weight:680;color:var(--ink);letter-spacing:-.5px}
.invd{font-size:11.5px;color:var(--muted);margin-top:2px}
.invt{text-align:right}
.invtl{font-size:9.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--muted)}
.invtv{font-size:24px;font-weight:680;color:var(--ink);letter-spacing:-.7px}
.warroom{background:var(--canvas);border-radius:9px;padding:12px 14px 6px;margin-bottom:14px}
.wr-top{display:flex;align-items:center;gap:10px}
.wr-note{font-size:11px;color:#8fa0b8}
.wr-svg{width:100%;height:auto;display:block}
.wr-edge{stroke:#334155;stroke-width:1.5}
.wr-lab{fill:#cbd5e1;font-size:11px;text-anchor:middle;font-family:inherit}
.wr-legend{display:flex;gap:14px;flex-wrap:wrap;padding:6px 2px 8px;font-size:11px;color:#8fa0b8}
.wr-legend i{width:9px;height:9px;border-radius:2px;display:inline-block;margin-right:5px;vertical-align:-1px}
.feed{background:var(--surface);border:1px solid var(--line);border-radius:9px;overflow:hidden}
.fi{display:flex;align-items:center;gap:11px;padding:8px 14px;border-bottom:1px solid var(--line);font-size:12px}
.fi:last-child{border-bottom:0}
.ft{color:var(--muted);font-variant-numeric:tabular-nums;font-size:11px;width:52px;flex-shrink:0}
.fa{font-weight:600;color:var(--ink);width:96px;flex-shrink:0}.fm{flex:1}

/* ---- RFQ intake: three-pane review workspace ---- */
.inbox{display:grid;grid-template-columns:252px 1fr 310px;gap:12px;height:600px}
.ib-list,.ib-mail,.ib-side{background:var(--surface);border:1px solid var(--line);border-radius:9px;display:flex;flex-direction:column;min-height:0}
.ib-lh{padding:10px 13px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:baseline}
.ib-lh b{font-size:13px;color:var(--ink)}.ib-lh span{font-size:11px;color:var(--muted)}
.ib-items{overflow-y:auto;flex:1}
.ib-i{display:block;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--line);
 border-left:3px solid transparent;padding:9px 12px;cursor:pointer;font-family:inherit}
.ib-i:hover{background:var(--raised)}
.ib-i.on{background:var(--accent-soft);border-left-color:var(--accent)}
.ib-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.ib-from{font-size:12px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ib-conf{font-size:10.5px;font-weight:700;font-variant-numeric:tabular-nums;padding:1px 5px;border-radius:3px}
.ib-conf.hi{color:var(--ok);background:var(--ok-bg)}
.ib-conf.mid{color:var(--attn);background:var(--attn-bg)}
.ib-conf.lo{color:var(--block);background:var(--block-bg)}
.ib-sub{font-size:11.5px;color:var(--ink2);margin-top:2px;line-height:1.35;
 display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ib-meta{display:flex;align-items:center;gap:6px;margin-top:5px;flex-wrap:wrap}
.ib-fill{font-size:10px;color:var(--muted)}
.ib-lang{font-size:9px;font-weight:700;letter-spacing:.5px;color:var(--muted);border:1px solid var(--line);border-radius:3px;padding:0 4px}
.ib-mh{padding:11px 15px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.ib-msub{font-size:14px;font-weight:650;color:var(--ink);line-height:1.35}
.ib-mfrom{font-size:11.5px;color:var(--muted);margin-top:2px}
.ib-body{flex:1;overflow-y:auto;padding:14px 16px}
.ib-body pre{margin:0;white-space:pre-wrap;word-break:break-word;
 font:12.5px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink2)}
.ib-body mark{background:transparent;color:inherit;border-bottom:2px solid var(--accent);opacity:.6;padding:1px 0;cursor:pointer}
.ib-body mark.act{background:var(--accent);color:#fff;opacity:1;border-radius:3px;padding:1px 4px;border-bottom:0;
 box-shadow:0 0 0 3px var(--accent-soft)}
.ib-hint{padding:8px 15px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}
.ib-sh{padding:11px 14px;border-bottom:1px solid var(--line)}
.ib-side{overflow-y:auto}
.ibf{display:block;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--line);
 padding:9px 14px;cursor:pointer;font-family:inherit}
.ibf:hover{background:var(--raised)}
.ibf.on{background:var(--accent-soft)}
.ibf .k{font-size:9.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);
 display:flex;justify-content:space-between;align-items:center;gap:6px}
.ibf .v{font-size:13.5px;font-weight:600;color:var(--ink);margin-top:2px}
.ibf.asm .v{color:var(--muted);font-weight:500;text-decoration:underline dashed var(--muted) 1px;text-underline-offset:3px}
.ibf .r{margin-top:4px}
.ibf .why{font-size:10.5px;color:var(--accent);font-weight:600;margin-top:4px;display:inline-block}
.ib-acts{padding:12px 14px;border-top:1px solid var(--line)}
.src{font-size:9.5px;font-weight:700;letter-spacing:.5px;padding:2px 7px;border-radius:3px;white-space:nowrap}
.src.real{color:var(--block);background:var(--block-bg)}
.src.test{color:var(--ok);background:var(--ok-bg)}
.drill{position:fixed;inset:0;z-index:80;display:none}
.drill.on{display:block}
.drill-bd{position:absolute;inset:0;background:rgba(15,23,41,.45)}
.drill-p{position:absolute;top:0;right:0;bottom:0;width:min(430px,94vw);background:var(--surface);
 border-left:1px solid var(--line);box-shadow:-16px 0 46px rgba(15,23,41,.2);display:flex;flex-direction:column}
.drill-h{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line)}
.drill-h b{font-size:15px;color:var(--ink)}
.drill-c{padding:16px 18px;overflow-y:auto}
.dsec{font-size:9.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--muted);margin:16px 0 7px}
.dquote{background:var(--accent-soft);border-left:3px solid var(--accent);border-radius:0 6px 6px 0;
 padding:10px 12px;font:12px/1.55 ui-monospace,Menlo,monospace;color:var(--ink2);white-space:pre-wrap}
.drow{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line);font-size:12.5px}
.drow:last-child{border-bottom:0}
.drow span{color:var(--muted)}.drow b{color:var(--ink);font-weight:600;text-align:right}
@media (max-width:1150px){.inbox{grid-template-columns:1fr;height:auto}.ib-list{max-height:220px}}
.screen{display:none}.screen.on{display:block}
footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:4px}
@media (max-width:1050px){.split{grid-template-columns:1fr}.flds{grid-template-columns:repeat(2,1fr)}
 .opts{grid-template-columns:repeat(2,1fr)}.kpis{grid-template-columns:repeat(2,1fr)}
 .qr{grid-template-columns:5px 1fr}.qw,.qf,.qa{grid-column:2;padding-top:0}}
</style></head><body>

<header><div class="in">
 <div class="eyebrow">Design System v2 &middot; Interactive prototype</div>
 <h1>The cockpit, working</h1>
 <p>Click the left nav to move between screens. Click a step in the load trace to jump to the app that
 owns it. Lanes, customers, confidence values, the invoice and the agent roster are all real: they come
 from the ShipCES corpus and the code running today. Both themes are independently validated.</p>
 <div class="toggle" role="group" aria-label="Theme">
  <button id="tl" aria-pressed="false">Light</button><button id="td" aria-pressed="false">Dark</button></div>
</div></header>

<div class="wrap">

 <div class="cap"><div class="n">How they fit together</div><h2>Four applications, three seams</h2>
 <p>Each layer owns its own slice of the shipment lifecycle and hands off on a typed contract, not a
 shared database table. The seam is the interesting part: it is where most TMS platforms leak, and where
 idempotency has to hold or you double-bill a customer.</p></div>
 <div class="map">
  <div class="maprow">
   <div class="mapapp rms"><b>RMS</b><div class="t">Intake &amp; RFQ</div>
    <div class="d">Reads the mailbox, extracts the load, decides if it is quotable. Owns dedup.</div></div>
   <div class="seam"><div class="arw">&#8594;</div><div class="sc">canonical RFQ</div>
    <div class="sn">Zod v1 contract, dedup by email hash</div></div>
   <div class="mapapp oms"><b>OMS</b><div class="t">Stage &amp; tender</div>
    <div class="d">Single source of truth for the shipment record. Prices, gates on margin, tenders.</div></div>
   <div class="seam"><div class="arw">&#8594;</div><div class="sc">EDI 910</div>
    <div class="sn">load tender, only from WON</div></div>
   <div class="mapapp tms"><b>TMS</b><div class="t">Source &amp; track</div>
    <div class="d">Finds and vets capacity, drives state from milestones, handles exceptions.</div></div>
   <div class="seam"><div class="arw">&#8594;</div><div class="sc">Bill-Ready</div>
    <div class="sn">EDI 214 D1 fires it, only from DELIVERED</div></div>
   <div class="mapapp bms"><b>BMS</b><div class="t">Bill &amp; settle</div>
    <div class="d">Line-itemises, three-way matches, invoices. Fails closed rather than guessing.</div></div>
  </div>
  <div class="sense">
   <div class="sense-k">Sense layer &middot; engine-swappable adapters feeding every stage</div>
   <div class="sense-row">
    <div class="sensor"><b>Email</b><span>Gmail API + Microsoft Graph, into RMS</span></div>
    <div class="sensor"><b>DAT</b><span>capacity and rates, into TMS</span></div>
    <div class="sensor"><b>FMCSA</b><span>authority and insurance, gates TMS</span></div>
    <div class="sensor"><b>Sylectus</b><span>post only, replies come back by email</span></div>
   </div>
  </div>
 </div>

 <div class="trace">
  <div class="trace-h"><div><h3>Follow one load: AF-2041, El Paso to Detroit</h3>
   <div class="sub">One email to one invoice, across all four applications. Click a step to open the screen that owns it.</div></div>
   <div><button class="b" id="prev">Back</button> <button class="b p" id="next">Next step</button></div></div>
  <div class="tsteps" id="tsteps">
   ${TRACE.map((s, i) => `<button class="tstep${i === 0 ? ' on' : ''}" data-i="${i}" data-screen="${s.screen}">
     <span class="ta ${s.k}">${s.app}</span><div class="tt">${s.t}</div><div class="tm">${s.at}</div></button>`).join('')}
  </div>
  <div class="tdetail"><div class="td-s" id="tdesc">${TRACE[0]!.s}</div>
   <div class="td-o">Hands off as <b id="tout">${TRACE[0]!.out}</b></div></div>
 </div>

 <div class="frame">
  <div class="chrome"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
   <div class="url" id="url">app.shipces.ai/queue</div></div>
  <div class="app">
   <aside class="side">
    <div class="brand"><span class="logo">SC</span>ShipCES <span class="brand-sub">Autonomous</span></div>
    ${navHtml}
    <div class="side-foot"><div class="lm-k">System autonomy</div>
     <div class="lm-bar"><span style="width:62%"></span></div>
     <div class="lm-v">6 of 12 agents acting</div></div>
   </aside>
   <main class="pane">
    <div class="top"><div><h3 id="stitle"></h3><div class="top-sub" id="ssub"></div></div>
     <div class="top-r"><span class="search">Search loads, carriers, lanes</span><span class="avatar">AM</span></div></div>
    <div class="body">
     ${Object.entries(SCREENS).map(([id, s]) => `<div class="screen" data-id="${id}">${s.body}</div>`).join('')}
    </div>
   </main>
  </div>
 </div>

 <footer>Rendered by <code>scripts/design/buildScreenMockups.ts</code>. Spec:
 <code>docs/design-system-v2.md</code>. A prototype, not screenshots: the components in
 <code>services/web/src</code> already run on these tokens, but the reason strip, autonomy ladder and
 exception queue are the follow-on build.</footer>
</div>

<script>
(function(){
 var TRACE=${JSON.stringify(TRACE)};
 var INBOX=${JSON.stringify(INBOX)};
 var META=${JSON.stringify(Object.fromEntries(Object.entries(SCREENS).map(([k, v]) => [k, { title: v.title, sub: v.sub }])))};
 var r=document.documentElement,tl=document.getElementById('tl'),td=document.getElementById('td');
 function theme(m){m?r.setAttribute('data-theme',m):r.removeAttribute('data-theme');
  tl.setAttribute('aria-pressed',String(m==='light'));td.setAttribute('aria-pressed',String(m==='dark'));}
 tl.onclick=function(){theme(r.getAttribute('data-theme')==='light'?null:'light')};
 td.onclick=function(){theme(r.getAttribute('data-theme')==='dark'?null:'dark')};

 var screens=[].slice.call(document.querySelectorAll('.screen'));
 var navs=[].slice.call(document.querySelectorAll('.nav-i'));
 function show(id){
  screens.forEach(function(s){s.classList.toggle('on',s.getAttribute('data-id')===id)});
  navs.forEach(function(n){n.classList.toggle('on',n.getAttribute('data-screen')===id)});
  var m=META[id]||{title:'',sub:''};
  document.getElementById('stitle').innerHTML=m.title;
  document.getElementById('ssub').innerHTML=m.sub;
  document.getElementById('url').textContent='app.shipces.ai/'+id;
 }
 navs.forEach(function(n){n.onclick=function(){show(n.getAttribute('data-screen'))}});

 var steps=[].slice.call(document.querySelectorAll('.tstep')),cur=0;
 function step(i){
  cur=Math.max(0,Math.min(TRACE.length-1,i));
  steps.forEach(function(s,j){s.classList.toggle('on',j===cur)});
  document.getElementById('tdesc').innerHTML=TRACE[cur].s;
  document.getElementById('tout').innerHTML=TRACE[cur].out;
  show(TRACE[cur].screen);
  steps[cur].scrollIntoView({block:'nearest',inline:'nearest'});
 }
 steps.forEach(function(s){s.onclick=function(){step(parseInt(s.getAttribute('data-i'),10))}});
 document.getElementById('next').onclick=function(){step(cur+1)};
 document.getElementById('prev').onclick=function(){step(cur-1)};


 /* ---- RFQ intake: Rossum-style drill-through, Drumkit-style triage ---- */
 (function(){
  var items=[].slice.call(document.querySelectorAll('.ib-i'));
  if(!items.length||typeof INBOX==='undefined') return;
  var cur=0;
  var body=document.getElementById('mBody');
  function escH(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function METER(v){var b=v>=0.85?'hi':v>=0.6?'mid':'lo';
   return '<span class="meter '+b+'"><span class="mt"><span class="mf" style="width:'+Math.round(v*100)+'%"></span></span><b>'+v.toFixed(2)+'</b></span>';}
  function CHIP(k,l){var g={ok:'✓',attn:'⚑',block:'✕',idle:'•'};
   return '<span class="chip '+k+'"><i>'+g[k]+'</i>'+l+'</span>';}

  function paint(it,activeKey){
   var spans=it.fields.filter(function(f){return f.evidence;})
    .map(function(f){return {s:f.evidence.start,e:f.evidence.end,k:f.key};})
    .sort(function(a,b){return a.s-b.s;});
   var out='',at=0;
   spans.forEach(function(sp){
    if(sp.s<at) return;
    out+=escH(it.body.slice(at,sp.s));
    out+='<mark class="'+(sp.k===activeKey?'act':'')+'" data-k="'+sp.k+'">'+escH(it.body.slice(sp.s,sp.e))+'</mark>';
    at=sp.e;
   });
   out+=escH(it.body.slice(at));
   body.innerHTML=out;
   var a=body.querySelector('mark.act');
   if(a&&a.scrollIntoView) a.scrollIntoView({block:'center'});
  }

  function renderFields(it){
   document.getElementById('mFields').innerHTML=it.fields.map(function(f){
    return '<button class="ibf'+(f.assumed?' asm':'')+'" data-k="'+f.key+'">'+
     '<div class="k"><span>'+f.label+'</span>'+(f.assumed?'<span class="asmt">assumed</span>':'')+'</div>'+
     '<div class="v">'+escH(f.value)+'</div>'+
     '<div class="r"><code>'+f.rule+'</code></div>'+
     '<span class="why">'+(f.evidence?'Show source and why':'Why is this missing?')+'</span></button>';
   }).join('');
   [].slice.call(document.querySelectorAll('.ibf')).forEach(function(b){
    b.onclick=function(){
     var k=b.getAttribute('data-k');
     [].slice.call(document.querySelectorAll('.ibf')).forEach(function(x){x.classList.toggle('on',x===b);});
     paint(INBOX[cur],k);
     openDrill(INBOX[cur],k);
    };
   });
  }

  function select(n){
   cur=n;
   var it=INBOX[n];
   items.forEach(function(b,j){b.classList.toggle('on',j===n);});
   document.getElementById('mSub').textContent=it.subject;
   document.getElementById('mFrom').textContent=it.fromName+'  <'+it.from+'>   '+it.receivedAt.slice(0,10);
   document.getElementById('mSrc').innerHTML=
    '<span class="src '+(it.found>0?'test':'real')+'">'+(it.found>0?String(it.found)+' of '+it.total+' read':'nothing read')+'</span>';
   document.getElementById('mOverall').innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:6px">'+
    METER(it.confidence)+(it.needsHumanReview?CHIP('attn','needs you'):CHIP('ok','auto'))+'</div>'+
    '<div style="font-size:11px;color:var(--muted);margin-top:6px">'+it.found+' of '+it.total+
    ' fields read from the email'+(it.hitl!=='none'?' &middot; routed: '+it.hitl:'')+'</div>';
   document.getElementById('mActs').innerHTML= it.needsHumanReview
    ? '<button class="b p full">Fill gaps and quote</button><button class="b full">Reply asking for missing data</button>'
    : '<button class="b p full">Approve and send quote</button><button class="b full">Re-price</button>';
   renderFields(it);
   paint(it,null);
  }

  var drill=document.getElementById('drill');
  function openDrill(it,k){
   var f=null; it.fields.forEach(function(x){if(x.key===k)f=x;});
   if(!f) return;
   document.getElementById('dTitle').textContent=f.label;
   var src=f.evidence
    ? '<div class="dsec">Read from the email</div><div class="dquote">'+escH(it.body.slice(f.evidence.start,f.evidence.end))+'</div>'+
      '<div class="dsec">In context</div><div class="dquote">'+escH(it.body.slice(Math.max(0,f.evidence.start-100),f.evidence.end+100))+'</div>'
    : '<div class="dsec">No supporting text</div><div class="dquote">Nothing in this email supports a value for '+
      f.label.toLowerCase()+'. The parser supplied a default, so it is marked assumed and the RFQ went to a human instead of being quoted.</div>';
   document.getElementById('dBody').innerHTML=
    '<div class="dsec">Value</div>'+
    '<div class="drow"><span>Extracted</span><b>'+escH(f.value)+'</b></div>'+
    '<div class="drow"><span>Rule that fired</span><b><code>'+f.rule+'</code></b></div>'+
    '<div class="drow"><span>Evidence</span><b>'+(f.evidence?'characters '+f.evidence.start+' to '+f.evidence.end:'none')+'</b></div>'+
    '<div class="drow"><span>Overall confidence</span><b>'+it.confidence.toFixed(2)+'</b></div>'+
    '<div class="drow"><span>Routing</span><b>'+(it.needsHumanReview?'human review':'automatic')+'</b></div>'+
    src+
    '<div class="dsec">If you correct this</div><div style="font-size:12.5px;line-height:1.55">'+
    'The correction is written to the calibrated corpus and becomes a regression case, so the same mistake '+
    'fails the build next time rather than being relearned by hand.</div>';
   drill.classList.add('on'); drill.setAttribute('aria-hidden','false');
  }
  function closeDrill(){drill.classList.remove('on');drill.setAttribute('aria-hidden','true');}
  document.getElementById('dClose').onclick=closeDrill;
  document.getElementById('drillBd').onclick=closeDrill;
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeDrill();});
  items.forEach(function(b,n){b.onclick=function(){select(n);};});
  body.addEventListener('click',function(e){
   var t=e.target;
   if(t&&t.tagName==='MARK'){
    var btn=document.querySelector('.ibf[data-k="'+t.getAttribute('data-k')+'"]');
    if(btn) btn.click();
   }
  });
  select(0);
 })();

 show('queue');
})();
</script>
</body></html>`;

const DASH = new RegExp('[' + String.fromCharCode(8212) + String.fromCharCode(8211) + ']', 'g');
const hits = (html.match(DASH) || []).length;
if (hits > 0) { console.error(`ABORT: ${hits} em/en-dash`); process.exit(1); }
const outDir = process.argv[2] || path.join(os.homedir(), 'Downloads');
const out = path.join(outDir, 'ShipCES-Screens.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB, ${Object.keys(SCREENS).length} screens, ${TRACE.length} trace steps)`);
