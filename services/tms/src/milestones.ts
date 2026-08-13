/**
 * Milestone tracking (EDI 214 alignment).
 *
 * Per Brett (Jun 18): "EDI 214 is all TMS stuff. It's just milestones and
 * tracking updates." We capture standard 214 status codes and map the
 * state-changing ones to lifecycle events; informational ones (e.g. arrived at
 * delivery) are logged to the audit trail without a state change. A future real
 * EDI 214 feed is a thin adapter on top of recordMilestone().
 */
import type { Shipment } from '../../oms/src/schema/shipment.v1';
import { applyTmsEvent, type TmsEvent } from './stateMachine';

/** EDI 214 status code → human label. */
export const EDI_214_CODES: Record<string, string> = {
  X3: 'Arrived at Pickup',
  AF: 'Carrier Departed Pickup (loaded)',
  X1: 'Arrived at Delivery',
  D1: 'Completed Delivery (POD)',
  AG: 'Estimated Delivery',
  A9: 'Shipment Delayed',
};

/** Which 214 codes drive a state change (others are informational). */
const CODE_TO_EVENT: Record<string, TmsEvent | undefined> = {
  X3: 'dispatch', // arrived at pickup → carrier is executing
  AF: 'in_transit', // departed pickup loaded → in transit
  D1: 'deliver', // POD → delivered
  A9: 'exception', // delay severe enough to flag
};

export type MilestoneResult =
  | { ok: true; shipment: Shipment; stateChanged: boolean; label: string }
  | { ok: false; errors: string[] };

/**
 * Record an EDI 214 milestone. State-changing codes apply the mapped event;
 * informational codes append an audit entry (from == to) without moving state.
 * Unknown codes are a validation error, never silently ignored.
 */
export function recordMilestone(shipment: Shipment, code: string, at: string): MilestoneResult {
  const label = EDI_214_CODES[code];
  if (!label) return { ok: false, errors: [`unknown EDI 214 code: ${code}`] };

  const event = CODE_TO_EVENT[code];
  if (event) {
    const moved = applyTmsEvent(shipment, event, at, `214:${code} ${label}`);
    if (!moved.ok) return { ok: false, errors: moved.errors };
    return { ok: true, shipment: moved.value, stateChanged: true, label };
  }

  // Informational milestone: log without a state change.
  const info = { from: shipment.state, to: shipment.state, event: `milestone:${code}`, at, note: label };
  return { ok: true, shipment: { ...shipment, updatedAt: at, audit: [...shipment.audit, info] }, stateChanged: false, label };
}
