import { generateInvoice, nextInvoiceNumber } from '../../../services/bms/src/invoice';
import { matchPod, validatePod, type PodDocument } from '../../../services/bms/src/pod';
import type { BillReadyRecord } from '../../../services/tms/src/handoffBms';

const billReady: BillReadyRecord = {
  billReadyRef: 'BR-ABCDEF0123',
  shipmentId: 'shp_01JV9QX3G7V8YQK9C7F0H1J2K3',
  loadReference: 'AF-01JV9QX3',
  customerId: 'cust_01JV9QX3G7V8YQK9C7F0H1J2K4',
  finalWeightLb: 42000,
  deliveredAt: '2026-05-27T15:00:00Z',
  podRef: 'POD-1',
  accessorials: [{ code: 'DET', description: 'Detention', amountUsd: 150 }],
  sellRateUsd: 2400,
};

describe('BMS invoice generation (EDI 210)', () => {
  it('generates a sequential AF-INV number', () => {
    expect(nextInvoiceNumber(1)).toBe('AF-INV-0001');
    expect(nextInvoiceNumber(42)).toBe('AF-INV-0042');
  });

  it('builds a line-itemized invoice from a Bill-Ready record', () => {
    const inv = generateInvoice(billReady, { invoiceSeq: 7, issueDate: '2026-05-28', fuelSurchargePct: 0.18 });
    expect(inv.ediAlignment).toBe('210');
    expect(inv.invoiceNumber).toBe('AF-INV-0007');
    // linehaul 2400 + FSC 432 + detention 150 = 2982
    expect(inv.totalUsd).toBe(2982);
    expect(inv.lineItems.map((l) => l.code)).toEqual(['400', 'FUE', 'ACC']);
  });

  it('is deterministic (same inputs → same total)', () => {
    const a = generateInvoice(billReady, { invoiceSeq: 7, issueDate: '2026-05-28' });
    const b = generateInvoice(billReady, { invoiceSeq: 7, issueDate: '2026-05-28' });
    expect(a).toEqual(b);
  });

  it('fails closed when no linehaul is available (contract violation surfaced)', () => {
    const noRate: BillReadyRecord = { ...billReady };
    delete (noRate as { sellRateUsd?: number }).sellRateUsd;
    expect(() => generateInvoice(noRate, { invoiceSeq: 1, issueDate: '2026-05-28' })).toThrow();
  });
});

describe('BMS POD ingestion + matching', () => {
  const good: PodDocument = { ref: 'POD-1', source: 'email', loadReference: 'AF-01JV9QX3', signed: true, legible: true, receivedAt: '2026-05-27T16:00:00Z' };
  const shipments = [{ shipmentId: 'shp_01JV9QX3G7V8YQK9C7F0H1J2K3', loadReference: 'AF-01JV9QX3', state: 'DELIVERED' }];

  it('validates a signed, legible, referenced POD', () => {
    expect(validatePod(good).valid).toBe(true);
  });

  it('rejects an unsigned or illegible POD with reasons', () => {
    const bad = validatePod({ ...good, signed: false, legible: false });
    expect(bad.valid).toBe(false);
    expect(bad.issues.length).toBe(2);
  });

  it('matches a valid POD to a billable shipment', () => {
    const m = matchPod(good, shipments);
    expect(m).toMatchObject({ matched: true, shipmentId: 'shp_01JV9QX3G7V8YQK9C7F0H1J2K3' });
  });

  it('does not match a shipment that is not billable yet', () => {
    const m = matchPod(good, [{ ...shipments[0]!, state: 'SOURCING' }]);
    expect(m.matched).toBe(false);
    if (!m.matched) expect(m.reason).toBe('shipment_not_billable');
  });

  it('does not match an invalid POD', () => {
    const m = matchPod({ ...good, signed: false }, shipments);
    expect(m.matched).toBe(false);
    if (!m.matched) expect(m.reason).toBe('invalid_pod');
  });
});
