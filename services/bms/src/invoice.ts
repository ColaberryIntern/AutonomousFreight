/**
 * BMS invoice generation (EDI 210 alignment).
 *
 * Per Brett (Jun 18): "the invoice is the contract with the customer" and the
 * BMS output. This consumes the Bill-Ready record TMS emits at DELIVERED and
 * produces a line-itemized invoice with a sequential AF-INV number. EDI 210
 * (Motor Carrier Freight Invoice) field mapping is noted inline so a future EDI
 * customer integration is a thin adapter.
 *
 * NOTE: field-level detail (accessorial codes, FSC model, customer-rule
 * overrides) is refined by Brett's invoice-anatomy walkthrough (BC BMS-Back,
 * Jun 25). This is the deterministic code scaffold that walkthrough calibrates.
 */
import type { Accessorial, BillReadyRecord } from '../../tms/src/handoffBms';

export interface InvoiceLineItem {
  /** EDI 210 charge code bucket. */
  code: string;
  description: string;
  amountUsd: number;
}

export interface Invoice {
  ediAlignment: '210';
  invoiceNumber: string;
  billReadyRef: string;
  shipmentId: string;
  loadReference: string;
  customerId: string;
  issueDate: string;
  currency: string;
  lineItems: InvoiceLineItem[];
  subtotalUsd: number;
  totalUsd: number;
}

export interface InvoiceParams {
  invoiceSeq: number;
  issueDate: string;
  /** Linehaul in USD. Falls back to the Bill-Ready sellRate when omitted. */
  linehaulUsd?: number;
  /** Fuel surcharge as a percent of linehaul (e.g. 0.18 for 18%). */
  fuelSurchargePct?: number;
  currency?: string;
}

export function nextInvoiceNumber(seq: number): string {
  return `AF-INV-${String(seq).padStart(4, '0')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Generate a customer invoice from a Bill-Ready record. Deterministic: same
 * inputs → same invoice (same number, same totals). Throws only if no linehaul
 * can be determined (a contract violation the caller must fix upstream).
 */
export function generateInvoice(billReady: BillReadyRecord, params: InvoiceParams): Invoice {
  const linehaul = params.linehaulUsd ?? billReady.sellRateUsd;
  if (linehaul === undefined) {
    throw new Error('cannot invoice: no linehaul rate on Bill-Ready record or params');
  }
  const currency = params.currency ?? 'USD';
  const lineItems: InvoiceLineItem[] = [
    { code: '400', description: 'Linehaul', amountUsd: round2(linehaul) },
  ];
  if (params.fuelSurchargePct && params.fuelSurchargePct > 0) {
    lineItems.push({ code: 'FUE', description: `Fuel surcharge (${Math.round(params.fuelSurchargePct * 100)}%)`, amountUsd: round2(linehaul * params.fuelSurchargePct) });
  }
  for (const acc of billReady.accessorials as Accessorial[]) {
    lineItems.push({ code: 'ACC', description: acc.description, amountUsd: round2(acc.amountUsd) });
  }
  const subtotal = round2(lineItems.reduce((sum, li) => sum + li.amountUsd, 0));
  return {
    ediAlignment: '210',
    invoiceNumber: nextInvoiceNumber(params.invoiceSeq),
    billReadyRef: billReady.billReadyRef,
    shipmentId: billReady.shipmentId,
    loadReference: billReady.loadReference,
    customerId: billReady.customerId,
    issueDate: params.issueDate,
    currency,
    lineItems,
    subtotalUsd: subtotal,
    totalUsd: subtotal,
  };
}
