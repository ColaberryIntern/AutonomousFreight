/**
 * TMS → BMS handoff — THE convergence point of the forward and backward tracks.
 *
 * Per Brett (Jun 18): "Delivered triggers BMS, which is invoice." When a
 * shipment hits DELIVERED, TMS writes a Bill-Ready record (POD reference, final
 * weight, accessorials) that BMS picks up. The handoff contract must be clean:
 * BMS should never need to reach back into TMS internals.
 */
import { loadReferenceFor } from '../../oms/src/tender';
import type { Shipment } from '../../oms/src/schema/shipment.v1';
import { applyTmsEvent } from './stateMachine';

export interface Accessorial {
  code: string;
  description: string;
  amountUsd: number;
}

export interface BillReadyRecord {
  billReadyRef: string;
  shipmentId: string;
  loadReference: string;
  customerId: string;
  finalWeightLb: number;
  deliveredAt: string;
  podRef?: string;
  accessorials: Accessorial[];
  sellRateUsd?: number;
}

export function buildBillReady(shipment: Shipment, deliveredAt: string, podRef?: string, accessorials: Accessorial[] = []): BillReadyRecord {
  return {
    billReadyRef: `BR-${shipment.shipmentId.replace(/^shp_/, '').slice(0, 10)}`,
    shipmentId: shipment.shipmentId,
    loadReference: loadReferenceFor(shipment.shipmentId),
    customerId: shipment.customer.customerId,
    finalWeightLb: shipment.totalWeightLb,
    deliveredAt,
    ...(podRef ? { podRef } : {}),
    accessorials,
    ...(shipment.economics.sellRateUsd !== undefined ? { sellRateUsd: shipment.economics.sellRateUsd } : {}),
  };
}

export type HandoffBmsResult =
  | { ok: true; shipment: Shipment; billReady: BillReadyRecord }
  | { ok: false; errors: string[] };

/** DELIVERED → BILL_READY. Emits the Bill-Ready record and stamps billReadyRef. */
export function handoffToBms(shipment: Shipment, at: string, podRef?: string, accessorials: Accessorial[] = []): HandoffBmsResult {
  const billReady = buildBillReady(shipment, at, podRef, accessorials);
  const moved = applyTmsEvent(shipment, 'bill_ready', at, `bill_ready:${billReady.billReadyRef}`);
  if (!moved.ok) return { ok: false, errors: moved.errors };
  return { ok: true, shipment: { ...moved.value, billReadyRef: billReady.billReadyRef }, billReady };
}
