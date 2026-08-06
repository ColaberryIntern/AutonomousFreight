/*
 * ShipCES Autonomous Brokerage - Jul 16 demo artifact builder.
 *
 * Runs the SAME real forward-track code path as forwardTrackDemo.ts (RMS ingest
 * -> OMS lifecycle -> tender -> TMS sourcing/milestones -> Delivered -> BMS
 * invoice) and renders four self-contained HTML artifacts from the real data:
 *
 *   1. ShipCES-Invoice-AF-INV-0001.html   the flagship invoice (backward track)
 *   2. ShipCES-BMS-Demo.html              the on-screen BMS walk + fail-closed
 *   3. ShipCES-RFQ-Card.html              the canonical RFQ (forward track)
 *   4. ShipCES-Forward-Storyboard.html    the email-to-RFQ filmstrip to record
 *
 * Every value comes from the real services/* modules, not mock literals, so the
 * artifacts cannot drift from the code. Deterministic (fixed timestamps, no
 * clock/random), so it renders identically every run and is live-safe.
 *
 * Each file is written to docs/demo-artifacts/ (tracked) and to ~/Downloads.
 *
 *   npx ts-node --transpile-only scripts/shipces-demo/buildDemoArtifacts.ts
 *
 * No em-dashes or en-dashes anywhere in output (outgoing-comms rule).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ingestEmail } from '../../services/rms/src/ingest/pipeline';
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

// Reuse the daily-scrum palette + escaper; fall back to inline copies if the
// require path ever moves, so an unattended run never dies on a lookup.
/* eslint-disable @typescript-eslint/no-var-requires */
let COL: Record<string, string>;
let esc: (s: unknown) => string;
try {
  const D = require('../shipces-daily-scrum/deliverables');
  COL = D.COL;
  esc = D.esc;
} catch {
  COL = undefined as unknown as Record<string, string>;
  esc = undefined as unknown as (s: unknown) => string;
}
if (!COL) {
  COL = {
    green: '#38a169', blue: '#2b6cb0', amber: '#dd6b20', red: '#e53e3e',
    gray: '#718096', navy: '#1a365d', slate: '#4a5568', bgAlt: '#f7fafc', border: '#e2e8f0',
  };
}
if (!esc) {
  esc = (s: unknown) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const AT = '2026-05-25T09:00:00Z';
const ISSUE = '2026-05-28';
const val = <T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): T => {
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.value;
};
const money = (n: number) => '$' + n.toLocaleString('en-US');

// ---- shared page shell (standalone, self-contained, print-friendly) ----
function page(title: string, subtitle: string, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
  :root{--navy:${COL.navy};--blue:${COL.blue};--green:${COL.green};--amber:${COL.amber};--red:${COL.red};--slate:${COL.slate};--gray:${COL.gray};--border:${COL.border};--bgalt:${COL.bgAlt};}
  *{box-sizing:border-box;}
  body{margin:0;padding:24px 0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#2d3748;line-height:1.5;}
  .wrap{max-width:860px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08);}
  header{background:var(--navy);color:#fff;padding:24px 28px;}
  header .eyebrow{color:#9ec5e8;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;}
  header h1{margin:6px 0 0;font-size:24px;font-weight:800;}
  header .sub{color:#cbd9e8;font-size:13px;margin-top:6px;}
  .pad{padding:22px 28px;}
  .card{border:1px solid var(--border);border-radius:10px;background:#fff;padding:16px 18px;margin-bottom:16px;}
  .card.blue{border-left:5px solid var(--blue);} .card.green{border-left:5px solid var(--green);}
  .card.amber{border-left:5px solid var(--amber);} .card.red{border-left:5px solid var(--red);} .card.navy{border-left:5px solid var(--navy);}
  h2{font-size:16px;font-weight:800;color:var(--navy);margin:0 0 4px;}
  h3{font-size:13px;font-weight:800;color:var(--navy);margin:0 0 8px;text-transform:uppercase;letter-spacing:.5px;}
  .muted{color:var(--gray);font-size:12px;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th,td{border:1px solid var(--border);padding:8px 10px;text-align:left;vertical-align:top;}
  th{background:var(--navy);color:#fff;font-weight:700;font-size:12px;}
  tr:nth-child(even) td{background:var(--bgalt);}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
  .kv{display:grid;grid-template-columns:150px 1fr;gap:6px 14px;font-size:13px;}
  .kv .k{color:var(--gray);font-weight:600;}
  .kv .v{color:var(--navy);font-weight:600;}
  .chip{display:inline-block;background:#ebf3fb;color:var(--blue);border:1px solid #cfe0f2;border-radius:20px;padding:3px 11px;font-size:11.5px;font-weight:700;margin:2px 4px 2px 0;}
  .chip.lead{background:var(--blue);color:#fff;border-color:var(--blue);}
  .pill{display:inline-block;color:#fff;font-size:11px;font-weight:700;padding:2px 9px;border-radius:9px;}
  .total td{font-weight:800;color:var(--navy);font-size:15px;background:#fff;border-top:2px solid var(--navy);}
  .frames{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .frame{border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;}
  .frame .fh{background:var(--navy);color:#fff;font-size:12px;font-weight:700;padding:7px 12px;}
  .frame .fb{padding:12px 14px;font-size:12.5px;}
  .mono{font-family:Consolas,Menlo,monospace;font-size:12px;color:var(--slate);}
  .foot{border-top:1px solid var(--border);padding:14px 28px 22px;font-size:11px;color:var(--gray);}
  @media print{body{background:#fff;padding:0;}.wrap{box-shadow:none;border-radius:0;max-width:none;}.noprint{display:none;}}
  @media(max-width:640px){.frames{grid-template-columns:1fr;}.kv{grid-template-columns:1fr;}}
</style></head>
<body><div class="wrap">
<header><div class="eyebrow">ShipCES Autonomous Brokerage</div><h1>${esc(title)}</h1><div class="sub">${esc(subtitle)}</div></header>
${bodyHtml}
<div class="foot">Generated from the real services/* build by <span class="mono">scripts/shipces-demo/buildDemoArtifacts.ts</span> (deterministic, no clock or random). Every value is produced by the same code path as the forward-track demo and pinned by the unit + chain tests. No em-dashes or en-dashes.</div>
</div></body></html>`;
}

function writeArtifact(basename: string, html: string, repoDir: string, dlDir: string, log: string[]) {
  const targets = [path.join(repoDir, basename), path.join(dlDir, basename)];
  for (const t of targets) {
    try {
      fs.mkdirSync(path.dirname(t), { recursive: true });
      fs.writeFileSync(t, html, 'utf8');
      log.push(`  wrote ${t} (${html.length} bytes)`);
    } catch (e) {
      log.push(`  WARN could not write ${t}: ${(e as Error).message}`);
    }
  }
  // Build the en/em-dash class from char codes so this guard file is itself dash-free.
  const dashClass = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']', 'g');
  const dash = (html.match(dashClass) || []).length;
  log.push(`  em/en-dash count in ${basename}: ${dash}`);
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const repoDir = path.join(repoRoot, 'docs', 'demo-artifacts');
  const dlDir = path.join(os.homedir(), 'Downloads');
  const log: string[] = [];

  // ---- run the real forward-track chain (mirrors forwardTrackDemo.ts) ----
  const email: InboundEmail = {
    messageId: 'gmail-thread-demo-0725',
    from: 'John Dispatcher <dispatch@abcmfg.com>',
    to: ['quotes@shipces.com'],
    subject: 'URGENT expedite - need a sprinter ASAP',
    body: 'Hi team, please quote from El Paso, TX to Detroit, MI. About 3,200 lbs, sprinter, we need it ASAP - line down. Thanks.',
    receivedAt: '2026-05-21T12:00:00Z',
  };
  const idem = new InMemoryIdempotencyStore();
  const dead = new InMemoryDeadLetterStore();
  const ing = await ingestEmail(email, { idempotency: idem, deadLetter: dead });
  if (ing.status !== 'accepted') throw new Error('ingest failed: ' + ing.status);
  const rfq = ing.rfq;
  const again = await ingestEmail(email, { idempotency: idem, deadLetter: dead });

  const store = new InMemoryShipmentStore();
  const handoff = await handoffRmsToOms(rfq, ing.emailHash, store);
  let s: Shipment = (handoff as { shipment: Shipment }).shipment;
  s = val(applyOmsEvent(s, 'parse', AT));
  s = val(applyOmsEvent(s, 'price', AT));
  s = { ...s, economics: { sellRateUsd: 2400 } };
  s = val(applyOmsEvent(s, 'send_quote', AT));
  s = val(applyOmsEvent(s, 'win', AT));
  const tenderRes = tenderShipment(s, AT);
  if (!tenderRes.ok) throw new Error('tender failed');
  s = tenderRes.shipment;
  const tender = tenderRes.tender;

  s = val(acceptTender(s, AT));
  const sourced = await sourceCarriers(s, { dat: new MockDatEngine(), fmcsa: new MockFmcsaEngine() });
  s = val(applyTmsEvent(s, 'assign_carrier', AT));
  for (const code of ['X3', 'AF', 'D1'] as const) {
    const m = recordMilestone(s, code, AT);
    if (!m.ok) throw new Error(m.errors.join());
    s = m.shipment;
  }
  const bms = handoffToBms(s, AT, 'POD-DEMO-0725', [{ code: 'DET', description: 'Detention (2 hr)', amountUsd: 150 }]);
  if (!bms.ok) throw new Error('bms handoff failed');
  const billReady = bms.billReady;
  const invoice = generateInvoice(billReady, { invoiceSeq: 1, issueDate: ISSUE, fuelSurchargePct: 0.18 });

  // fail-closed: same generator, no linehaul -> it refuses to issue.
  let failClosedMsg = '';
  try {
    generateInvoice({ ...billReady, sellRateUsd: undefined }, { invoiceSeq: 2, issueDate: ISSUE, fuelSurchargePct: 0.18 });
    failClosedMsg = '(unexpected: invoice was issued with no linehaul)';
  } catch (e) {
    failClosedMsg = (e as Error).message;
  }

  // derived display values from the REAL rfq
  const origin = `${rfq.shipment.stops[0]!.location.city}, ${rfq.shipment.stops[0]!.location.state}`;
  const dest = `${rfq.shipment.stops[1]!.location.city}, ${rfq.shipment.stops[1]!.location.state}`;
  const equip = rfq.shipment.equipmentOptions[0]!.equipmentType;
  const weightLb = rfq.shipment.commodities[0]!.weightLb;
  const commodity = rfq.shipment.commodities[0]!.description;
  const svcTypes = rfq.serviceTypes ?? [];
  const conf = rfq.rawExtraction?.overallConfidence;
  const channel = rfq.source.channel;

  // ============ 1. INVOICE ============
  const invRows = invoice.lineItems.map((li) =>
    `<tr><td class="mono">${esc(li.code)}</td><td>${esc(li.description)}</td><td class="num">${money(li.amountUsd)}</td></tr>`).join('');
  const invoiceBody = `<div class="pad">
    <div class="card navy">
      <table role="presentation" style="border:none;"><tr>
        <td style="border:none;padding:0;width:60%;vertical-align:top;">
          <div class="kv">
            <div class="k">Invoice number</div><div class="v mono">${esc(invoice.invoiceNumber)}</div>
            <div class="k">EDI alignment</div><div class="v">${esc(invoice.ediAlignment)} (Motor Carrier Freight Invoice)</div>
            <div class="k">Issue date</div><div class="v">${esc(invoice.issueDate)}</div>
            <div class="k">Customer</div><div class="v mono">${esc(invoice.customerId)}</div>
            <div class="k">Load reference</div><div class="v mono">${esc(invoice.loadReference)}</div>
            <div class="k">Bill-Ready ref</div><div class="v mono">${esc(invoice.billReadyRef)}</div>
            <div class="k">POD reference</div><div class="v mono">${esc(billReady.podRef)}</div>
            <div class="k">Final weight</div><div class="v">${billReady.finalWeightLb.toLocaleString('en-US')} lb</div>
          </div>
        </td>
        <td style="border:none;padding:0;vertical-align:top;text-align:right;">
          <div class="pill" style="background:${COL.green};">Delivered, POD on file</div>
          <div class="muted" style="margin-top:8px;">Currency ${esc(invoice.currency)}</div>
        </td>
      </tr></table>
    </div>
    <h2>Charges</h2>
    <table>
      <tr><th style="width:80px;">Code</th><th>Description</th><th class="num" style="width:130px;">Amount</th></tr>
      ${invRows}
      <tr class="total"><td></td><td>TOTAL DUE</td><td class="num">${money(invoice.totalUsd)}</td></tr>
    </table>
    <p class="muted" style="margin-top:14px;">This invoice is generated deterministically by <span class="mono">generateInvoice()</span> in <span class="mono">services/bms/src/invoice.ts</span> from the Bill-Ready record TMS emits at DELIVERED. The total (${money(invoice.totalUsd)}) is pinned by <span class="mono">tests/unit/forwardChain.test.ts</span>. Field-level detail (accessorial codes, fuel surcharge model, customer-rule overrides) is calibrated by Brett's invoice-anatomy walkthrough; the ACC line carries the source code <span class="mono">${esc(billReady.accessorials[0]?.code)}</span> on the Bill-Ready record.</p>
  </div>`;
  writeArtifact('ShipCES-Invoice-AF-INV-0001.html',
    page(`Invoice ${invoice.invoiceNumber}`, `Backward track: a delivered load bills itself. Total ${money(invoice.totalUsd)}.`, invoiceBody),
    repoDir, dlDir, log);

  // ============ 2. BMS DEMO SCREEN ============
  const brRows = `<div class="kv">
    <div class="k">Bill-Ready ref</div><div class="v mono">${esc(billReady.billReadyRef)}</div>
    <div class="k">Shipment</div><div class="v mono">${esc(billReady.shipmentId)}</div>
    <div class="k">Load reference</div><div class="v mono">${esc(billReady.loadReference)}</div>
    <div class="k">Customer</div><div class="v mono">${esc(billReady.customerId)}</div>
    <div class="k">POD reference</div><div class="v mono">${esc(billReady.podRef)}</div>
    <div class="k">Final weight</div><div class="v">${billReady.finalWeightLb.toLocaleString('en-US')} lb</div>
    <div class="k">Sell rate (linehaul)</div><div class="v">${money(billReady.sellRateUsd ?? 0)}</div>
    <div class="k">Accessorials</div><div class="v">${billReady.accessorials.map((a) => esc(a.description) + ' ' + money(a.amountUsd)).join(', ')}</div>
  </div>`;
  const bmsInvRows = invoice.lineItems.map((li) =>
    `<tr><td class="mono">${esc(li.code)}</td><td>${esc(li.description)}</td><td class="num">${money(li.amountUsd)}</td></tr>`).join('');
  const bmsBody = `<div class="pad">
    <div class="card blue">
      <h3>Demo script (given / when / then)</h3>
      <div style="font-size:13px;color:${COL.slate};"><b style="color:${COL.navy};">Given</b> a delivered shipment with a POD; <b style="color:${COL.navy};">When</b> BMS runs on fake data; <b style="color:${COL.navy};">Then</b> invoice ${esc(invoice.invoiceNumber)} is produced (${money(2400)} linehaul + 18% fuel + ${money(150)} detention = ${money(invoice.totalUsd)}); <b style="color:${COL.navy};">And</b> with no linehaul it refuses to issue.</div>
    </div>
    <div class="card navy"><h2>Step 1. TMS hands BMS a Bill-Ready record at DELIVERED</h2>${brRows}</div>
    <div class="card green"><h2>Step 2. BMS bills it: invoice ${esc(invoice.invoiceNumber)} (EDI 210)</h2>
      <table>
        <tr><th style="width:80px;">Code</th><th>Description</th><th class="num" style="width:130px;">Amount</th></tr>
        ${bmsInvRows}
        <tr class="total"><td></td><td>TOTAL</td><td class="num">${money(invoice.totalUsd)}</td></tr>
      </table>
    </div>
    <div class="card red"><h2>Step 3. Fail-closed: no linehaul, no invoice</h2>
      <p style="font-size:13px;color:${COL.slate};margin:0 0 8px;">The same generator is called with a Bill-Ready record that has no sell rate and no linehaul override. It does not guess or issue a zero invoice. It refuses:</p>
      <div class="mono" style="background:#fff5f5;border:1px solid #fed7d7;border-radius:8px;padding:10px 12px;color:${COL.red};">Error: ${esc(failClosedMsg)}</div>
      <p class="muted" style="margin-top:8px;">Asserted in <span class="mono">tests/unit/bms/bms.test.ts</span> ("fails closed when no linehaul is available"). Protecting margin means never issuing a bill you cannot stand behind.</p>
    </div>
  </div>`;
  writeArtifact('ShipCES-BMS-Demo.html',
    page('BMS billing on fake data', `Jul 16 backward-track demo: Delivered to invoice ${invoice.invoiceNumber}, and the guardrail that refuses a bad bill.`, bmsBody),
    repoDir, dlDir, log);

  // ============ 3. RFQ CARD ============
  const chips = svcTypes.map((t, i) => `<span class="chip${i === 0 ? ' lead' : ''}">${esc(t)}</span>`).join('');
  const rfqBody = `<div class="pad">
    <div class="card navy">
      <h3>The inbound email</h3>
      <div class="kv">
        <div class="k">From</div><div class="v">${esc(email.from)}</div>
        <div class="k">Subject</div><div class="v">${esc(email.subject)}</div>
      </div>
      <div class="mono" style="margin-top:8px;background:${COL.bgAlt};border:1px solid ${COL.border};border-radius:8px;padding:10px 12px;">${esc(email.body)}</div>
    </div>
    <div class="card green">
      <h2>Canonical RFQ ${esc(rfq.rfqId)}</h2>
      <div class="kv">
        <div class="k">Lane</div><div class="v">${esc(origin)} to ${esc(dest)}</div>
        <div class="k">Equipment</div><div class="v">${esc(equip)}</div>
        <div class="k">Weight</div><div class="v">${weightLb.toLocaleString('en-US')} lb (${esc(commodity)})</div>
        <div class="k">Channel</div><div class="v">${esc(channel)}</div>
        <div class="k">Confidence</div><div class="v">${esc(conf)} &nbsp;<span class="pill" style="background:${COL.green};">status ${esc(rfq.status)}</span></div>
        <div class="k">Human review</div><div class="v">${ing.needsHumanReview ? 'required' : 'not needed (both locations, freight and vehicle stated)'}</div>
      </div>
      <div style="margin-top:12px;"><div class="k" style="color:${COL.gray};font-weight:600;font-size:12px;margin-bottom:4px;">Service-type options (Karun D6 multi-option inference)</div>${chips}</div>
    </div>
    <div class="card blue">
      <h3>Idempotency</h3>
      <div style="font-size:13px;color:${COL.slate};">Re-ingesting the identical email returns <b>${esc(again.status)}</b> with the same rfqId (<span class="mono">${esc(again.status === 'duplicate' ? again.rfqId : rfq.rfqId)}</span>). No duplicate quote, no duplicate row. Idempotency key <span class="mono">${esc(ing.emailHash.slice(0, 24))}...</span></div>
    </div>
  </div>`;
  writeArtifact('ShipCES-RFQ-Card.html',
    page('RFQ card', `Forward track: one broker email becomes one canonical, validated RFQ.`, rfqBody),
    repoDir, dlDir, log);

  // ============ 4. FORWARD STORYBOARD ============
  const sbBody = `<div class="pad">
    <p class="muted" style="margin-top:0;">Four frames, left to right. This is exactly what a 60-second screen recording shows: an inbound email becomes a canonical RFQ, and the identical email cannot create a second load. Record it straight down this filmstrip.</p>
    <div class="frames">
      <div class="frame"><div class="fh">Frame 1. Email lands</div><div class="fb">
        <div class="mono"><b>From:</b> ${esc(email.from)}<br><b>Subj:</b> ${esc(email.subject)}<br><br>${esc(email.body)}</div>
      </div></div>
      <div class="frame"><div class="fh">Frame 2. Parsed to canonical RFQ</div><div class="fb">
        <div class="kv" style="grid-template-columns:96px 1fr;">
          <div class="k">rfqId</div><div class="v mono" style="font-size:11px;">${esc(rfq.rfqId)}</div>
          <div class="k">Lane</div><div class="v">${esc(origin)} to ${esc(dest)}</div>
          <div class="k">Equip</div><div class="v">${esc(equip)}, ${weightLb.toLocaleString('en-US')} lb</div>
          <div class="k">Service</div><div class="v" style="font-size:11.5px;">${esc(svcTypes.join(' + '))}</div>
          <div class="k">Confidence</div><div class="v">${esc(conf)} to status ${esc(rfq.status)}</div>
        </div>
      </div></div>
      <div class="frame"><div class="fh">Frame 3. Same email again</div><div class="fb">
        <div style="font-size:13px;">Re-ingested the identical email.<br><br><span class="pill" style="background:${COL.amber};">${esc(again.status)}</span><br><br>Same rfqId returned. <b>No duplicate quote, no duplicate row.</b></div>
      </div></div>
      <div class="frame"><div class="fh">Frame 4. Flows to OMS</div><div class="fb">
        <div style="font-size:13px;">The won RFQ is staged and tendered.<br><br><b>EDI 910 tender</b><br><span class="mono">load ${esc(tender.loadReference)}, ${esc(tender.equipmentCode)}, ${tender.weightLb.toLocaleString('en-US')} lb</span><br><br>One clean RFQ, on its way to execution.</div>
      </div></div>
    </div>
  </div>`;
  writeArtifact('ShipCES-Forward-Storyboard.html',
    page('Email to RFQ storyboard', `Forward track: the four frames to record for the Jul 16 demo.`, sbBody),
    repoDir, dlDir, log);

  // ============ 5. CONSOLIDATED DEMO WALKTHROUGH (one page, demo order) ============
  const invRows2 = invoice.lineItems.map((li) =>
    `<tr><td class="mono">${esc(li.code)}</td><td>${esc(li.description)}</td><td class="num">${money(li.amountUsd)}</td></tr>`).join('');
  const demoPage = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ShipCES Jul 16 demo</title>
<style>
  :root{--navy:${COL.navy};--blue:${COL.blue};--green:${COL.green};--amber:${COL.amber};--red:${COL.red};--slate:${COL.slate};--gray:${COL.gray};--border:${COL.border};--bgalt:${COL.bgAlt};}
  *{box-sizing:border-box;} body{margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#2d3748;line-height:1.5;}
  .wrap{max-width:960px;margin:0 auto;background:#fff;box-shadow:0 1px 8px rgba(0,0,0,.1);}
  .hero{background:var(--navy);color:#fff;padding:30px 34px;}
  .hero .eyebrow{color:#9ec5e8;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;}
  .hero h1{margin:8px 0 0;font-size:28px;font-weight:800;}
  .hero .sub{color:#cbd9e8;font-size:14px;margin-top:8px;max-width:720px;}
  .hero .run{margin-top:12px;font-family:Consolas,Menlo,monospace;font-size:12px;color:#9ec5e8;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:7px 10px;display:inline-block;}
  .agenda{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--border);padding:10px 34px;display:flex;flex-wrap:wrap;gap:6px;}
  .agenda a{font-size:11px;font-weight:700;color:var(--navy);background:var(--bgalt);border:1px solid var(--border);border-radius:20px;padding:4px 11px;text-decoration:none;}
  .agenda a:hover{background:#ebf3fb;border-color:#cfe0f2;color:var(--blue);}
  .band{padding:8px 34px;background:var(--bgalt);border-bottom:1px solid var(--border);}
  .band h2{margin:10px 0 4px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:var(--slate);}
  .pad{padding:20px 34px;}
  .seg{border:1px solid var(--border);border-radius:10px;background:#fff;margin-bottom:16px;overflow:hidden;}
  .seg .sh{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);background:#fbfdff;}
  .seg .n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--navy);color:#fff;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;}
  .seg .t{font-size:15px;font-weight:800;color:var(--navy);}
  .seg .b{padding:14px 16px;}
  .gwt{font-size:12.5px;color:var(--slate);background:#f5f9fd;border-left:3px solid var(--blue);border-radius:0 6px 6px 0;padding:8px 12px;margin-bottom:12px;}
  .gwt b{color:var(--navy);}
  .kv{display:grid;grid-template-columns:150px 1fr;gap:6px 14px;font-size:13px;}
  .kv .k{color:var(--gray);font-weight:600;} .kv .v{color:var(--navy);font-weight:600;}
  table{width:100%;border-collapse:collapse;font-size:13px;} th,td{border:1px solid var(--border);padding:8px 10px;text-align:left;vertical-align:top;}
  th{background:var(--navy);color:#fff;font-weight:700;font-size:12px;} tr:nth-child(even) td{background:var(--bgalt);}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;} .total td{font-weight:800;color:var(--navy);font-size:15px;background:#fff;border-top:2px solid var(--navy);}
  .chip{display:inline-block;background:#ebf3fb;color:var(--blue);border:1px solid #cfe0f2;border-radius:20px;padding:3px 11px;font-size:11.5px;font-weight:700;margin:2px 4px 2px 0;} .chip.lead{background:var(--blue);color:#fff;}
  .pill{display:inline-block;color:#fff;font-size:11px;font-weight:700;padding:2px 9px;border-radius:9px;}
  .mono{font-family:Consolas,Menlo,monospace;font-size:12px;color:var(--slate);}
  .diagram{background:var(--bgalt);border:1px solid var(--border);border-radius:10px;padding:14px;overflow-x:auto;margin-bottom:14px;}
  .foot{border-top:1px solid var(--border);padding:16px 34px 26px;font-size:11.5px;color:var(--gray);}
  @media(max-width:640px){.kv{grid-template-columns:1fr;}}
</style></head>
<body><div class="wrap">
<div class="hero">
  <div class="eyebrow">ShipCES Autonomous Brokerage</div>
  <h1>Jul 16 demo: one email becomes a paid invoice, no humans</h1>
  <div class="sub">Thursday Jul 16, 10:00 CST. Two tracks run in parallel and meet in the middle. Every value on this page is produced by the real services/* code, deterministically, and is test-pinned (invoice AF-INV-0001 = ${money(invoice.totalUsd)}).</div>
  <div class="run">npx ts-node --transpile-only scripts/shipces-demo/forwardTrackDemo.ts</div>
</div>
<nav class="agenda">
  <a href="#s1">1. Email in</a><a href="#s2">2. Canonical RFQ</a><a href="#s3">3. Idempotency</a><a href="#s4">4. Tender (910)</a><a href="#s5">5. Invoice (210)</a><a href="#s6">6. Fail-closed</a><a href="#s7">7. Architecture</a>
</nav>

<div class="band"><h2>Forward track: RMS / W1 (email to tender)</h2></div>
<div class="pad">
  <div class="seg" id="s1"><div class="sh"><div class="n">1</div><div class="t">An inbound broker email lands</div></div><div class="b">
    <div class="kv"><div class="k">From</div><div class="v">${esc(email.from)}</div><div class="k">Subject</div><div class="v">${esc(email.subject)}</div></div>
    <div class="mono" style="margin-top:8px;background:${COL.bgAlt};border:1px solid ${COL.border};border-radius:8px;padding:10px 12px;">${esc(email.body)}</div>
  </div></div>
  <div class="seg" id="s2"><div class="sh"><div class="n">2</div><div class="t">Parsed into one canonical RFQ</div></div><div class="b">
    <div class="gwt"><b>Given</b> the URGENT sprinter email; <b>When</b> it is ingested; <b>Then</b> one canonical RFQ is created with multi-option service types.</div>
    <div class="kv">
      <div class="k">rfqId</div><div class="v mono">${esc(rfq.rfqId)}</div>
      <div class="k">Lane</div><div class="v">${esc(origin)} to ${esc(dest)}</div>
      <div class="k">Equipment</div><div class="v">${esc(equip)}</div>
      <div class="k">Weight</div><div class="v">${weightLb.toLocaleString('en-US')} lb (${esc(commodity)})</div>
      <div class="k">Confidence</div><div class="v">${esc(conf)} &nbsp;<span class="pill" style="background:${COL.green};">status ${esc(rfq.status)}</span></div>
      <div class="k">Human review</div><div class="v">${ing.needsHumanReview ? 'required' : 'not needed'}</div>
    </div>
    <div style="margin-top:12px;"><div class="k" style="color:${COL.gray};font-weight:600;font-size:12px;margin-bottom:4px;">Service-type options (Karun D6 multi-option inference)</div>${chips}</div>
  </div></div>
  <div class="seg" id="s3"><div class="sh"><div class="n">3</div><div class="t">The same email cannot create a second load</div></div><div class="b">
    <div class="gwt"><b>Given</b> the identical email arrives again; <b>When</b> it is ingested; <b>Then</b> it returns <b>${esc(again.status)}</b> with the same rfqId. No duplicate quote, no duplicate row.</div>
    <div class="kv"><div class="k">Result</div><div class="v"><span class="pill" style="background:${COL.amber};">${esc(again.status)}</span></div><div class="k">rfqId</div><div class="v mono">${esc(again.status === 'duplicate' ? again.rfqId : rfq.rfqId)}</div><div class="k">Idempotency key</div><div class="v mono">${esc(ing.emailHash.slice(0, 28))}...</div></div>
  </div></div>
  <div class="seg" id="s4"><div class="sh"><div class="n">4</div><div class="t">Staged, priced, won, tendered to transportation</div></div><div class="b">
    <div class="gwt"><b>Given</b> a won RFQ; <b>When</b> OMS stages and prices it; <b>Then</b> the shipment walks to TENDERED and an EDI 910 load tender is emitted only from WON.</div>
    <div class="kv"><div class="k">State</div><div class="v"><span class="pill" style="background:${COL.blue};">TENDERED</span></div><div class="k">EDI 910 tender</div><div class="v mono">load ${esc(tender.loadReference)}, ${esc(tender.equipmentCode)}, ${tender.weightLb.toLocaleString('en-US')} lb</div><div class="k">Sell rate</div><div class="v">${money(2400)} linehaul</div></div>
  </div></div>
</div>

<div class="band"><h2>Backward track: BMS (delivered load bills itself, on fake data)</h2></div>
<div class="pad">
  <div class="seg" id="s5"><div class="sh"><div class="n">5</div><div class="t">Invoice ${esc(invoice.invoiceNumber)} (EDI 210)</div></div><div class="b">
    <div class="gwt"><b>Given</b> a delivered shipment with a POD; <b>When</b> BMS runs; <b>Then</b> invoice ${esc(invoice.invoiceNumber)} is produced (linehaul + 18% fuel + detention = ${money(invoice.totalUsd)}).</div>
    <div class="kv" style="margin-bottom:10px;"><div class="k">Customer</div><div class="v mono">${esc(invoice.customerId)}</div><div class="k">Load reference</div><div class="v mono">${esc(invoice.loadReference)}</div><div class="k">POD</div><div class="v mono">${esc(billReady.podRef)}</div></div>
    <table><tr><th style="width:80px;">Code</th><th>Description</th><th class="num" style="width:130px;">Amount</th></tr>${invRows2}<tr class="total"><td></td><td>TOTAL DUE</td><td class="num">${money(invoice.totalUsd)}</td></tr></table>
  </div></div>
  <div class="seg" id="s6"><div class="sh"><div class="n">6</div><div class="t">With no linehaul, it refuses to issue</div></div><div class="b">
    <div class="gwt"><b>Given</b> a Bill-Ready record with no rate; <b>When</b> BMS tries to bill it; <b>Then</b> it does not guess or issue a zero invoice. It fails closed.</div>
    <div class="mono" style="background:#fff5f5;border:1px solid #fed7d7;border-radius:8px;padding:10px 12px;color:${COL.red};">Error: ${esc(failClosedMsg)}</div>
  </div></div>
</div>

<div class="band"><h2>Architecture (own the brain, rent the senses)</h2></div>
<div class="pad" id="s7">
  <div class="diagram"><pre class="mermaid">
flowchart LR
  EMAIL_IN([Broker RFQ email]):::ext
  CUST([Customer]):::ext
  subgraph BRAIN[Own the brain: four domain layers]
    direction LR
    RMS["RMS"]:::rms
    OMS["OMS"]:::oms
    TMS["TMS"]:::tms
    BMS["BMS"]:::bms
  end
  subgraph SENSE[Rent the senses: adapters]
    direction LR
    DAT["DAT"]:::sense
    FMCSA["FMCSA"]:::sense
    SYL["Sylectus"]:::sense
    EMAILA["Email"]:::sense
  end
  EMAIL_IN --> EMAILA --> RMS
  RMS -->|canonical RFQ| OMS
  OMS -->|EDI 910 tender| TMS
  TMS -->|Delivered, Bill-Ready| BMS
  BMS -->|EDI 210 invoice| CUST
  DAT -->|sourcing| TMS
  FMCSA -->|vetting| TMS
  SYL -->|reply catchment| TMS
  classDef ext fill:#ffffff,stroke:#718096,color:#4a5568;
  classDef sense fill:#f7fafc,stroke:#718096,color:#1a365d;
  classDef rms fill:#ebf3fb,stroke:#2b6cb0,color:#1a365d;
  classDef oms fill:#e9f7ef,stroke:#38a169,color:#1a365d;
  classDef tms fill:#fff5eb,stroke:#dd6b20,color:#1a365d;
  classDef bms fill:#fdecea,stroke:#e53e3e,color:#1a365d;
</pre></div>
  <div class="diagram"><pre class="mermaid">
stateDiagram-v2
  [*] --> RECEIVED
  RECEIVED --> PARSED: parse
  PARSED --> PRICED: price
  PRICED --> QUOTE_SENT: send_quote
  QUOTE_SENT --> WON: win
  QUOTE_SENT --> LOST: lose
  WON --> TENDERED: tender
  TENDERED --> SOURCING: accept
  SOURCING --> CARRIER_ASSIGNED: assign_carrier
  CARRIER_ASSIGNED --> DISPATCHED: 214 X3
  DISPATCHED --> IN_TRANSIT: 214 AF
  IN_TRANSIT --> DELIVERED: 214 D1
  DELIVERED --> BILL_READY: bill_ready
  BILL_READY --> INVOICED: invoice
  LOST --> [*]
  INVOICED --> [*]
</pre></div>
</div>
<div class="foot">This IS the real code path (services/rms, oms, tms, bms, adapters), deterministic and test-pinned. It is NOT yet on live DAT data (mock engine, pending the DAT API), and the BMS field detail (accessorial codes, fuel model) is a scaffold pending Brett's invoice-anatomy walkthrough. No em-dashes or en-dashes.</div>
</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>try{mermaid.initialize({startOnLoad:true,theme:'neutral'});}catch(e){}</script>
</body></html>`;
  writeArtifact('ShipCES-Jul16-Demo.html', demoPage, repoDir, dlDir, log);

  // ---- report ----
  console.log('ARTIFACTS BUILT (real-data, deterministic):');
  console.log(log.join('\n'));
  const totalDash = log.filter((l) => /em\/en-dash count/.test(l)).map((l) => Number(l.split(':').pop())).reduce((a, b) => a + b, 0);
  console.log(`\nInvoice ${invoice.invoiceNumber} total ${money(invoice.totalUsd)} | RFQ ${rfq.rfqId} | fail-closed msg captured: ${failClosedMsg ? 'yes' : 'no'}`);
  console.log(`TOTAL em/en-dash across artifacts: ${totalDash}`);
}

main().catch((e) => { console.error('BUILD FAILED:', e.message); process.exit(1); });
