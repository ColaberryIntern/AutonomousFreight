/**
 * OMS state machine — the order-management slice of the lifecycle.
 *
 * RECEIVED → PARSED → PRICED → QUOTE_SENT → WON/LOST → TENDERED. Every
 * transition is logged (BC OMS: "Every transition logged"). TENDERED is the
 * OMS→TMS handoff point (Won/Tendered triggers TMS). A pre-terminal shipment can
 * always be flagged EXCEPTION.
 */
import type { Edge } from './fsm';
import { applyEvent as apply, canTransition, legalEvents, nextState } from './fsm';
import type { ParseResult, Shipment } from './schema/shipment.v1';

export const OMS_EDGES: readonly Edge[] = [
  { from: 'RECEIVED', event: 'parse', to: 'PARSED' },
  { from: 'PARSED', event: 'price', to: 'PRICED' },
  { from: 'PRICED', event: 'send_quote', to: 'QUOTE_SENT' },
  { from: 'QUOTE_SENT', event: 'win', to: 'WON' },
  { from: 'QUOTE_SENT', event: 'lose', to: 'LOST' },
  { from: 'WON', event: 'tender', to: 'TENDERED' },
  // Exception is reachable from any active OMS state.
  { from: 'RECEIVED', event: 'exception', to: 'EXCEPTION' },
  { from: 'PARSED', event: 'exception', to: 'EXCEPTION' },
  { from: 'PRICED', event: 'exception', to: 'EXCEPTION' },
  { from: 'QUOTE_SENT', event: 'exception', to: 'EXCEPTION' },
  { from: 'WON', event: 'exception', to: 'EXCEPTION' },
  // Recovery from an OMS-phase exception: re-triage from the top. This is the
  // OMS counterpart to the TMS `resume_sourcing` edge; without it an exception
  // raised before tender would be a dead-end (use this one for OMS-phase
  // exceptions, resume_sourcing only for TMS-phase ones).
  { from: 'EXCEPTION', event: 'reopen', to: 'RECEIVED' },
];

export type OmsEvent = 'parse' | 'price' | 'send_quote' | 'win' | 'lose' | 'tender' | 'exception' | 'reopen';

export function applyOmsEvent(shipment: Shipment, event: OmsEvent, at: string, note?: string): ParseResult<Shipment> {
  return apply(OMS_EDGES, shipment, event, at, note);
}

export function omsNextState(from: Shipment['state'], event: OmsEvent) {
  return nextState(OMS_EDGES, from, event);
}
export function omsCan(from: Shipment['state'], event: OmsEvent): boolean {
  return canTransition(OMS_EDGES, from, event);
}
export function omsLegalEvents(from: Shipment['state']): string[] {
  return legalEvents(OMS_EDGES, from);
}
