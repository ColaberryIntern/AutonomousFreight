/**
 * Tender shape (EDI 910 alignment) — the OMS → TMS handoff payload.
 *
 * Per Brett (Jun 18), 910 is the OMS-to-TMS handoff code. Field semantics below
 * mirror a load tender so a future real-EDI integration is a thin mapping layer,
 * not a redesign (BC OMS: "future EDI integration is a thin adapter").
 */
import { applyOmsEvent } from './stateMachine';
import type { Shipment } from './schema/shipment.v1';

export interface TenderStop {
  sequence: number;
  type: 'pickup' | 'delivery';
  city?: string;
  state?: string;
  country: string;
  date?: string;
}

export interface TenderPayload {
  ediAlignment: '910';
  tenderId: string;
  shipmentId: string;
  loadReference: string;
  mode: string;
  equipmentCode: string;
  weightLb: number;
  commodity: string;
  stops: TenderStop[];
}

/** Short human-facing load reference derived from the shipment id (stable). */
export function loadReferenceFor(shipmentId: string): string {
  return `AF-${shipmentId.replace(/^shp_/, '').slice(0, 8).toUpperCase()}`;
}

/** Pure mapping shipment → EDI-910-aligned tender payload. */
export function buildTender(shipment: Shipment): TenderPayload {
  const stops: TenderStop[] = [
    { sequence: 1, type: 'pickup', country: shipment.lane.origin.country, ...(shipment.lane.origin.city ? { city: shipment.lane.origin.city } : {}), ...(shipment.lane.origin.state ? { state: shipment.lane.origin.state } : {}), ...(shipment.pickupDate ? { date: shipment.pickupDate } : {}) },
    { sequence: 2, type: 'delivery', country: shipment.lane.destination.country, ...(shipment.lane.destination.city ? { city: shipment.lane.destination.city } : {}), ...(shipment.lane.destination.state ? { state: shipment.lane.destination.state } : {}), ...(shipment.deliveryDate ? { date: shipment.deliveryDate } : {}) },
  ];
  return {
    ediAlignment: '910',
    tenderId: `TND-${shipment.shipmentId.replace(/^shp_/, '').slice(0, 10)}`,
    shipmentId: shipment.shipmentId,
    loadReference: loadReferenceFor(shipment.shipmentId),
    mode: shipment.mode,
    equipmentCode: shipment.equipmentType,
    weightLb: shipment.totalWeightLb,
    commodity: shipment.commoditySummary,
    stops,
  };
}

export type TenderResult =
  | { ok: true; shipment: Shipment; tender: TenderPayload }
  | { ok: false; errors: string[] };

/**
 * Tender a WON shipment: transition WON → TENDERED and emit the tender payload.
 * Fails cleanly if the shipment is not in a tenderable state.
 */
export function tenderShipment(shipment: Shipment, at: string): TenderResult {
  const moved = applyOmsEvent(shipment, 'tender', at);
  if (!moved.ok) return { ok: false, errors: moved.errors };
  return { ok: true, shipment: moved.value, tender: buildTender(moved.value) };
}
