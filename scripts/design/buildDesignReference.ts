/**
 * buildDesignReference.ts - renders Design System v2 as one self-contained page:
 * the competitive read, the token set, and the three signature patterns applied
 * to real cockpit screens.
 *
 * Data is real where real data exists (the corpus accuracy figures, the 12-agent
 * registry, invoice AF-INV-0001 at $2,982, the El Paso to Detroit parse). The
 * queue rows are representative, and labelled as such on the page, because the
 * point is the interaction design rather than a live feed.
 *
 * Spec: docs/design-system-v2.md
 * Usage: npx ts-node --transpile-only scripts/design/buildDesignReference.ts [outDir]
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Confidence meter on the shared ordinal ramp. Never a bare number. */
function meter(v: number): string {
  const p = Math.round(v * 100);
  const band = v >= 0.85 ? 'hi' : v >= 0.6 ? 'mid' : 'lo';
  return `<span class="meter ${band}" role="img" aria-label="confidence ${p} percent">
    <span class="meter-track"><span class="meter-fill" style="width:${p}%"></span></span>
    <span class="meter-val">${(v).toFixed(2)}</span></span>`;
}

/** Status: glyph + label + color, in that order of importance. */
function chip(kind: 'ok' | 'attn' | 'block' | 'idle', label: string): string {
  const gly = { ok: '&#10003;', attn: '&#9873;', block: '&#10005;', idle: '&#8226;' }[kind];
  return `<span class="chip ${kind}"><span class="gly" aria-hidden="true">${gly}</span>${esc(label)}</span>`;
}

/** A field with its evidence. No evidence span means the machine invented it. */
function field(label: string, value: string, rule: string | null, evidence: string | null): string {
  const invented = evidence === null;
  return `<div class="fld${invented ? ' assumed' : ''}">
    <div class="fld-k">${esc(label)}</div>
    <div class="fld-v">${esc(value)}${invented ? '<span class="assumed-tag">assumed</span>' : ''}</div>
    ${rule ? `<div class="fld-rule"><code>${esc(rule)}</code></div>` : '<div class="fld-rule"></div>'}
    <div class="fld-ev">${
      evidence
        ? `<span class="ev">&ldquo;${esc(evidence)}&rdquo;</span>`
        : '<span class="ev none">no evidence in the email</span>'
    }</div>
  </div>`;
}

const AGENTS = [
  { name: 'Intake', layer: 'RMS', rung: 'act', limit: 'confidence &ge; 0.90', next: null },
  { name: 'Evaluate Opportunity', layer: 'RMS', rung: 'act', limit: 'D4 must-haves present', next: null },
  { name: 'Extractor', layer: 'RMS', rung: 'draft', limit: 'regex baseline live; LLM behind the same contract', next: 'Act at 80% lane recall. Now 34.3% over 35 emails.' },
  { name: 'Quoting', layer: 'OMS', rung: 'draft', limit: 'margin floor 7%', next: 'Act at 95% agreement over 200 quotes. Not started.' },
  { name: 'Tender', layer: 'OMS', rung: 'act', limit: 'EDI 910, WON only', next: null },
  { name: 'Procurement', layer: 'TMS', rung: 'suggest', limit: 'DAT on mock engine', next: 'Draft when the DAT account lands. Blocked on ShipCES.' },
  { name: 'Tracking', layer: 'TMS', rung: 'act', limit: 'EDI 214 codes only', next: null },
  { name: 'Rate Audit', layer: 'BMS', rung: 'act', limit: 'margin &ge; 5%', next: null },
  { name: 'Invoice', layer: 'BMS', rung: 'draft', limit: 'fails closed with no linehaul', next: 'Act after Brett invoice-anatomy walkthrough. Overdue.' },
];

const QUEUE = [
  {
    lane: 'Laredo, TX to Nashville, TN', cust: 'Berpar', layer: 'RMS', conf: 0.42,
    why: 'Lane found, pickup date missing', rule: 'D4 must-have', age: '4m',
  },
  {
    lane: 'Acatlán to Atlanta, GA', cust: 'Arizlu', layer: 'RMS', conf: 0.20,
    why: 'Spanish, no lane extracted by the regex baseline', rule: 'D14 route', age: '11m',
  },
  {
    lane: 'El Paso, TX to Detroit, MI', cust: 'MKS Global', layer: 'OMS', conf: 0.90,
    why: 'Quote 3% under margin floor', rule: 'margin gate', age: '26m',
  },
  {
    lane: 'Toccoa, GA to Monterrey', cust: 'Hartrodt', layer: 'TMS', conf: 0.61,
    why: 'Cross-border, no Monterrey specialist assigned', rule: 'HITL W7', age: '1h',
  },
];

const rung = (r: string) =>
  `<span class="rung ${r}"><span class="rung-dot" aria-hidden="true"></span>${
    r === 'act' ? 'Act' : r === 'draft' ? 'Draft' : 'Suggest'
  }</span>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autonomy Cockpit: Design System v2</title>
<style>
  :root{
    color-scheme: light;
    --plane:#f4f6f9; --surface:#ffffff; --raised:#fbfcfd; --line:#e3e8ef;
    --ink:#0f1729; --ink2:#4a5568; --muted:#7b8794;
    --rms:#86b6ef; --oms:#5598e7; --tms:#2a78d6; --bms:#1c5cab;
    --accent:#2a78d6; --accent-soft:#eaf2fd;
    --ok:#0a7a37; --ok-bg:#e8f6ed; --attn:#8a5a00; --attn-bg:#fdf3e0;
    --block:#a32020; --block-bg:#fceceb; --idle:#64748b; --idle-bg:#f1f4f8;
    --track:#e8edf4;
  }
  @media (prefers-color-scheme: dark){
    :root:where(:not([data-theme="light"])){
      color-scheme: dark;
      --plane:#0f1319; --surface:#171c24; --raised:#1e242e; --line:#2a323e;
      --ink:#e8eef6; --ink2:#a7b3c4; --muted:#7b8794;
      --rms:#184f95; --oms:#256abf; --tms:#3987e5; --bms:#6da7ec;
      --accent:#3987e5; --accent-soft:#16243a;
      --ok:#4ade80; --ok-bg:#132a1d; --attn:#fbbf24; --attn-bg:#2e2410;
      --block:#f87171; --block-bg:#2f1618; --idle:#8b98a9; --idle-bg:#1c222b;
      --track:#242c38;
    }
  }
  :root[data-theme="dark"]{
    color-scheme: dark;
    --plane:#0f1319; --surface:#171c24; --raised:#1e242e; --line:#2a323e;
    --ink:#e8eef6; --ink2:#a7b3c4; --muted:#7b8794;
    --rms:#184f95; --oms:#256abf; --tms:#3987e5; --bms:#6da7ec;
    --accent:#3987e5; --accent-soft:#16243a;
    --ok:#4ade80; --ok-bg:#132a1d; --attn:#fbbf24; --attn-bg:#2e2410;
    --block:#f87171; --block-bg:#2f1618; --idle:#8b98a9; --idle-bg:#1c222b;
    --track:#242c38;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--plane);color:var(--ink2);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,sans-serif;
    -webkit-font-smoothing:antialiased}
  .wrap{max-width:1180px;margin:0 auto;padding:0 22px 80px}
  code{font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--raised);
    border:1px solid var(--line);padding:1px 5px;border-radius:4px;color:var(--ink2)}
  h1,h2,h3,h4{color:var(--ink);letter-spacing:-.2px}

  header{padding:44px 22px 34px;border-bottom:1px solid var(--line);background:var(--surface)}
  header .in{max-width:1180px;margin:0 auto}
  .eyebrow{font-size:11.5px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:var(--accent)}
  header h1{margin:9px 0 10px;font-size:31px;letter-spacing:-.8px}
  header p{margin:0;max-width:74ch;font-size:15.5px}
  .toggle{margin-top:22px;display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
  .toggle button{background:var(--surface);border:0;padding:7px 15px;font-size:13px;color:var(--ink2);cursor:pointer;font-family:inherit}
  .toggle button[aria-pressed="true"]{background:var(--accent);color:#fff}

  h2{font-size:13px;text-transform:uppercase;letter-spacing:1.1px;color:var(--muted);
    margin:52px 0 5px;font-weight:700}
  h2 .n{color:var(--accent);margin-right:8px}
  .lede{margin:0 0 20px;font-size:20px;color:var(--ink);max-width:70ch;letter-spacing:-.3px;line-height:1.45}
  .note{font-size:13.5px;color:var(--muted);max-width:78ch;margin:-12px 0 18px}

  .card{background:var(--surface);border:1px solid var(--line);border-radius:10px}
  .pad{padding:20px 22px}

  /* ---- competitive read ---- */
  .comp{display:grid;grid-template-columns:repeat(auto-fit,minmax(232px,1fr));gap:12px}
  .comp .c{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:15px 17px}
  .comp .c h4{margin:0 0 3px;font-size:14.5px}
  .comp .c .bet{font-size:12px;color:var(--muted);margin-bottom:9px}
  .comp .c p{margin:0;font-size:13px;line-height:1.5}
  .comp .c.avoid{border-color:var(--block);background:var(--block-bg)}
  .comp .c.avoid h4{color:var(--block)}
  .gap{margin-top:14px;border-left:3px solid var(--accent);background:var(--accent-soft);
    border-radius:0 10px 10px 0;padding:16px 20px}
  .gap b{color:var(--ink)}

  /* ---- pipeline nav ---- */
  .pipe{display:flex;gap:2px;background:var(--surface);border:1px solid var(--line);
    border-radius:10px;padding:6px;overflow-x:auto}
  .pipe .s{flex:1;min-width:132px;border-radius:7px;padding:11px 13px;color:#fff;position:relative}
  .pipe .s .l{font-size:10.5px;letter-spacing:.9px;text-transform:uppercase;opacity:.9;font-weight:700}
  .pipe .s .t{font-size:13.5px;font-weight:600;margin-top:2px}
  .pipe .s .m{font-size:11.5px;opacity:.88;margin-top:3px;font-variant-numeric:tabular-nums}
  .s.rms{background:var(--rms)} .s.oms{background:var(--oms)}
  .s.tms{background:var(--tms)} .s.bms{background:var(--bms)}
  :root:where(:not([data-theme="light"])) .s.rms .l,
  :root:where(:not([data-theme="light"])) .s.rms .t{color:#fff}
  .s.rms{color:#0f1729}
  @media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])) .s.rms{color:#fff}}
  :root[data-theme="dark"] .s.rms{color:#fff}
  :root[data-theme="dark"] .s.bms{color:#0f1729}
  @media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])) .s.bms{color:#0f1729}}

  /* ---- queue ---- */
  .qhead{display:flex;align-items:baseline;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:11px}
  .qhead h3{margin:0;font-size:17px}
  .qhead .sub{font-size:13px;color:var(--muted)}
  .q{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .qrow{display:grid;grid-template-columns:6px 1fr 168px 120px 140px;gap:0;align-items:center;
    border-bottom:1px solid var(--line);transition:background .1s}
  .qrow:last-child{border-bottom:0}
  .qrow:hover{background:var(--raised)}
  .qrow .bar{align-self:stretch}
  .qrow .main{padding:13px 16px;min-width:0}
  .qrow .lane{font-size:14.5px;font-weight:600;color:var(--ink)}
  .qrow .cust{font-size:12.5px;color:var(--muted);margin-top:1px}
  .qrow .why{padding:13px 10px;font-size:12.5px;color:var(--ink2)}
  .qrow .why code{display:inline-block;margin-top:3px;font-size:11px}
  .qrow .cf{padding:13px 10px}
  .qrow .act{padding:13px 16px;display:flex;gap:7px;justify-content:flex-end}
  .btn{font:600 12.5px inherit;font-family:inherit;border-radius:6px;padding:6px 12px;cursor:pointer;
    border:1px solid var(--line);background:var(--surface);color:var(--ink2)}
  .btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
  .btn:hover{border-color:var(--accent)}
  .empty{padding:34px 22px;text-align:center}
  .empty .big{font-size:17px;color:var(--ink);font-weight:600}
  .empty .sm{font-size:13.5px;color:var(--muted);margin-top:4px}

  /* ---- reason strip ---- */
  .meter{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
  .meter-track{width:52px;height:6px;border-radius:3px;background:var(--track);overflow:hidden;display:inline-block}
  .meter-fill{display:block;height:100%;border-radius:3px;background:var(--tms)}
  .meter.hi .meter-fill{background:var(--bms)}
  .meter.mid .meter-fill{background:var(--oms)}
  .meter.lo .meter-fill{background:var(--rms)}
  .meter-val{font:600 12.5px/1 inherit;font-variant-numeric:tabular-nums;color:var(--ink)}

  .flds{display:grid;grid-template-columns:repeat(auto-fit,minmax(238px,1fr));gap:1px;background:var(--line);
    border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .fld{background:var(--surface);padding:13px 16px}
  .fld-k{font-size:10.5px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);font-weight:700}
  .fld-v{font-size:15px;color:var(--ink);font-weight:600;margin-top:3px}
  .fld.assumed .fld-v{color:var(--muted);font-weight:500;text-decoration:underline dashed var(--muted) 1px;text-underline-offset:3px}
  .assumed-tag{margin-left:7px;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;
    color:var(--attn);background:var(--attn-bg);padding:2px 6px;border-radius:4px;vertical-align:middle}
  .fld-rule{margin-top:6px;min-height:20px}
  .fld-ev{margin-top:5px;font-size:12px;line-height:1.45}
  .ev{color:var(--ink2);background:var(--accent-soft);padding:2px 6px;border-radius:4px;
    box-decoration-break:clone;-webkit-box-decoration-break:clone}
  .ev.none{background:transparent;color:var(--muted);font-style:italic}

  /* ---- chips / rungs ---- */
  .chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;
    padding:3px 9px;border-radius:4px;white-space:nowrap}
  .chip .gly{font-weight:700}
  .chip.ok{color:var(--ok);background:var(--ok-bg)}
  .chip.attn{color:var(--attn);background:var(--attn-bg)}
  .chip.block{color:var(--block);background:var(--block-bg)}
  .chip.idle{color:var(--idle);background:var(--idle-bg)}

  .ladder{width:100%;border-collapse:collapse;font-size:13.5px}
  .ladder th{text-align:left;padding:9px 12px;font-size:10.5px;letter-spacing:.8px;text-transform:uppercase;
    color:var(--muted);border-bottom:1px solid var(--line);font-weight:700}
  .ladder td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
  .ladder tr:last-child td{border-bottom:0}
  .ladder tbody tr:hover{background:var(--raised)}
  .lyr{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.7px;color:#fff;
    padding:2px 7px;border-radius:4px}
  .lyr.RMS{background:var(--rms);color:#0f1729} .lyr.OMS{background:var(--oms)}
  .lyr.TMS{background:var(--tms)} .lyr.BMS{background:var(--bms)}
  :root[data-theme="dark"] .lyr.RMS{color:#fff} :root[data-theme="dark"] .lyr.BMS{color:#0f1729}
  .rung{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--ink)}
  .rung-dot{width:11px;height:11px;border-radius:50%;border:2px solid var(--accent);display:inline-block}
  .rung.draft .rung-dot{background:linear-gradient(90deg,var(--accent) 50%,transparent 50%)}
  .rung.act .rung-dot{background:var(--accent)}
  .next{font-size:12px;color:var(--muted)}

  /* ---- tokens ---- */
  .swatches{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:10px}
  .sw{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface)}
  .sw .b{height:52px}
  .sw .n{padding:8px 10px;font-size:11.5px}
  .sw .n b{display:block;color:var(--ink);font-size:12.5px}
  .sw .n span{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:var(--muted)}

  footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)}
  footer a{color:var(--accent)}
  @media (max-width:820px){
    .qrow{grid-template-columns:6px 1fr;grid-auto-rows:min-content}
    .qrow .why,.qrow .cf,.qrow .act{grid-column:2;padding-top:0}
    .qrow .act{justify-content:flex-start;padding-bottom:13px}
  }
</style></head><body>

<header><div class="in">
  <div class="eyebrow">Design System v2</div>
  <h1>The Autonomy Cockpit</h1>
  <p>Every competitor sells autonomy. None of them shows the operator <em>why</em> the machine decided
  what it decided. That is the adoption blocker, and it is the one thing we already have the data to
  solve. This is that system, applied to real screens.</p>
  <div class="toggle" role="group" aria-label="Theme">
    <button id="tl" aria-pressed="false">Light</button>
    <button id="td" aria-pressed="false">Dark</button>
  </div>
</div></header>

<div class="wrap">

  <h2><span class="n">01</span>What the competition actually does</h2>
  <p class="lede">We are not reinventing anything. Four products are worth copying and one is worth avoiding.</p>
  <div class="comp">
    <div class="c"><h4>Rose Rocket</h4><div class="bet">Configurable boards, named AI agents</div>
      <p>Reviewers call it <em>&ldquo;Apple-esque, beautiful to look at, but it directs the eyes where they need
      to be.&rdquo;</em> Rows carry operational meaning: <em>&ldquo;every row that&rsquo;s red is delivering today.&rdquo;</em>
      Agents are named and personified, not a checkbox labelled AI.</p></div>
    <div class="c"><h4>Alvys</h4><div class="bet">One window for broker and carrier</div>
      <p>At-a-glance status buttons. Alerts pull the loads that need attention to the top instead of
      making the operator hunt for them.</p></div>
    <div class="c"><h4>Turvo</h4><div class="bet">Multi-party collaboration</div>
      <p><em>&ldquo;Consumer-grade UI/UX&rdquo;</em> as a stated goal, and <em>&ldquo;google-like search&rdquo;</em> as the
      primary way to navigate rather than a nav tree.</p></div>
    <div class="c"><h4>Vooma</h4><div class="bet">AI agents over inbox, phone, text</div>
      <p>The autonomy ladder: copilot, auto-draft, or fully autonomous, chosen per workflow. Agents work
      overnight and <em>&ldquo;hand reps a short list of real exceptions.&rdquo;</em></p></div>
    <div class="c avoid"><h4>McLeod LoadMaster</h4><div class="bet">The incumbent. What to avoid.</div>
      <p>Roots in the 1980s. Reviewers: <em>&ldquo;very outdated&rdquo;</em>, <em>&ldquo;steep learning curve&rdquo;</em>,
      <em>&ldquo;intimidating&rdquo;</em>, and you need a <em>trained key user</em> to run an internal help desk.</p></div>
  </div>
  <div class="gap">
    <b>The gap.</b> Across every one of those products, the published material contains no confidence
    display, no decision transparency, and no approval or audit surface. Vooma&rsquo;s own model is a short
    list of exceptions with the reasoning left off screen. A broker will not let software quote
    unattended until they can see why it wants to, so <b>we show our work.</b> Three patterns carry
    that, below. Everything else here is competent table stakes borrowed from the four above.
  </div>

  <h2><span class="n">02</span>Quote to cash is the navigation</h2>
  <p class="lede">Buyers evaluate by driving one load from quote through settlement. Our forward track
  is that path, so the demo script and the navigation become the same object.</p>
  <p class="note">A 2026 buyer guide puts it directly: <em>&ldquo;A polished dashboard should not outweigh a
  broken quote-to-cash path.&rdquo;</em> The four layers are ordered stages, not categories, so they take a
  single-hue ordinal ramp: intensity rises with progress. That is semantically truer than four
  arbitrary colors and it sidesteps the four-slot colorblindness cap a categorical set would hit.</p>
  <div class="pipe">
    <div class="s rms"><div class="l">RMS</div><div class="t">Intake &amp; RFQ</div><div class="m">35 emails &middot; 12 parsed</div></div>
    <div class="s oms"><div class="l">OMS</div><div class="t">Stage &amp; Tender</div><div class="m">8 staged &middot; 3 won</div></div>
    <div class="s tms"><div class="l">TMS</div><div class="t">Source &amp; Track</div><div class="m">3 in transit</div></div>
    <div class="s bms"><div class="l">BMS</div><div class="t">Bill &amp; Settle</div><div class="m">AF-INV-0001 &middot; $2,982</div></div>
  </div>

  <h2><span class="n">03</span>Pattern one: the exception queue</h2>
  <p class="lede">The home screen. On a good day it is nearly empty, and empty is a success state.</p>
  <p class="note">Vooma&rsquo;s short list of real exceptions, with the two things they leave out: the reason
  and the confidence. Approve or override sits next to the decision, never in a settings page.
  Rows below are representative; the lanes, customers and confidence values come from the real corpus.</p>
  <div class="qhead">
    <h3>Needs a human</h3>
    <div class="sub">4 of 35 today &middot; 25 auto-cleared &middot; 6 still parsing</div>
  </div>
  <div class="q">
    ${QUEUE.map(
      (q) => `<div class="qrow">
      <div class="bar" style="background:var(--${q.layer.toLowerCase()})"></div>
      <div class="main"><div class="lane">${esc(q.lane)}</div>
        <div class="cust">${esc(q.cust)} &middot; <span class="lyr ${q.layer}">${q.layer}</span> &middot; ${esc(q.age)} ago</div></div>
      <div class="why">${esc(q.why)}<br><code>${esc(q.rule)}</code></div>
      <div class="cf">${meter(q.conf)}</div>
      <div class="act"><button class="btn">Override</button><button class="btn primary">Approve</button></div>
    </div>`
    ).join('\n')}
  </div>
  <div class="card pad" style="margin-top:12px">
    <div class="empty">
      <div class="big">${chip('ok', 'Queue clear')} Nothing needs you right now.</div>
      <div class="sm">25 RFQs cleared automatically in the last hour. The empty state is the goal, not a blank screen.</div>
    </div>
  </div>

  <h2><span class="n">04</span>Pattern two: the reason strip</h2>
  <p class="lede">Every extracted value carries the rule that produced it and the customer&rsquo;s own words
  that justify it. A value with no evidence is a value we invented, and it has to look invented.</p>
  <p class="note">This is a real parse from the corpus. Note the weight: the parser substitutes 1 lb when
  extraction misses, and today that sentinel is indistinguishable from real data downstream. Rendering
  it as <em>assumed</em> is how a silent defect becomes a visible one.</p>
  <div class="flds">
    ${field('Origin', 'El Paso, TX', 'D7 location grammar', 'pick up in El Paso TX')}
    ${field('Destination', 'Detroit, MI', 'D7 location grammar', 'deliver to Detroit MI')}
    ${field('Equipment', 'Sprinter', 'D5 smallest-fit', 'need a sprinter van')}
    ${field('Weight', '1 lb', 'D5 fallback', null)}
    ${field('Pickup date', 'not found', 'D8 urgency', null)}
    ${field('Service types', '5 options, expedite exclusive first', 'D6.3 firing rule', 'ASAP')}
  </div>

  <h2><span class="n">05</span>Pattern three: the autonomy ladder</h2>
  <p class="lede">Vooma&rsquo;s copilot, auto-draft and autonomous, taken further: per agent, on one screen,
  with the promotion criterion stated. An operator always knows what the machine may do, and what it
  would have to earn to do more.</p>
  <div class="card">
    <table class="ladder">
      <thead><tr><th>Agent</th><th>Layer</th><th>Rung</th><th>Operating limit</th><th>To earn the next rung</th></tr></thead>
      <tbody>
      ${AGENTS.map(
        (a) => `<tr>
        <td style="color:var(--ink);font-weight:600">${esc(a.name)}</td>
        <td><span class="lyr ${a.layer}">${a.layer}</span></td>
        <td>${rung(a.rung)}</td>
        <td style="font-size:12.5px">${a.limit}</td>
        <td class="next">${a.next ? esc(a.next) : chip('ok', 'at ceiling')}</td>
      </tr>`
      ).join('\n')}
      </tbody>
    </table>
  </div>

  <h2><span class="n">06</span>Tokens</h2>
  <p class="lede">Validated with the colour validator, not chosen by eye. Both modes are selected,
  never an automatic flip.</p>
  <p class="note">The pipeline ramp passes every ordinal check in both modes: monotone lightness,
  adjacent gaps, single hue at 3&deg; spread, light end clear of the surface. Worth flagging: the
  project&rsquo;s current tokens <code>#e53e3e</code> and <code>#dd6b20</code> measure &Delta;E 9.2 for
  <em>normal</em> vision, under the 15 floor. They are hard to tell apart before colourblindness is
  even considered, so they are replaced here and must never appear as adjacent states.</p>
  <div class="swatches">
    ${[
      ['RMS', 'var(--rms)', '#86b6ef'], ['OMS', 'var(--oms)', '#5598e7'],
      ['TMS', 'var(--tms)', '#2a78d6'], ['BMS', 'var(--bms)', '#1c5cab'],
      ['Good', 'var(--ok)', '#0a7a37'], ['Attention', 'var(--attn)', '#8a5a00'],
      ['Blocked', 'var(--block)', '#a32020'], ['Idle', 'var(--idle)', '#64748b'],
    ].map(([n, v, hex]) => `<div class="sw"><div class="b" style="background:${v}"></div>
        <div class="n"><b>${n}</b><span>${hex}</span></div></div>`).join('\n')}
  </div>
  <div class="card pad" style="margin-top:12px">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      ${chip('ok', 'Auto-cleared')} ${chip('attn', 'Needs a human')} ${chip('block', 'Failed closed')} ${chip('idle', 'Not applicable')}
      <span style="margin-left:8px">${meter(0.9)}</span> <span>${meter(0.61)}</span> <span>${meter(0.2)}</span>
    </div>
    <p style="margin:14px 0 0;font-size:13px;color:var(--muted)">Status is glyph, then label, then colour,
    in that order of importance. Remove the colour and every screen above still works.</p>
  </div>

  <footer>
    Spec: <code>docs/design-system-v2.md</code>. Rendered by
    <code>scripts/design/buildDesignReference.ts</code>. Competitive read from published product and
    review material, 2026-08-06:
    <a href="https://www.roserocket.com/">Rose Rocket</a>,
    <a href="https://alvys.com/">Alvys</a>,
    <a href="https://turvo.com/">Turvo</a>,
    <a href="https://www.vooma.com/solutions/quote">Vooma</a>,
    <a href="https://arktms.com/blog/best-tms-platforms-freight-brokers-2026">ARK TMS 2026 comparison</a>,
    <a href="https://softwareconnect.com/reviews/mcleod-loadmaster/">McLeod reviews</a>.
    Marketing pages describe features rather than pixels, so this is an information-architecture and
    interaction read, not a pixel teardown.
  </footer>
</div>

<script>
  (function(){
    var r=document.documentElement, tl=document.getElementById('tl'), td=document.getElementById('td');
    function set(m){ if(m){r.setAttribute('data-theme',m);}else{r.removeAttribute('data-theme');}
      tl.setAttribute('aria-pressed', String(m==='light')); td.setAttribute('aria-pressed', String(m==='dark')); }
    tl.onclick=function(){ set(r.getAttribute('data-theme')==='light'?null:'light'); };
    td.onclick=function(){ set(r.getAttribute('data-theme')==='dark'?null:'dark'); };
  })();
</script>
</body></html>`;

const DASH = new RegExp('[' + String.fromCharCode(8212) + String.fromCharCode(8211) + ']', 'g');
const hits = (html.match(DASH) || []).length;
if (hits > 0) {
  console.error(`ABORT: ${hits} em/en-dash`);
  process.exit(1);
}

const outDir = process.argv[2] || path.join(os.homedir(), 'Downloads');
const out = path.join(outDir, 'ShipCES-Design-V2.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB)`);
console.log(`em/en-dash: ${hits}`);
