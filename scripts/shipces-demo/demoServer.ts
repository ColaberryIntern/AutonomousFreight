/*
 * ShipCES Autonomous Brokerage - local demo tester (dev only).
 *
 * Stands up a tiny HTTP server on 127.0.0.1 that runs the REAL forward-track
 * chain (RMS ingest -> OMS lifecycle -> tender -> TMS sourcing/milestones ->
 * BMS invoice) against whatever email and billing knobs you POST. Lets you test
 * the actual logic with your own inputs, not a fixed script.
 *
 *   npx ts-node --transpile-only scripts/shipces-demo/demoServer.ts
 *   then open http://localhost:4319
 *
 * No new dependencies (Node http only). Local loopback bind only, no external
 * exposure. No em-dashes or en-dashes in output.
 */
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { ingestEmail } from '../../services/rms/src/ingest/pipeline';
import { parseEmailToRfqFromFields } from '../../services/rms/src/parser/emailParser';
import { LlmExtractorEngine } from '../../services/rms/src/extract/extractorEngine';
import { GmailApiEmailEngine } from '../../services/adapters/src/email/gmailApiEmailEngine';
import { MsGraphEmailEngine } from '../../services/adapters/src/email/msGraphEmailEngine';
import type { EmailEngine } from '../../services/adapters/src/email/emailAdapter';
import { OpenAiClient } from './openAiClient';
import { InMemoryIdempotencyStore, InMemoryDeadLetterStore } from '../../services/rms/src/ingest/stores';
import { handoffRmsToOms, InMemoryShipmentStore } from '../../services/oms/src/handoff';
import { applyOmsEvent } from '../../services/oms/src/stateMachine';
import { tenderShipment } from '../../services/oms/src/tender';
import type { Shipment } from '../../services/oms/src/schema/shipment.v1';
import { acceptTender, applyTmsEvent } from '../../services/tms/src/stateMachine';
import { recordMilestone } from '../../services/tms/src/milestones';
import { sourceCarriers } from '../../services/tms/src/sourcing';
import { handoffToBms } from '../../services/tms/src/handoffBms';
import { generateInvoice } from '../../services/bms/src/invoice';
import { MockDatEngine } from '../../services/adapters/src/dat/mockDatEngine';
import { MockFmcsaEngine } from '../../services/adapters/src/fmcsa/mockFmcsaEngine';
import type { InboundEmail } from '../../services/adapters/src/email/emailAdapter';

const PORT = Number(process.env.PORT) || 4319;
const AT = '2026-05-25T09:00:00Z';

// Load the gitignored repo-root .env (OPENAI_API_KEY) without a dotenv dep.
(() => {
  try {
    const envPath = path.resolve(__dirname, '..', '..', '.env');
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && m[1] && m[2] !== undefined && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* no .env; the LLM engine will report the missing key */ }
})();

// Real inbox engines (read-only) behind the Sense Layer contract; null if creds absent.
const gmailEngine = process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN
  ? new GmailApiEmailEngine(
      { clientId: process.env.GMAIL_CLIENT_ID, clientSecret: process.env.GMAIL_CLIENT_SECRET, refreshToken: process.env.GMAIL_REFRESH_TOKEN },
      { maxResults: 12, maxBodyChars: 8000 },
    )
  : null;

// Microsoft Graph = the production ShipCES intake mailbox. Reads Karun's Azure
// secret names (CES_AZURE_*) so dropping those values into .env lights it up.
const graphTenant = process.env.MSGRAPH_TENANT_ID || process.env.CES_AZURE_TENANT_ID;
const graphClient = process.env.MSGRAPH_CLIENT_ID || process.env.CES_AZURE_CLIENT_ID;
const graphSecret = process.env.MSGRAPH_CLIENT_SECRET || process.env.CES_AZURE_CLIENT_SECRET;
const graphMailbox = process.env.MSGRAPH_MAILBOX || process.env.OUTLOOK_ARCHIVE_MAILBOX || 'QuotesTeam@shipces.com';
const graphEngine = graphTenant && graphClient && graphSecret
  ? new MsGraphEmailEngine({ tenantId: graphTenant, clientId: graphClient, clientSecret: graphSecret, mailbox: graphMailbox }, { maxResults: 12, maxBodyChars: 8000 })
  : null;

const inboxSources: Record<string, { engine: EmailEngine; label: string } | undefined> = {
  ...(gmailEngine ? { gmail: { engine: gmailEngine, label: 'My Gmail (ali@colaberry.com)' } } : {}),
  ...(graphEngine ? { graph: { engine: graphEngine, label: `ShipCES intake (${graphMailbox})` } } : {}),
};
const inboxSourceList = Object.entries(inboxSources).map(([id, s]) => ({ id, label: s!.label }));
const defaultSource = graphEngine ? 'graph' : gmailEngine ? 'gmail' : '';
const val = <T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): T => {
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.value;
};

interface RunInput {
  from: string; subject: string; body: string;
  sellRateUsd: number; fuelPct: number; detentionUsd: number; omitLinehaul: boolean;
  engine: 'baseline' | 'llm';
}

async function runChain(input: RunInput): Promise<Record<string, unknown>> {
  const trace: Record<string, unknown> = {};
  const email: InboundEmail = {
    messageId: 'dev-tester-fixed',
    from: input.from,
    to: ['quotes@shipces.com'],
    subject: input.subject,
    body: input.body,
    receivedAt: '2026-05-21T12:00:00Z',
  };

  // Phase 0: choose the extraction front-end (baseline regex vs Karun prompt + LLM).
  let parse: ((e: InboundEmail) => ReturnType<typeof parseEmailToRfqFromFields>) | undefined;
  if (input.engine === 'llm') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      trace.extraction = { engine: 'karun-prompt-llm', ok: false, errors: ['OPENAI_API_KEY not set. Put it in the repo-root .env and restart the server.'] };
      trace.stoppedAt = 'extraction';
      return trace;
    }
    const eng = new LlmExtractorEngine(new OpenAiClient(key));
    const ex = await eng.extract(email);
    if (ex.ok) {
      trace.extraction = { engine: 'karun-prompt-llm', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', ok: true, fields: ex.fields };
      parse = (e) => parseEmailToRfqFromFields(e, ex.fields);
    } else {
      trace.extraction = { engine: 'karun-prompt-llm', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', ok: false, errors: ex.errors };
      parse = () => ({ ok: false as const, errors: ex.errors });
    }
  } else {
    trace.extraction = { engine: 'deterministic-regex-baseline', ok: true };
  }

  // Phase 1: RMS ingest (+ idempotency re-run)
  const idem = new InMemoryIdempotencyStore();
  const dead = new InMemoryDeadLetterStore();
  const deps = { idempotency: idem, deadLetter: dead, ...(parse ? { parse } : {}) };
  const ing = await ingestEmail(email, deps);
  const again = await ingestEmail(email, deps);
  trace.ingest = {
    status: ing.status,
    duplicateStatus: again.status,
    idempotent: again.status === 'duplicate',
    emailHash: ing.emailHash,
    rfqId: (ing as { rfqId?: string }).rfqId,
    needsHumanReview: (ing as { needsHumanReview?: boolean }).needsHumanReview,
    reason: (ing as { reason?: string }).reason,
    errors: (ing as { errors?: string[] }).errors,
  };
  if (ing.status !== 'accepted') { trace.stoppedAt = 'ingest'; return trace; }
  const rfq = ing.rfq;
  trace.rfq = {
    rfqId: rfq.rfqId,
    lane: `${rfq.shipment.stops[0]?.location.city}, ${rfq.shipment.stops[0]?.location.state} to ${rfq.shipment.stops[rfq.shipment.stops.length - 1]?.location.city}, ${rfq.shipment.stops[rfq.shipment.stops.length - 1]?.location.state}`,
    equipment: rfq.shipment.equipmentOptions[0]?.equipmentType,
    weightLb: rfq.shipment.commodities[0]?.weightLb,
    commodity: rfq.shipment.commodities[0]?.description,
    serviceTypes: rfq.serviceTypes ?? [],
    confidence: rfq.rawExtraction?.overallConfidence,
    status: rfq.status,
    channel: rfq.source.channel,
  };

  try {
    // Phase 2: OMS stage -> price -> win -> tender
    const store = new InMemoryShipmentStore();
    const handoff = await handoffRmsToOms(rfq, ing.emailHash, store);
    let s: Shipment = (handoff as { shipment: Shipment }).shipment;
    s = val(applyOmsEvent(s, 'parse', AT));
    s = val(applyOmsEvent(s, 'price', AT));
    if (!input.omitLinehaul) s = { ...s, economics: { sellRateUsd: input.sellRateUsd } };
    s = val(applyOmsEvent(s, 'send_quote', AT));
    s = val(applyOmsEvent(s, 'win', AT));
    const tenderRes = tenderShipment(s, AT);
    if (!tenderRes.ok) throw new Error('tender failed: ' + tenderRes.errors.join('; '));
    s = tenderRes.shipment;
    trace.oms = {
      state: s.state,
      tender: {
        ediAlignment: tenderRes.tender.ediAlignment,
        loadReference: tenderRes.tender.loadReference,
        equipmentCode: tenderRes.tender.equipmentCode,
        weightLb: tenderRes.tender.weightLb,
      },
      sellRateUsd: input.omitLinehaul ? null : input.sellRateUsd,
    };

    // Phase 3: TMS sourcing + vetting + milestones to Delivered
    s = val(acceptTender(s, AT));
    const sourced = await sourceCarriers(s, { dat: new MockDatEngine(), fmcsa: new MockFmcsaEngine() });
    s = val(applyTmsEvent(s, 'assign_carrier', AT));
    for (const code of ['X3', 'AF', 'D1'] as const) {
      const m = recordMilestone(s, code, AT);
      if (!m.ok) throw new Error('milestone ' + code + ' failed: ' + m.errors.join('; '));
      s = m.shipment;
    }
    trace.tms = {
      laneRatePerMile: sourced.laneRatePerMile,
      candidates: sourced.candidates.length,
      bookableCount: sourced.bookableCount,
      carriers: sourced.candidates.map((c) => ({ name: c.carrierName, mc: c.mcNumber ?? null, bookable: c.bookable, reason: c.reason })),
      state: s.state,
    };

    // Phase 4: BMS invoice (or fail-closed)
    const accessorials = input.detentionUsd > 0 ? [{ code: 'DET', description: 'Detention (2 hr)', amountUsd: input.detentionUsd }] : [];
    const bms = handoffToBms(s, AT, 'POD-DEV-TEST', accessorials);
    if (!bms.ok) throw new Error('bms handoff failed: ' + bms.errors.join('; '));
    try {
      const invoice = generateInvoice(bms.billReady, { invoiceSeq: 1, issueDate: '2026-05-28', fuelSurchargePct: input.fuelPct / 100 });
      trace.bms = {
        ok: true,
        invoiceNumber: invoice.invoiceNumber,
        ediAlignment: invoice.ediAlignment,
        lineItems: invoice.lineItems,
        totalUsd: invoice.totalUsd,
        billReadyRef: bms.billReady.billReadyRef,
      };
    } catch (e) {
      trace.bms = { ok: false, failClosed: (e as Error).message };
    }
  } catch (e) {
    trace.error = (e as Error).message;
  }
  return trace;
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ShipCES demo tester</title>
<style>
  :root{--navy:#1a365d;--blue:#2b6cb0;--green:#38a169;--amber:#dd6b20;--red:#e53e3e;--slate:#4a5568;--gray:#718096;--border:#e2e8f0;--bgalt:#f7fafc;}
  *{box-sizing:border-box;} body{margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#2d3748;}
  header{background:var(--navy);color:#fff;padding:18px 24px;} header h1{margin:0;font-size:19px;font-weight:800;} header .s{color:#cbd9e8;font-size:12px;margin-top:4px;}
  .grid{display:grid;grid-template-columns:340px 1fr;gap:18px;padding:18px 24px;align-items:start;}
  .panel{background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px;}
  label{display:block;font-size:11px;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 4px;}
  input[type=text],input[type=number],textarea,select{width:100%;border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;background:#fff;}
  textarea{min-height:90px;resize:vertical;} .row{display:flex;gap:10px;} .row>div{flex:1;}
  .chk{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;color:var(--slate);}
  button{margin-top:16px;width:100%;background:var(--blue);color:#fff;border:none;border-radius:8px;padding:11px;font-size:14px;font-weight:800;cursor:pointer;}
  button:hover{background:#2c5282;} button:disabled{background:#a0aec0;cursor:default;}
  .card{border:1px solid var(--border);border-left:5px solid var(--blue);border-radius:8px;padding:12px 14px;margin-bottom:12px;background:#fff;}
  .card.green{border-left-color:var(--green);} .card.amber{border-left-color:var(--amber);} .card.red{border-left-color:var(--red);} .card.navy{border-left-color:var(--navy);}
  .card h3{margin:0 0 8px;font-size:13px;font-weight:800;color:var(--navy);text-transform:uppercase;letter-spacing:.5px;}
  .kv{display:grid;grid-template-columns:130px 1fr;gap:4px 12px;font-size:13px;} .kv .k{color:var(--gray);font-weight:600;} .kv .v{color:var(--navy);font-weight:600;}
  .chip{display:inline-block;background:#ebf3fb;color:var(--blue);border:1px solid #cfe0f2;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;margin:2px 4px 2px 0;}
  table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px;} th,td{border:1px solid var(--border);padding:6px 9px;text-align:left;} th{background:var(--navy);color:#fff;font-size:11px;}
  .num{text-align:right;font-variant-numeric:tabular-nums;} .total td{font-weight:800;color:var(--navy);border-top:2px solid var(--navy);}
  .pill{display:inline-block;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:9px;}
  .mono{font-family:Consolas,Menlo,monospace;font-size:12px;} .muted{color:var(--gray);font-size:12px;}
  details{margin-top:8px;} summary{cursor:pointer;font-size:12px;color:var(--blue);font-weight:700;}
  .inboxbtn{margin-top:0;background:#fff;color:var(--blue);border:1px solid var(--blue);}
  .inboxbtn:hover{background:#ebf3fb;}
  .msg{border:1px solid var(--border);border-radius:6px;padding:7px 9px;margin-top:6px;cursor:pointer;font-size:12px;background:#fff;}
  .msg:hover{background:var(--bgalt);border-color:#cfe0f2;}
  .msg b{color:var(--navy);}
  pre{background:#0f1b2d;color:#cbd9e8;border-radius:8px;padding:12px;overflow:auto;font-size:11.5px;max-height:340px;}
</style></head>
<body>
<header><h1>ShipCES demo tester</h1><div class="s">Runs the real RMS to OMS to TMS to BMS chain against your inputs. Loopback only. Edit and Run.</div></header>
<div class="grid">
  <div class="panel">
    <label>Real inbox (read-only)</label>
    <select id="inboxSource">__INBOX_SOURCES__</select>
    <button class="inboxbtn" type="button" onclick="loadInbox()" style="margin-top:8px;">Load latest emails</button>
    <div id="inbox"></div>
    <div style="height:12px;"></div>
    <label>Extraction engine</label>
    <select id="engine">
      <option value="baseline">Baseline (deterministic regex)</option>
      <option value="llm">Karun prompt + LLM (for real, messy emails)</option>
    </select>
    <label>From</label><input type="text" id="from" value="John Dispatcher &lt;dispatch@abcmfg.com&gt;">
    <label>Subject</label><input type="text" id="subject" value="URGENT expedite - need a sprinter ASAP">
    <label>Body</label><textarea id="body">Hi team, please quote from El Paso, TX to Detroit, MI. About 3,200 lbs, sprinter, we need it ASAP - line down. Thanks.</textarea>
    <div class="row">
      <div><label>Sell rate USD</label><input type="number" id="sellRateUsd" value="2400"></div>
      <div><label>Fuel %</label><input type="number" id="fuelPct" value="18"></div>
    </div>
    <div class="row">
      <div><label>Detention USD</label><input type="number" id="detentionUsd" value="150"></div>
      <div></div>
    </div>
    <div class="chk"><input type="checkbox" id="omitLinehaul"><label style="margin:0;text-transform:none;letter-spacing:0;font-weight:600;">Omit linehaul (test fail-closed)</label></div>
    <button id="run" onclick="run()">Run chain</button>
    <div class="muted" style="margin-top:10px;">Try: change the lane, drop the weight below 12,000 for ELTL, remove "sprinter" or "ASAP", or make the body vague to route to human review. Switch the engine to Karun prompt + LLM and paste a REAL email from your inbox (forwarded thread, signature, typos, Spanish) to test his extraction path.</div>
  </div>
  <div id="out" class="panel"><div class="muted">Results appear here. Click Run chain.</div></div>
</div>
<script>
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function money(n){return '$'+Number(n).toLocaleString('en-US');}
async function run(){
  var btn=document.getElementById('run'); btn.disabled=true; btn.textContent='Running...';
  var payload={engine:v('engine'),from:v('from'),subject:v('subject'),body:v('body'),sellRateUsd:num('sellRateUsd'),fuelPct:num('fuelPct'),detentionUsd:num('detentionUsd'),omitLinehaul:document.getElementById('omitLinehaul').checked};
  try{
    var r=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    var t=await r.json(); render(t);
  }catch(e){document.getElementById('out').innerHTML='<div class="card red"><h3>Request failed</h3>'+esc(e.message)+'</div>';}
  btn.disabled=false; btn.textContent='Run chain';
}
function v(id){return document.getElementById(id).value;}
function num(id){return Number(document.getElementById(id).value);}
async function loadInbox(){
  var el=document.getElementById('inbox'); var src=document.getElementById('inboxSource').value;
  el.innerHTML='<div class="muted" style="margin-top:6px;">Loading inbox...</div>';
  try{
    var r=await fetch('/api/inbox?source='+encodeURIComponent(src)); var d=await r.json();
    if(!d.ok){el.innerHTML='<div class="mono" style="color:var(--red);margin-top:6px;">'+esc(d.error)+'</div>';return;}
    window._inbox=d.emails;
    el.innerHTML='<div class="muted" style="margin:6px 0;">'+esc(d.label)+' &middot; '+d.count+' messages</div>'+d.emails.map(function(e,i){
      return '<div class="msg" onclick="pick('+i+')"><b>'+esc(e.subject||'(no subject)')+'</b><br><span class="muted">'+esc(e.from)+' &middot; '+esc((e.receivedAt||'').slice(0,10))+(e.hasAttachments?' &middot; has attachments':'')+'</span></div>';
    }).join('');
  }catch(e){el.innerHTML='<div class="mono" style="color:var(--red);margin-top:6px;">'+esc(e.message)+'</div>';}
}
function pick(i){
  var e=window._inbox[i];
  document.getElementById('from').value=e.from;
  document.getElementById('subject').value=e.subject;
  document.getElementById('body').value=e.body;
  document.getElementById('engine').value='llm';
  document.getElementById('out').innerHTML='<div class="muted">Loaded "'+esc(e.subject||'(no subject)')+'" into the form. Click Run chain.</div>';
}
function render(t){
  var h='';
  if(t.extraction){var x=t.extraction;
    h+='<div class="card '+(x.ok?'navy':'red')+'"><h3>0. Extraction ('+esc(x.engine)+(x.model?', '+esc(x.model):'')+')</h3>'
      +(x.fields?'<div class="mono" style="font-size:11.5px;white-space:pre-wrap;">'+esc(JSON.stringify(x.fields,null,2))+'</div>':'')
      +(x.errors?'<div class="mono" style="color:var(--red)">'+esc(x.errors.join('; '))+'</div>':'')
      +(x.ok&&!x.fields?'<div class="muted">Regex extractors run inline inside the parser.</div>':'')
      +'</div>';
  }
  var ing=t.ingest||{};
  var ingColor=ing.status==='accepted'?'green':(ing.status==='dead_letter'?'red':'amber');
  h+='<div class="card '+ingColor+'"><h3>1. RMS ingest</h3><div class="kv">'
    +'<div class="k">Status</div><div class="v"><span class="pill" style="background:var(--'+(ing.status==='accepted'?'green':ing.status==='dead_letter'?'red':'amber')+')">'+esc(ing.status)+'</span></div>'
    +'<div class="k">Idempotent</div><div class="v">re-ingest returned '+esc(ing.duplicateStatus)+' ('+(ing.idempotent?'same load, no duplicate':'NOT deduped')+')</div>'
    +(ing.rfqId?'<div class="k">rfqId</div><div class="v mono">'+esc(ing.rfqId)+'</div>':'')
    +(ing.needsHumanReview!=null?'<div class="k">Human review</div><div class="v">'+(ing.needsHumanReview?'required':'not needed')+'</div>':'')
    +(ing.reason?'<div class="k">Reason</div><div class="v">'+esc(ing.reason)+'</div>':'')
    +(ing.errors?'<div class="k">Errors</div><div class="v">'+esc((ing.errors||[]).join('; '))+'</div>':'')
    +'</div></div>';
  if(t.rfq){var q=t.rfq;
    h+='<div class="card navy"><h3>2. Canonical RFQ</h3><div class="kv">'
      +'<div class="k">Lane</div><div class="v">'+esc(q.lane)+'</div>'
      +'<div class="k">Equipment</div><div class="v">'+esc(q.equipment)+'</div>'
      +'<div class="k">Weight</div><div class="v">'+esc(Number(q.weightLb).toLocaleString('en-US'))+' lb ('+esc(q.commodity)+')</div>'
      +'<div class="k">Confidence</div><div class="v">'+esc(q.confidence)+' to status '+esc(q.status)+'</div>'
      +'</div><div style="margin-top:8px;">'+(q.serviceTypes||[]).map(function(x){return '<span class="chip">'+esc(x)+'</span>';}).join('')+'</div></div>';
  }
  if(t.oms){var o=t.oms;
    h+='<div class="card blue"><h3>3. OMS tender (EDI 910)</h3><div class="kv">'
      +'<div class="k">State</div><div class="v">'+esc(o.state)+'</div>'
      +'<div class="k">Load</div><div class="v mono">'+esc(o.tender.loadReference)+', '+esc(o.tender.equipmentCode)+', '+esc(Number(o.tender.weightLb).toLocaleString('en-US'))+' lb</div>'
      +'<div class="k">Sell rate</div><div class="v">'+(o.sellRateUsd==null?'omitted':money(o.sellRateUsd))+'</div>'
      +'</div></div>';
  }
  if(t.tms){var m=t.tms;
    h+='<div class="card amber"><h3>4. TMS sourcing + tracking</h3><div class="kv">'
      +'<div class="k">Lane rate</div><div class="v">$'+esc(m.laneRatePerMile)+'/mi</div>'
      +'<div class="k">Capacity</div><div class="v">'+esc(m.candidates)+' trucks, '+esc(m.bookableCount)+' bookable after FMCSA</div>'
      +'<div class="k">State</div><div class="v">'+esc(m.state)+'</div>'
      +'</div></div>';
  }
  if(t.bms){var b=t.bms;
    if(b.ok){
      h+='<div class="card green"><h3>5. BMS invoice (EDI 210)</h3><div class="muted mono">'+esc(b.invoiceNumber)+'</div>'
        +'<table><tr><th>Code</th><th>Description</th><th class="num">Amount</th></tr>'
        +b.lineItems.map(function(li){return '<tr><td class="mono">'+esc(li.code)+'</td><td>'+esc(li.description)+'</td><td class="num">'+money(li.amountUsd)+'</td></tr>';}).join('')
        +'<tr class="total"><td></td><td>TOTAL</td><td class="num">'+money(b.totalUsd)+'</td></tr></table></div>';
    }else{
      h+='<div class="card red"><h3>5. BMS fail-closed</h3><div class="mono" style="color:var(--red)">Error: '+esc(b.failClosed)+'</div></div>';
    }
  }
  if(t.error){h+='<div class="card red"><h3>Chain error</h3><div class="mono">'+esc(t.error)+(t.stoppedAt?' (stopped at '+esc(t.stoppedAt)+')':'')+'</div></div>';}
  h+='<details><summary>Raw JSON trace</summary><pre>'+esc(JSON.stringify(t,null,2))+'</pre></details>';
  document.getElementById('out').innerHTML=h;
}
</script>
</body></html>`;

function inboxOptionsHtml(): string {
  const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const opts = inboxSourceList.map((s) => `<option value="${s.id}"${s.id === defaultSource ? ' selected' : ''}>${escAttr(s.label)}</option>`);
  if (!graphEngine) opts.push('<option value="graph" disabled>ShipCES intake (QuotesTeam) - pending Karun GCP access</option>');
  if (!opts.length) opts.push('<option value="" disabled>No inbox configured</option>');
  return opts.join('');
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE.replace('__INBOX_SOURCES__', inboxOptionsHtml()));
    return;
  }
  if (req.method === 'GET' && req.url && req.url.startsWith('/api/inbox')) {
    (async () => {
      const q = new URL(req.url!, 'http://localhost').searchParams;
      const sourceId = q.get('source') || defaultSource;
      const source = inboxSources[sourceId];
      if (!source) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: sourceId === 'graph'
          ? 'ShipCES Graph mailbox not configured: set CES_AZURE_TENANT_ID / CES_AZURE_CLIENT_ID / CES_AZURE_CLIENT_SECRET in the repo-root .env (pending Karun GCP access).'
          : 'No inbox source configured. Set the Gmail or Graph credentials in the repo-root .env.' }));
        return;
      }
      const r = await source.engine.fetchInbound('demo-inbox');
      if (!r.ok) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: `${r.error.category}: ${r.error.message}${r.error.detail ? ' (' + r.error.detail + ')' : ''}` }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, source: sourceId, label: source.label, engine: source.engine.engine, count: r.value.length, emails: r.value }));
    })().catch((e) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/run') {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      try {
        const p = JSON.parse(raw || '{}');
        const input: RunInput = {
          from: String(p.from ?? ''), subject: String(p.subject ?? ''), body: String(p.body ?? ''),
          sellRateUsd: Number.isFinite(p.sellRateUsd) ? p.sellRateUsd : 2400,
          fuelPct: Number.isFinite(p.fuelPct) ? p.fuelPct : 18,
          detentionUsd: Number.isFinite(p.detentionUsd) ? p.detentionUsd : 150,
          omitLinehaul: !!p.omitLinehaul,
          engine: p.engine === 'llm' ? 'llm' : 'baseline',
        };
        const trace = await runChain(input);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(trace));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('ShipCES demo tester listening at http://localhost:' + PORT);
});
