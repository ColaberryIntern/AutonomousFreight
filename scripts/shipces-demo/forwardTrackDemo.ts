/*
 * ShipCES Autonomous Brokerage - live forward-track demo.
 *
 * Narrates one inbound RFQ email all the way to a customer invoice, printing the
 * real data at every lifecycle stage, then shows the three failure paths
 * (idempotency, human-in-the-loop, dead-letter) and Sylectus reply catchment.
 *
 *   npx ts-node --transpile-only scripts/shipces-demo/forwardTrackDemo.ts
 *
 * Deterministic (no clock/random) so it renders identically every run - safe to
 * drive live on the Thursday 10am call.
 */
import { ingestEmail } from '../../services/rms/src/ingest/pipeline';
import { InMemoryIdempotencyStore, InMemoryDeadLetterStore } from '../../services/rms/src/ingest/stores';
import { handoffRmsToOms, InMemoryShipmentStore } from '../../services/oms/src/handoff';
import { applyOmsEvent } from '../../services/oms/src/stateMachine';
import { tenderShipment } from '../../services/oms/src/tender';
import type { Shipment } from '../../services/oms/src/schema/shipment.v1';
import { acceptTender, applyTmsEvent } from '../../services/tms/src/stateMachine';
import { recordMilestone, EDI_214_CODES } from '../../services/tms/src/milestones';
import { sourceCarriers } from '../../services/tms/src/sourcing';
import { handoffToBms } from '../../services/tms/src/handoffBms';
import { generateInvoice } from '../../services/bms/src/invoice';
import { linkReplyToShipment } from '../../services/rms/src/reply/catchment';
import { MockDatEngine } from '../../services/adapters/src/dat/mockDatEngine';
import { MockFmcsaEngine } from '../../services/adapters/src/fmcsa/mockFmcsaEngine';
import type { InboundEmail } from '../../services/adapters/src/email/emailAdapter';

const AT = '2026-05-25T09:00:00Z';
const line = (c = '-') => console.log(c.repeat(74));
const stage = (n: number, title: string) => {
  console.log('');
  line('=');
  console.log(`  STAGE ${n}  ${title}`);
  line('=');
};
const val = <T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): T => {
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.value;
};

async function main() {
  console.log('');
  console.log('   ShipCES Autonomous Brokerage - Forward Track: email to invoice, no humans');
  console.log('   (deterministic demo, live-safe)');

  // A realistic broker RFQ email.
  const email: InboundEmail = {
    messageId: 'gmail-thread-demo-0725',
    from: 'John Dispatcher <dispatch@abcmfg.com>',
    to: ['quotes@shipces.com'],
    subject: 'URGENT expedite - need a sprinter ASAP',
    body: 'Hi team, please quote from El Paso, TX to Detroit, MI. About 3,200 lbs, sprinter, we need it ASAP - line down. Thanks.',
    receivedAt: '2026-05-21T12:00:00Z',
  };

  stage(1, 'RMS - inbound email lands and is parsed');
  console.log(`  From:    ${email.from}`);
  console.log(`  Subject: ${email.subject}`);
  console.log(`  Body:    ${email.body}`);
  const idem = new InMemoryIdempotencyStore();
  const dead = new InMemoryDeadLetterStore();
  const ing = await ingestEmail(email, { idempotency: idem, deadLetter: dead });
  if (ing.status !== 'accepted') throw new Error('ingest failed');
  const rfq = ing.rfq;
  console.log('');
  console.log(`  -> ACCEPTED. Canonical RFQ created (idempotency key ${ing.emailHash.slice(0, 20)}...)`);
  console.log(`     rfqId:       ${rfq.rfqId}`);
  console.log(`     lane:        ${rfq.shipment.stops[0]!.location.city}, ${rfq.shipment.stops[0]!.location.state} -> ${rfq.shipment.stops[1]!.location.city}, ${rfq.shipment.stops[1]!.location.state}`);
  console.log(`     equipment:   ${rfq.shipment.equipmentOptions[0]!.equipmentType}`);
  console.log(`     weight:      ${rfq.shipment.commodities[0]!.weightLb.toLocaleString()} lb (${rfq.shipment.commodities[0]!.description})`);
  console.log(`     serviceType: ${(rfq.serviceTypes ?? []).join(' + ')}  (Karun D6 multi-option inference)`);
  console.log(`     confidence:  ${rfq.rawExtraction?.overallConfidence} -> status ${rfq.status} (D4/D14 routing)`);

  stage(2, 'RMS - idempotency: the same email cannot create a second load');
  const again = await ingestEmail(email, { idempotency: idem, deadLetter: dead });
  console.log(`  Re-ingested the identical email -> ${again.status.toUpperCase()}`);
  if (again.status === 'duplicate') console.log(`  Same rfqId returned (${again.rfqId}). No duplicate quote, no duplicate row.`);

  stage(3, 'OMS - stage the order, walk the lifecycle, tender to TMS');
  const store = new InMemoryShipmentStore();
  const handoff = await handoffRmsToOms(rfq, ing.emailHash, store);
  let s: Shipment = (handoff as { shipment: Shipment }).shipment;
  console.log(`  Shipment ${s.shipmentId} created in state ${s.state}`);
  for (const ev of ['parse', 'price'] as const) {
    s = val(applyOmsEvent(s, ev, AT));
    if (ev === 'price') s = { ...s, economics: { sellRateUsd: 2400 } };
    console.log(`    ${ev.padEnd(12)} -> ${s.state}${ev === 'price' ? '  (sell rate $2,400)' : ''}`);
  }
  for (const ev of ['send_quote', 'win'] as const) {
    s = val(applyOmsEvent(s, ev, AT));
    console.log(`    ${ev.padEnd(12)} -> ${s.state}`);
  }
  const tender = tenderShipment(s, AT);
  if (!tender.ok) throw new Error('tender failed');
  s = tender.shipment;
  console.log(`    tender       -> ${s.state}`);
  console.log(`  EDI ${tender.tender.ediAlignment} tender emitted: load ${tender.tender.loadReference}, ${tender.tender.equipmentCode}, ${tender.tender.weightLb.toLocaleString()} lb`);

  stage(4, 'TMS - source capacity (DAT) and vet carriers (FMCSA)');
  s = val(acceptTender(s, AT));
  console.log(`  Handoff accepted -> ${s.state}`);
  const sourced = await sourceCarriers(s, { dat: new MockDatEngine(), fmcsa: new MockFmcsaEngine() });
  console.log(`  DAT lane rate:   $${sourced.laneRatePerMile}/mi`);
  console.log(`  Capacity found:  ${sourced.candidates.length} truck(s); ${sourced.bookableCount} bookable after FMCSA authority + insurance check`);
  sourced.candidates.forEach((c) =>
    console.log(`    - ${c.carrierName} (${c.mcNumber ?? 'no MC'})  ${c.bookable ? 'BOOKABLE' : 'blocked'}: ${c.reason}`),
  );

  stage(5, 'TMS - dispatch and track by EDI 214 milestones');
  s = val(applyTmsEvent(s, 'assign_carrier', AT));
  console.log(`  assign_carrier -> ${s.state}`);
  for (const code of ['X3', 'AF', 'D1'] as const) {
    const m = recordMilestone(s, code, AT);
    if (!m.ok) throw new Error(m.errors.join());
    s = m.shipment;
    console.log(`    214 ${code} (${EDI_214_CODES[code]}) -> ${s.state}`);
  }

  stage(6, 'BMS - Delivered triggers billing; produce the invoice');
  const bms = handoffToBms(s, AT, 'POD-DEMO-0725', [{ code: 'DET', description: 'Detention (2 hr)', amountUsd: 150 }]);
  if (!bms.ok) throw new Error('bms handoff failed');
  console.log(`  Bill-Ready ${bms.billReady.billReadyRef} handed to BMS (POD ${bms.billReady.podRef}, ${bms.billReady.finalWeightLb.toLocaleString()} lb)`);
  const invoice = generateInvoice(bms.billReady, { invoiceSeq: 1, issueDate: '2026-05-28', fuelSurchargePct: 0.18 });
  console.log('');
  console.log(`  INVOICE ${invoice.invoiceNumber}  (EDI ${invoice.ediAlignment})   customer load ${invoice.loadReference}`);
  line();
  invoice.lineItems.forEach((li) => console.log(`    ${li.code.padEnd(4)} ${li.description.padEnd(28)} $${li.amountUsd.toLocaleString()}`));
  line();
  console.log(`    ${''.padEnd(4)} ${'TOTAL'.padEnd(28)} $${invoice.totalUsd.toLocaleString()}`);

  stage(7, 'Failure paths - the system degrades safely, not silently');
  // (a) low-confidence email -> human in the loop
  const vague: InboundEmail = { ...email, messageId: 'demo-vague', subject: 'help', body: 'can you move something for me soon?' };
  const vagueOut = await ingestEmail(vague, { idempotency: new InMemoryIdempotencyStore(), deadLetter: new InMemoryDeadLetterStore() });
  if (vagueOut.status === 'accepted') {
    console.log(`  (a) Vague email -> status ${vagueOut.rfq.status}, needsHumanReview=${vagueOut.needsHumanReview}, reason=${vagueOut.rfq.rawExtraction?.hitlReason}`);
    console.log('      (routed to a human instead of guessing a bad quote)');
  }
  // (b) parse failure -> dead-letter for replay
  const dl = new InMemoryDeadLetterStore();
  const bad = await ingestEmail({ ...email, messageId: 'demo-bad' }, { idempotency: new InMemoryIdempotencyStore(), deadLetter: dl, parse: () => ({ ok: false, errors: ['simulated extractor failure'] }) });
  console.log(`  (b) Parse failure -> status ${bad.status}; dead-letter queue holds ${(await dl.list()).length} item for replay (nothing lost)`);
  // (c) carrier reply catchment
  const reply: InboundEmail = { ...email, messageId: 'demo-reply', subject: `Re: covering ${tender.tender.loadReference}`, body: 'I can cover this, MC123456' };
  const link = linkReplyToShipment(reply, [{ shipmentId: s.shipmentId, loadId: tender.tender.loadReference, status: 'Sourcing' }]);
  console.log(`  (c) Carrier reply by email -> ${link.matched ? 'linked to ' + link.shipmentId : 'not matched'} (Sylectus replies arrive by email, we catch them)`);

  console.log('');
  line('=');
  console.log('  DEMO COMPLETE: one email became invoice ' + invoice.invoiceNumber + ' ($' + invoice.totalUsd.toLocaleString() + '), fully audited, fully idempotent.');
  line('=');
  console.log('');
}

main().catch((e) => {
  console.error('DEMO FAILED:', e.message);
  process.exit(1);
});
