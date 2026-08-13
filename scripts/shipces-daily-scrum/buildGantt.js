/*
 * ShipCES Autonomous Brokerage - Delivery Gantt + Milestones (standalone HTML).
 *
 * Consumes the same deliverable model as the daily email (./deliverables.js) so
 * the two never drift. Adds what Brett asked for on the Jul 9 call: dependency
 * icons on the Gantt bars (a bar cannot land until the one it depends on does),
 * plus each bar's one-sentence deliverable and its acceptance criterion.
 *
 *   node buildGantt.js            -> writes ~/Downloads/ShipCES-Delivery-Gantt-v2.html
 *   node buildGantt.js <outpath>  -> writes to an explicit path
 *
 * Standalone page (real CSS), self-contained, no external assets, no network.
 * No em-dashes or en-dashes (outgoing-comms rule).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const D = require('./deliverables');
const { COL, esc, stateMeta, DELIVERABLES } = D;

// ---- timeline (Mondays), presentation-only; content comes from the model ----
const WEEKS = ['Jun 30', 'Jul 7', 'Jul 14', 'Jul 21', 'Jul 28', 'Aug 4'];
const NW = WEEKS.length;
const TODAY_FRAC = (1 + 2 / 7) / NW; // Thu Jul 9 sits in the Jul 7 week

// Per-layer schedule bars. content (deliverable/acceptance/state/deps/name) is
// read from the model by key; only the schedule + phase label live here.
const BARS = [
  { key: 'ARCH',  start: 0, end: 5, phase: 'Foundation: ADRs + contracts (spans the build)', foundation: true },
  { key: 'GOV',   start: 0, end: 5, phase: 'Foundation: 2 approval gates + closure guardrail', foundation: true },
  { key: 'SENSE', start: 0, end: 1, phase: 'Adapter contract + mocks built', tail: { start: 2, end: 3, label: 'live DAT pending API', dashed: true } },
  { key: 'RMS',   start: 0, end: 1, phase: 'Built Jul 2', marker: 2, markerLabel: 'forward demo Jul 16' },
  { key: 'OMS',   start: 0, end: 1, phase: 'Built Jul 2' },
  { key: 'TMS',   start: 0, end: 1, phase: 'Built Jul 2' },
  { key: 'BMS',   start: 0, end: 1, phase: 'Baseline built', marker: 2, markerLabel: 'backward demo Jul 16 (fake data)', tail: { start: 3, end: 4, label: 'real data pending Brett walkthrough', dashed: true } },
  { key: 'PHASEC', start: 3, end: 5, phase: 'Execution + billing polish (planned)' },
];

// Vertical milestone markers over the grid, by week fraction.
const MARKERS = [
  { frac: (2 + 2 / 7) / NW, label: 'Thu Jul 16 demo', color: COL.amber },
  { frac: (1 + 4 / 7) / NW, label: 'Gate 1 review (Karun)', color: COL.navy },
];

function byKey(key) { return DELIVERABLES.find((d) => d.key === key); }
function shortName(key) { const d = byKey(key); return d ? (d.layer || d.name.split(' - ')[0]) : key; }
function depBadge(d) {
  const dep = (d.dependsOn || []).filter((k) => k !== 'all');
  if (!dep.length) return '';
  return `<span class="dep" title="cannot land until ${esc(dep.map(shortName).join(', '))} lands">&#9203; after ${esc(dep.map(shortName).join(', '))}</span>`;
}

function bar(b) {
  const d = byKey(b.key);
  const m = stateMeta(d.state);
  const arts = d.artifacts || [];
  const haveN = arts.filter((x) => x.have).length;
  const needN = arts.length - haveN;
  const left = (b.start / NW) * 100;
  const width = ((b.end - b.start + 1) / NW) * 100;
  const tail = b.tail
    ? `<div class="bar tail" style="left:${(b.tail.start / NW) * 100}%;width:${((b.tail.end - b.tail.start + 1) / NW) * 100}%;border-color:${m.color};color:${m.color};">${esc(b.tail.label)}</div>`
    : '';
  const marker = b.marker != null
    ? `<div class="milestone-dot" style="left:${((b.marker + 0.5) / NW) * 100}%;" title="${esc(b.markerLabel || '')}">&#9670;</div>`
    : '';
  return `
  <div class="row ${b.foundation ? 'foundation' : ''}">
    <div class="rowhead">
      <div class="layer">${esc(shortName(b.key))} ${depBadge(d)}</div>
      <div class="deliv">${esc(d.deliverable)}</div>
      <div class="accept"><b>Accepted when:</b> ${esc(d.acceptance)}</div>
      <div class="arts"><b>Artifacts:</b> ${haveN} have${needN ? `, <span style="color:${COL.amber};">${needN} to create</span>` : ''}</div>
    </div>
    <div class="track">
      <div class="bar" style="left:${left}%;width:${width}%;background:${m.color};">
        <span class="barlabel">${b.start !== b.end || width > 12 ? esc(b.phase) : ''}</span>
        <span class="statepill" style="background:rgba(255,255,255,.25);">${esc(m.label)}</span>
      </div>
      ${tail}
      ${marker}
    </div>
  </div>`;
}

function build() {
  const rows = BARS.map(bar).join('');
  const weekCols = WEEKS.map((w) => `<div class="wk">${esc(w)}</div>`).join('');
  const markerLines = MARKERS.map((mk) =>
    `<div class="mline" style="left:calc(340px + (100% - 340px) * ${mk.frac});border-color:${mk.color};"><span style="background:${mk.color};">${esc(mk.label)}</span></div>`
  ).join('');
  const todayLine = `<div class="mline today" style="left:calc(340px + (100% - 340px) * ${TODAY_FRAC});"><span>Today</span></div>`;

  const legend = Object.keys(D.STATE).map((k) => {
    const m = D.STATE[k];
    return `<span class="lg"><i style="background:${m.color}"></i>${esc(m.label)}</span>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ShipCES Delivery Gantt + Milestones</title>
<style>
  :root{--navy:${COL.navy};--border:${COL.border};--slate:${COL.slate};}
  *{box-sizing:border-box}
  body{margin:0;background:#eef2f7;color:#2d3748;font-family:Arial,Helvetica,sans-serif;font-size:14px;}
  .wrap{max-width:1100px;margin:0 auto;padding:22px;}
  header{background:var(--navy);color:#fff;border-radius:12px;padding:22px 26px;}
  header .ey{color:#9ec5e8;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;}
  header h1{font-size:24px;margin:6px 0 4px;}
  header p{color:#cbd9e8;font-size:13px;margin:4px 0 0;line-height:1.5;}
  .card{background:#fff;border-radius:12px;padding:18px 22px;margin-top:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);}
  h2{color:var(--navy);font-size:17px;margin:0 0 4px;}
  .sub{color:#718096;font-size:12px;margin:0 0 14px;}
  .legend{display:flex;gap:16px;flex-wrap:wrap;margin:6px 0 14px;font-size:12px;color:var(--slate);}
  .lg{display:flex;align-items:center;gap:6px}
  .lg i{width:12px;height:12px;border-radius:3px;display:inline-block}
  .dep{background:#fffaf0;color:${COL.amber};border:1px solid #fbd38d;border-radius:8px;padding:1px 7px;font-size:11px;font-weight:700;white-space:nowrap;margin-left:6px;}
  .gantt{position:relative;overflow-x:auto;}
  .weekhdr{display:flex;margin-left:340px;border-bottom:2px solid var(--border);}
  .weekhdr .wk{flex:1;text-align:center;font-size:11px;font-weight:700;color:var(--slate);padding:6px 0;min-width:70px;}
  .row{display:flex;align-items:stretch;border-bottom:1px solid var(--border);min-height:64px;}
  .row.foundation{background:#f7fafc;}
  .rowhead{width:340px;flex:0 0 340px;padding:8px 12px 8px 0;}
  .rowhead .layer{font-weight:800;color:var(--navy);font-size:13px;}
  .rowhead .deliv{font-size:11.5px;color:#2d3748;margin-top:3px;line-height:1.35;}
  .rowhead .accept{font-size:10.5px;color:#718096;margin-top:3px;line-height:1.3;}
  .rowhead .arts{font-size:10.5px;color:var(--slate);margin-top:3px;}
  .track{position:relative;flex:1;min-width:420px;}
  .bar{position:absolute;top:14px;height:26px;border-radius:6px;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;gap:8px;padding:0 10px;overflow:hidden;white-space:nowrap;}
  .bar.tail{top:14px;height:26px;background:transparent!important;border:2px dashed;color:inherit;font-weight:700;opacity:.9;}
  .barlabel{overflow:hidden;text-overflow:ellipsis;}
  .statepill{border-radius:8px;padding:1px 7px;font-size:10px;margin-left:auto;}
  .milestone-dot{position:absolute;top:8px;color:${COL.amber};font-size:16px;transform:translateX(-50%);}
  .mline{position:absolute;top:0;bottom:0;border-left:2px dashed;z-index:5;pointer-events:none;}
  .mline span{position:absolute;top:-2px;left:2px;font-size:9px;font-weight:700;color:#fff;padding:1px 5px;border-radius:6px;white-space:nowrap;}
  .mline.today{border-color:#2b6cb0;}
  .mline.today span{background:#2b6cb0;}
  .grid-body{position:relative;}
  .foot{color:#718096;font-size:11px;line-height:1.6;margin-top:14px;border-top:1px solid var(--border);padding-top:12px;}
</style></head>
<body><div class="wrap">
  <header>
    <div class="ey">ShipCES Autonomous Brokerage &middot; Delivery Gantt + Milestones</div>
    <h1>When each work stream lands, and what it delivers</h1>
    <p>Every bar is a deliverable. The hourglass shows a linked dependency: a bar cannot land until the one it depends on does. Color is the delivery state.</p>
  </header>

  <div class="card">
    <h2>Delivery Gantt</h2>
    <p class="sub">Forward track (Sense to RMS to OMS) and backward track (BMS) run in parallel toward the Thursday Jul 16 demo. Dashed bars are pending an external input.</p>
    <div class="legend">${legend}<span class="lg"><i style="background:#fffaf0;border:1px solid #fbd38d"></i>&#9203; linked dependency</span></div>
    <div class="gantt">
      <div class="weekhdr">${weekCols}</div>
      <div class="grid-body">
        ${rows}
        ${markerLines}
        ${todayLine}
      </div>
    </div>
    <div class="foot"><b>Method:</b> ${esc(D.PROVENANCE)}</div>
  </div>
</div></body></html>`;
}

const out = process.argv[2] || path.join(os.homedir(), 'Downloads', 'ShipCES-Delivery-Gantt-v2.html');
const html = build();
fs.writeFileSync(out, html, 'utf8');
console.log('Gantt written:', out, '(' + html.length + ' bytes)');
