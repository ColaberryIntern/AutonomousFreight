/*
 * ShipCES Autonomous Brokerage - daily delivery report generator + sender.
 *
 * A PMBOK 8th-edition work-performance report: each work stream is shown as a
 * verifiable DELIVERABLE with ACCEPTANCE CRITERIA and a state on the
 * verify-to-accept chain, with dependency icons on the birds-eye bars and a
 * "this week's demo = these deliverables" agenda. The deliverable model lives in
 * ./deliverables.js so this file and the Gantt export share one source of truth.
 *
 * Runs INSIDE the accelerator-backend container (has BASECAMP_ACCESS_TOKEN,
 * BASECAMP_ACCOUNT_ID, MANDRILL_API_KEY/SMTP_* in env, plus nodemailer). Pulls
 * live Basecamp data for each active list, joins it to the deliverable model,
 * renders an HTML email, and sends it.
 *
 *   node dailyScrum.js            -> sends To ali, Cc karun/ram/saitejesh
 *   node dailyScrum.js --test     -> sends To ali only, subject prefixed [TEST]
 *   node dailyScrum.js --preview  -> no network, no send; renders HTML to a file
 *                                    (uses a labeled sample snapshot for counts)
 *
 * No em-dashes or en-dashes in any output (outgoing-comms rule).
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const D = require('./deliverables');
const { COL, esc } = D;

const TEST = process.argv.includes('--test');
const PREVIEW = process.argv.includes('--preview');
const PROJECT_ID = 47126345;
const ACCOUNT = process.env.BASECAMP_ACCOUNT_ID || '3945211';
let TOKEN = '';

// The Basecamp OAuth token rotates ~biweekly. The container's
// BASECAMP_ACCESS_TOKEN env goes stale, so CCPP (Basecamp_AuthInfo) is the
// source of truth. Fall back to the env token only if the DB read fails.
// mssql is required lazily so --preview runs on a machine without it installed.
async function resolveToken() {
  let sql;
  try {
    sql = require('mssql');
  } catch (e) {
    console.error('mssql not available; using env token only.');
    let env0 = process.env.BASECAMP_ACCESS_TOKEN || '';
    if (env0 && !/^Bearer /i.test(env0)) env0 = 'Bearer ' + env0;
    return env0;
  }
  try {
    const pool = await sql.connect({
      user: process.env.MSSQL_USER,
      password: process.env.MSSQL_PASS,
      server: process.env.MSSQL_HOST,
      port: Number(process.env.MSSQL_PORT) || 1433,
      database: process.env.MSSQL_DATABASE || 'CCPP',
      options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
      connectionTimeout: 15000,
      requestTimeout: 15000,
    });
    const r = await pool.request().query("SELECT TOP 1 AccessToken FROM [CCPP].dbo.Basecamp_AuthInfo WHERE IsActive = 1 ORDER BY CreatedDate DESC");
    try { await sql.close(); } catch (x) {}
    const tok = r.recordset && r.recordset[0] && r.recordset[0].AccessToken;
    if (tok) return /^Bearer /i.test(tok) ? tok : 'Bearer ' + tok;
  } catch (e) {
    try { await sql.close(); } catch (x) {}
    console.error('CCPP token fetch failed:', e.message);
  }
  let env = process.env.BASECAMP_ACCESS_TOKEN || '';
  if (env && !/^Bearer /i.test(env)) env = 'Bearer ' + env;
  return env;
}

// The 9 active lists (+ Phase C) stood up Jun 18. Kept here for live fetch + URLs;
// the deliverable content for each joins by `num` from ./deliverables.js.
const LISTS = [
  { id: 10095533315, num: 'R', name: 'Releases + Demo Schedule (R0 to R6)', owner: 'Ali', layer: null },
  { id: 10011499579, num: 1, name: 'Cadence + Weekly Demo Prep', owner: 'Ali', layer: null },
  { id: 10011499624, num: 2, name: 'Architecture + Documentation', owner: 'Karun', layer: null },
  { id: 10011499657, num: 3, name: 'RMS - Email + RFQ intake (W1)', owner: 'Ali + Karun', layer: 'RMS' },
  { id: 10011499691, num: 4, name: 'OMS - Order staging + tender', owner: 'Ali', layer: 'OMS' },
  { id: 10011499735, num: 5, name: 'TMS - Transportation lifecycle', owner: 'Ali / Jen', layer: 'TMS' },
  { id: 10011499791, num: 6, name: 'BMS - Billing + invoice', owner: 'Brett + Karun', layer: 'BMS' },
  { id: 10011499841, num: 7, name: 'Sense Layer - Adapters', owner: 'Ali', layer: 'SENSE' },
  { id: 10011499885, num: 8, name: 'Governance + Mgmt Integration', owner: 'Ali / Ram', layer: 'GOV' },
  { id: 10011499935, num: 9, name: 'Backlog Audit + Cleanup', owner: 'Ali', layer: null },
  { id: 9850502673, num: 'C', name: 'Phase C - Execution + Billing Polish', owner: 'TBD', layer: null },
];

function listById(num) { return LISTS.find((l) => l.num === num); }
function listUrl(id) { return `https://app.basecamp.com/${ACCOUNT}/buckets/${PROJECT_ID}/todolists/${id}`; }
function listUrlForNum(num) { const l = listById(num); return l ? listUrl(l.id) : projUrl(); }
function projUrl() { return `https://app.basecamp.com/${ACCOUNT}/buckets/${PROJECT_ID}`; }

// ---- date helpers, all in America/Chicago ----
function centralParts(d) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const p = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  return p;
}
function ymd(d) { const p = centralParts(d); return `${p.year}-${p.month}-${p.day}`; }
function addDays(ymdStr, n) {
  const dt = new Date(ymdStr + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function dow(ymdStr) { return new Date(ymdStr + 'T12:00:00Z').getUTCDay(); }
function pretty(ymdStr) {
  const dt = new Date(ymdStr + 'T12:00:00Z');
  return dt.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}
function prettyLong(ymdStr) {
  const dt = new Date(ymdStr + 'T12:00:00Z');
  return dt.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

const TODAY = ymd(new Date());
const TODAY_DOW = dow(TODAY);
const daysToThu = (4 - TODAY_DOW + 7) % 7;
const NEXT_DEMO = addDays(TODAY, daysToThu);
const LAST_DEMO = addDays(TODAY, -((TODAY_DOW - 4 + 7) % 7) || -7);
const DUE_SOON_DAYS = 3;

// ---- Basecamp API ----
function bcGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: '3.basecampapi.com', path, method: 'GET',
      headers: { Authorization: TOKEN, 'User-Agent': 'Colaberry Daily Scrum (ali@colaberry.com)', 'Content-Type': 'application/json' },
      timeout: 15000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          let json = [];
          try { json = JSON.parse(body); } catch (e) {}
          let next = null;
          const link = res.headers.link;
          if (link) { const m = link.match(/<([^>]+)>;\s*rel="next"/); if (m) next = m[1]; }
          resolve({ json, next });
        } else {
          reject(new Error('HTTP ' + res.statusCode + ' for ' + path));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout ' + path)));
    req.end();
  });
}
async function fetchTodos(listId, completed) {
  const out = [];
  let p = `/${ACCOUNT}/buckets/${PROJECT_ID}/todolists/${listId}/todos.json?completed=${completed ? 'true' : 'false'}`;
  for (let page = 0; page < 5 && p; page++) {
    const { json, next } = await bcGet(p);
    if (Array.isArray(json)) out.push(...json);
    if (!next) break;
    p = next.replace('https://3.basecampapi.com', '');
  }
  return out;
}

// Turn one list's live todos into a report row.
function rowFromTodos(L, openTodos, doneTodos) {
  const r = { L, open: openTodos.length, done: doneTodos.length, overdue: 0, dueSoon: 0, items: [], error: false };
  for (const t of openTodos) {
    const due = t.due_on || null;
    if (due && due < TODAY) r.overdue++;
    else if (due && due <= addDays(TODAY, DUE_SOON_DAYS)) r.dueSoon++;
    r.items.push({
      title: t.content || t.title || 'untitled', due,
      url: t.app_url || `https://app.basecamp.com/${ACCOUNT}/buckets/${PROJECT_ID}/todos/${t.id}`,
      assignee: (t.assignees && t.assignees[0] && t.assignees[0].name) || '',
    });
  }
  r.items.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  return r;
}

async function gatherRows() {
  const rows = [];
  let dataWarning = '';
  for (const L of LISTS) {
    try {
      const openTodos = await fetchTodos(L.id, false);
      let doneTodos = [];
      try { doneTodos = await fetchTodos(L.id, true); } catch (e) {}
      rows.push(rowFromTodos(L, openTodos, doneTodos));
    } catch (e) {
      rows.push({ L, open: 0, done: 0, overdue: 0, dueSoon: 0, items: [], error: true });
      dataWarning = 'Some lists could not be read from Basecamp at run time; counts may be partial.';
    }
  }
  return { rows, dataWarning };
}

// Network-free sample snapshot for --preview so the design can be reviewed
// without Basecamp or MSSQL. Counts are illustrative and labeled as a sample.
function previewRows() {
  const snap = {
    1: { open: 3, done: 5, overdue: 0 }, 2: { open: 1, done: 6, overdue: 0 },
    3: { open: 2, done: 8, overdue: 1 }, 4: { open: 1, done: 6, overdue: 0 },
    5: { open: 2, done: 6, overdue: 1 }, 6: { open: 4, done: 3, overdue: 0 },
    7: { open: 3, done: 5, overdue: 0 }, 8: { open: 2, done: 4, overdue: 0 },
    9: { open: 5, done: 10, overdue: 2 }, C: { open: 4, done: 0, overdue: 0 },
  };
  const sampleItems = {
    3: [{ t: 'Wire the Claude extractor as the default parser', d: addDays(TODAY, 2) },
        { t: 'Backfill D22 MX dimension values', d: addDays(TODAY, -2) }],
    5: [{ t: 'FMCSA insurance-minimum thresholds by equipment', d: addDays(TODAY, 1) },
        { t: 'Recovery plan copy for the 5 exception sub-types', d: addDays(TODAY, -3) }],
    6: [{ t: 'Accessorial + FSC model from Brett invoice-anatomy walkthrough', d: addDays(TODAY, 6) },
        { t: 'BMS demo on fake data for Jul 16', d: addDays(TODAY, 6) }],
    7: [{ t: 'DAT API scope verification once Brett provisions the user', d: addDays(TODAY, 5) }],
    9: [{ t: 'Close ghost tickets from the Jun 18 re-baseline', d: addDays(TODAY, -1) },
        { t: 'Reconcile overdue items against real remaining scope', d: addDays(TODAY, -4) }],
  };
  const rows = LISTS.map((L) => {
    const c = snap[L.num] || { open: 0, done: 0, overdue: 0 };
    const items = (sampleItems[L.num] || []).map((it) => ({
      title: it.t, due: it.d, url: listUrl(L.id), assignee: '',
    }));
    let overdue = 0, dueSoon = 0;
    items.forEach((it) => { if (it.due < TODAY) overdue++; else if (it.due <= addDays(TODAY, DUE_SOON_DAYS)) dueSoon++; });
    items.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    return { L, open: c.open, done: c.done, overdue: c.overdue || overdue, dueSoon, items, error: false };
  });
  return { rows, dataWarning: 'PREVIEW: ticket counts and dated items below are a labeled sample, not live Basecamp data. Deliverables, acceptance criteria, states and dependencies are real.' };
}

function statusFor(open, overdue, dueSoon) {
  if (overdue > 0) return { label: 'LATE', color: COL.red };
  if (dueSoon > 0) return { label: 'DUE SOON', color: COL.amber };
  if (open > 0) return { label: 'IN PROGRESS', color: COL.blue };
  return { label: 'CLEAR', color: COL.green };
}
function badge(s) {
  return `<span style="background:${s.color};color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:9px;">${s.label}</span>`;
}

function build(rows, dataWarning) {
  const countsByNum = {};
  rows.forEach((r) => { countsByNum[r.L.num] = { open: r.open, done: r.done, overdue: r.overdue }; });

  // overdue across the project (watch list)
  const overdueAll = [];
  rows.forEach((r) => r.items.forEach((it) => { if (it.due && it.due < TODAY) overdueAll.push({ L: r.L, it }); }));
  overdueAll.sort((a, b) => a.it.due.localeCompare(b.it.due));

  // upcoming next 14 days
  const horizon = addDays(TODAY, 14);
  const upcoming = [];
  rows.forEach((r) => r.items.forEach((it) => { if (it.due && it.due >= TODAY && it.due <= horizon) upcoming.push({ ...it, list: r.L }); }));
  upcoming.sort((a, b) => a.due.localeCompare(b.due));

  const countdownTxt = daysToThu === 0 ? 'Demo is today' : `${daysToThu} day${daysToThu === 1 ? '' : 's'} to the weekly demo`;

  // ---- birds-eye value chain (delivery state + dependency icons) ----
  const birdsEye = D.renderBirdsEye(listUrlForNum);

  // ---- demo agenda band ----
  const demoAgenda = D.renderDemoAgenda(pretty(NEXT_DEMO) + ' 10:00 CST');

  // ---- deliverable cards ----
  const cards = D.renderDeliverableCards(countsByNum, listUrlForNum);

  // ---- milestones + gates ----
  const milestoneRows = D.renderMilestones(pretty);

  // ---- artifacts still to create, across all streams ----
  const artifactBacklog = D.renderArtifactBacklog();

  // ---- per-list detail (work-package granular view) ----
  const listRows = rows.map((r, i) => {
    const s = r.error ? { label: 'NO DATA', color: COL.gray } : statusFor(r.open, r.overdue, r.dueSoon);
    const bg = i % 2 ? COL.bgAlt : '#ffffff';
    const top = r.items.slice(0, 3).map((it) => {
      const tag = it.due ? (it.due < TODAY ? `<span style="color:${COL.red};font-weight:700;">overdue ${pretty(it.due)}</span>` : `due ${pretty(it.due)}`) : 'no due date';
      return `<div style="margin-top:3px;"><a href="${esc(it.url)}" style="color:${COL.blue};text-decoration:none;">${esc(it.title)}</a> <span style="color:#a0aec0;">(${tag}${it.assignee ? ', ' + esc(it.assignee) : ''})</span></div>`;
    }).join('');
    const counts = r.error ? 'data unavailable' : `${r.open} open / ${r.done} done${r.overdue ? `, <b style="color:${COL.red};">${r.overdue} overdue</b>` : ''}`;
    return `<tr style="background:${bg};">
      <td style="padding:7px 8px;border:1px solid ${COL.border};font-weight:700;vertical-align:top;"><a href="${listUrl(r.L.id)}" style="color:${COL.blue};text-decoration:underline;">${r.L.num}. ${esc(r.L.name)}</a></td>
      <td style="padding:7px 8px;border:1px solid ${COL.border};vertical-align:top;">${esc(r.L.owner)}</td>
      <td style="padding:7px 8px;border:1px solid ${COL.border};vertical-align:top;"><div>${counts}</div>${top}</td>
      <td style="padding:7px 8px;border:1px solid ${COL.border};text-align:center;vertical-align:top;">${badge(s)}</td>
    </tr>`;
  }).join('');

  // ---- watch list ----
  let watch = overdueAll.slice(0, 8).map((o) =>
    `<tr><td style="padding:7px 10px;background:#fff5f5;border-left:4px solid ${COL.red};font-size:12px;">${esc(o.it.title)} <span style="color:#a0aec0;">(overdue ${pretty(o.it.due)}, ${esc(o.L.name)})</span> <a href="${esc(o.it.url)}" style="color:${COL.blue};">open &#8594;</a></td></tr><tr><td style="height:6px;"></td></tr>`
  ).join('');
  if (!overdueAll.length) watch = `<tr><td style="padding:7px 10px;background:#f0fbf4;border-left:4px solid ${COL.green};font-size:12px;">No overdue items across the active lists right now.</td></tr>`;

  // ---- upcoming ----
  let upcomingHtml;
  if (upcoming.length) {
    upcomingHtml = upcoming.slice(0, 12).map((u) => {
      const c = u.due <= addDays(TODAY, DUE_SOON_DAYS) ? COL.amber : COL.gray;
      return `<tr><td style="padding:5px 8px;border:1px solid ${COL.border};width:90px;font-weight:700;color:${c};">${pretty(u.due)}</td><td style="padding:5px 8px;border:1px solid ${COL.border};"><a href="${esc(u.url)}" style="color:${COL.navy};text-decoration:none;">${esc(u.title)}</a> <span style="color:#a0aec0;">(${esc(u.list.name)})</span></td></tr>`;
    }).join('');
  } else {
    upcomingHtml = `<tr><td style="padding:6px 8px;border:1px solid ${COL.border};color:#718096;" colspan="2">No dated items in the next 14 days. The next fixed checkpoint is the weekly demo on ${pretty(NEXT_DEMO)}.</td></tr>`;
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#2d3748;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:18px 0;"><tr><td align="center">
<table role="presentation" width="860" cellpadding="0" cellspacing="0" style="width:860px;max-width:860px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
  <tr><td style="background:${COL.navy};padding:24px 28px;">
    <div style="color:#9ec5e8;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">ShipCES Autonomous Brokerage &middot; Delivery Report</div>
    <div style="color:#fff;font-size:25px;font-weight:800;margin-top:6px;">${prettyLong(TODAY)}</div>
    <div style="color:#cbd9e8;font-size:14px;margin-top:6px;">${countdownTxt} (${pretty(NEXT_DEMO)} 10:00 CST). A deliverable-anchored status report: what each work stream delivers, how you know it is done, and what is next.</div>
    <div style="color:#9ec5e8;font-size:11px;margin-top:10px;">Every layer, deliverable and item links into Basecamp. <a href="${projUrl()}" style="color:#9ec5e8;">Open the project &#8594;</a></div>
    ${dataWarning ? `<div style="color:#ffd6a2;font-size:11px;margin-top:8px;">Note: ${esc(dataWarning)}</div>` : ''}
  </td></tr>

  <tr><td style="padding:18px 28px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="33%" valign="top" style="padding:6px;"><div style="border:1px solid ${COL.border};border-left:4px solid ${COL.green};border-radius:8px;padding:12px 14px;"><div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#718096;text-transform:uppercase;">&#9664; Last demo</div><div style="font-size:14px;font-weight:700;color:${COL.navy};margin-top:3px;">${pretty(LAST_DEMO)}</div><div style="font-size:12px;color:#4a5568;margin-top:4px;">Previous Thursday checkpoint on the weekly cadence.</div></div></td>
    <td width="33%" valign="top" style="padding:6px;"><div style="border:1px solid #cbd9e8;border-left:4px solid ${COL.blue};border-radius:8px;padding:12px 14px;background:#f5f9fd;"><div style="font-size:10px;font-weight:700;letter-spacing:1px;color:${COL.blue};text-transform:uppercase;">&#9679; Today</div><div style="font-size:14px;font-weight:700;color:${COL.navy};margin-top:3px;">${pretty(TODAY)}</div><div style="font-size:12px;color:#4a5568;margin-top:4px;">Forward track (RMS / W1) and backward track (BMS) both feeding the demo.</div></div></td>
    <td width="33%" valign="top" style="padding:6px;"><div style="border:1px solid ${COL.border};border-left:4px solid ${COL.amber};border-radius:8px;padding:12px 14px;"><div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#718096;text-transform:uppercase;">&#9654; Next demo</div><div style="font-size:14px;font-weight:700;color:${COL.navy};margin-top:3px;">${pretty(NEXT_DEMO)} 10:00 CST</div><div style="font-size:12px;color:#4a5568;margin-top:4px;">${daysToThu === 0 ? 'Today.' : countdownTxt + '.'} Forward: RMS / W1. Backward: BMS.</div></div></td>
  </tr></table></td></tr>

  <tr><td style="padding:14px 28px 4px;">
    <div style="font-size:16px;font-weight:800;color:${COL.navy};">Birds-eye: the whole build on one line</div>
    <div style="font-size:12px;color:#718096;margin:2px 0 12px;">Own the brain, rent the senses. An inbound email flows left to right to a paid invoice. Tap a bar to open its list.</div>
    ${birdsEye}
  </td></tr>

  <tr><td style="padding:18px 28px 4px;">${demoAgenda}</td></tr>

  <tr><td style="padding:18px 28px 4px;">
    <div style="font-size:16px;font-weight:800;color:${COL.navy};">Deliverables (what each work stream guarantees)</div>
    <div style="font-size:12px;color:#718096;margin:2px 0 12px;">One tangible deliverable per stream, the objective test for "accepted", the value it creates, and its dependencies. State: <b style="color:${COL.blue};">Verified</b> = tests + tsc green, pending your sign-off; <b style="color:${COL.green};">Accepted</b> = you approved it; <b style="color:${COL.amber};">In progress</b>; <b style="color:${COL.red};">Blocked</b>.</div>
    ${cards}
  </td></tr>

  <tr><td style="padding:18px 28px 4px;">
    <div style="font-size:16px;font-weight:800;color:${COL.navy};">Artifacts to create (the tangible deliverables to produce)</div>
    <div style="font-size:12px;color:#718096;margin:2px 0 10px;">Every item still marked to-create across the work streams. These are the things Brett will be able to open and point to once done.</div>
    ${artifactBacklog}
  </td></tr>

  <tr><td style="padding:8px 28px 4px;">
    <div style="font-size:16px;font-weight:800;color:${COL.navy};">Upcoming milestones + gates</div>
    <div style="font-size:12px;color:#718096;margin:2px 0 10px;">Significant checkpoints. Each gate carries the go/no-go criteria that clear it.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;">${milestoneRows}</table>
  </td></tr>

  <tr><td style="padding:16px 28px 4px;">
    <div style="font-size:16px;font-weight:800;color:${COL.navy};">Upcoming due dates (next 14 days)</div>
    <div style="font-size:12px;color:#718096;margin:2px 0 10px;">Live from dated Basecamp items. Amber = due within ${DUE_SOON_DAYS} days.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:11.5px;">${upcomingHtml}</table>
  </td></tr>

  <tr><td style="padding:18px 28px 4px;">
    <div style="font-size:16px;font-weight:800;color:${COL.navy};">Work packages by list (9 active + Phase C)</div>
    <div style="font-size:12px;color:#718096;margin:2px 0 10px;">The granular view under each deliverable: live open / done counts and the soonest-due open items.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:11.5px;">
      <tr>
        <td style="background:${COL.navy};color:#fff;font-weight:700;padding:7px 8px;border:1px solid #fff;">List</td>
        <td style="background:${COL.navy};color:#fff;font-weight:700;padding:7px 8px;border:1px solid #fff;">Owner</td>
        <td style="background:${COL.navy};color:#fff;font-weight:700;padding:7px 8px;border:1px solid #fff;">Open work (soonest due first)</td>
        <td style="background:${COL.navy};color:#fff;font-weight:700;padding:7px 8px;border:1px solid #fff;text-align:center;">Status</td>
      </tr>
      ${listRows}
    </table>
  </td></tr>

  <tr><td style="padding:18px 28px 4px;">
    <div style="font-size:16px;font-weight:800;color:${COL.navy};">Watch list (overdue across the project)</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">${watch}</table>
  </td></tr>

  <tr><td style="padding:18px 28px 26px;"><div style="border-top:1px solid ${COL.border};padding-top:12px;font-size:11px;color:#718096;line-height:1.6;">
    <strong style="color:${COL.navy};">Cadence:</strong> weekly demo every Thursday 10:00 CST. This snapshot is generated automatically each weekday at 7:55 CT.<br>
    <strong style="color:${COL.navy};">Method:</strong> ${esc(D.PROVENANCE)}<br>
    <strong style="color:${COL.navy};">Data source:</strong> live Basecamp project <a href="${projUrl()}" style="color:${COL.blue};">47126345 (ShipCES - Autonomous Brokerage)</a>, pulled at send time.<br>
    <strong style="color:${COL.navy};">Generated:</strong> ${prettyLong(TODAY)}.
  </div></td></tr>
</table></td></tr></table></body></html>`;

  // ---- plain-text fallback ----
  const lines = D.DELIVERABLES.filter((d) => d.key !== 'PHASEC').map((d) => {
    const m = D.stateMeta(d.state);
    return `[${m.label}] ${d.name} (${d.owner})\n    Deliverable: ${d.deliverable}\n    Accepted when: ${d.acceptance}`;
  }).join('\n');
  const text = `ShipCES Autonomous Brokerage - Delivery Report
${prettyLong(TODAY)} (${countdownTxt}, ${pretty(NEXT_DEMO)} 10:00 CST)

DELIVERABLES
${lines}

Overdue across project: ${overdueAll.length}
Full visual report (birds-eye with dependency icons, demo agenda, deliverable cards, milestones, per-list work packages) is in the HTML version.
Live from Basecamp project 47126345, pulled at send time.`;

  return { html, text, overdue: overdueAll.length };
}

async function main() {
  if (PREVIEW) {
    const { rows, dataWarning } = previewRows();
    const { html } = build(rows, dataWarning);
    const outDir = process.env.PREVIEW_DIR || path.join(require('os').homedir(), 'Downloads');
    const out = path.join(outDir, 'ShipCES-Delivery-Report-preview.html');
    fs.writeFileSync(out, html, 'utf8');
    console.log('PREVIEW written:', out, '(' + html.length + ' bytes, no send)');
    process.exit(0);
  }

  TOKEN = await resolveToken();
  if (!TOKEN) throw new Error('No Basecamp token available (CCPP and env both empty)');
  const { rows, dataWarning } = await gatherRows();
  const { html, text } = build(rows, dataWarning);

  const { createTransport } = require('nodemailer');
  const transport = createTransport({
    host: process.env.SMTP_HOST || 'smtp.mandrillapp.com',
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.MANDRILL_USERNAME || process.env.SMTP_USER, pass: process.env.MANDRILL_API_KEY || process.env.SMTP_PASS },
  });
  const subject = (TEST ? '[TEST] ' : '') + `ShipCES Delivery Report: ${pretty(TODAY)}`;
  const msg = {
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    subject, text, html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  };
  if (!TEST) msg.cc = 'karun@colaberry.com, ram@colaberry.com, saitejesh@colaberry.com';
  const r = await transport.sendMail(msg);
  console.log('Sent:', r.messageId, '| mode:', TEST ? 'TEST (ali only)' : 'LIVE (cc group)');
  process.exit(0);
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
