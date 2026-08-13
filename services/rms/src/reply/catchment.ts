/**
 * Sylectus carrier-reply catchment.
 *
 * Per Brett (Jun 18): carriers reply to Sylectus/DAT postings by email or phone,
 * NOT through the board. This links an inbound email back to the open shipment
 * it answers, by matching a load-id token in the subject/body against shipments
 * currently in Sourcing (BC RMS-W1: "Sylectus carrier-reply catchment").
 */
import { loadIdFromText, type InboundEmail } from '../../../adapters/src/index';

export interface OpenShipmentRef {
  shipmentId: string;
  loadId: string;
  status: string;
}

export type CatchmentResult =
  | { matched: true; loadId: string; shipmentId: string }
  | { matched: false; loadId: string | null; reason: 'no_load_id' | 'no_open_shipment' };

/** Match by load-id, case-insensitively, only against Sourcing shipments. */
export function linkReplyToShipment(email: InboundEmail, openShipments: OpenShipmentRef[]): CatchmentResult {
  const loadId = loadIdFromText(`${email.subject}\n${email.body}`);
  if (!loadId) return { matched: false, loadId: null, reason: 'no_load_id' };

  const wanted = loadId.toUpperCase();
  const hit = openShipments.find(
    (s) => s.status === 'Sourcing' && s.loadId.toUpperCase() === wanted,
  );
  if (!hit) return { matched: false, loadId, reason: 'no_open_shipment' };
  return { matched: true, loadId, shipmentId: hit.shipmentId };
}
