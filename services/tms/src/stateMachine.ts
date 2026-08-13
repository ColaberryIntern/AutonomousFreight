/**
 * TMS state machine — sourcing through delivered.
 *
 * Per Brett (Jun 18): "from sourcing including sourcing all the way down to
 * delivered is TMS. Delivered triggers BMS." TENDERED→SOURCING is the OMS→TMS
 * entry; DELIVERED→BILL_READY is the TMS→BMS handoff. EXCEPTION is reachable
 * from any active state and has an explicit recovery edge back to SOURCING
 * (Failure-First Design: exception is never a silent dead-end).
 */
import type { Edge } from '../../oms/src/fsm';
import { applyEvent as apply, canTransition, legalEvents, nextState } from '../../oms/src/fsm';
import type { ParseResult, Shipment } from '../../oms/src/schema/shipment.v1';

export const TMS_EDGES: readonly Edge[] = [
  { from: 'TENDERED', event: 'accept_tender', to: 'SOURCING' },
  { from: 'SOURCING', event: 'assign_carrier', to: 'CARRIER_ASSIGNED' },
  { from: 'CARRIER_ASSIGNED', event: 'dispatch', to: 'DISPATCHED' },
  { from: 'DISPATCHED', event: 'in_transit', to: 'IN_TRANSIT' },
  { from: 'IN_TRANSIT', event: 'deliver', to: 'DELIVERED' },
  { from: 'DELIVERED', event: 'bill_ready', to: 'BILL_READY' },
  // Exception is reachable from any active TMS state...
  { from: 'SOURCING', event: 'exception', to: 'EXCEPTION' },
  { from: 'CARRIER_ASSIGNED', event: 'exception', to: 'EXCEPTION' },
  { from: 'DISPATCHED', event: 'exception', to: 'EXCEPTION' },
  { from: 'IN_TRANSIT', event: 'exception', to: 'EXCEPTION' },
  // ...and always has a recovery path back into sourcing.
  { from: 'EXCEPTION', event: 'resume_sourcing', to: 'SOURCING' },
];

export type TmsEvent =
  | 'accept_tender'
  | 'assign_carrier'
  | 'dispatch'
  | 'in_transit'
  | 'deliver'
  | 'bill_ready'
  | 'exception'
  | 'resume_sourcing';

export function applyTmsEvent(shipment: Shipment, event: TmsEvent, at: string, note?: string): ParseResult<Shipment> {
  return apply(TMS_EDGES, shipment, event, at, note);
}
export function tmsCan(from: Shipment['state'], event: TmsEvent): boolean {
  return canTransition(TMS_EDGES, from, event);
}
export function tmsNextState(from: Shipment['state'], event: TmsEvent) {
  return nextState(TMS_EDGES, from, event);
}
export function tmsLegalEvents(from: Shipment['state']): string[] {
  return legalEvents(TMS_EDGES, from);
}

/** Accept a tender from OMS: TENDERED → SOURCING (the OMS→TMS entry edge). */
export function acceptTender(shipment: Shipment, at: string): ParseResult<Shipment> {
  return applyTmsEvent(shipment, 'accept_tender', at);
}
