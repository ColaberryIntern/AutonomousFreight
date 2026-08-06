/**
 * POD ingestion + matching (BMS trigger).
 *
 * POD (proof of delivery) is what triggers billing. Multiple ingest paths:
 * email attachment, driver-app upload, EDI 990. This module validates a POD and
 * matches it to the shipment it proves, by load reference. Design refined by
 * Brett's Jun 25 walkthrough (BC BMS-Back: POD ingestion design).
 */

export type PodSource = 'email' | 'driver_app' | 'edi_990';

export interface PodDocument {
  ref: string;
  source: PodSource;
  loadReference?: string;
  signed: boolean;
  legible: boolean;
  receivedAt: string;
}

export interface PodValidation {
  valid: boolean;
  issues: string[];
}

/** A POD is billable only if it is signed, legible, and carries a load ref. */
export function validatePod(pod: PodDocument): PodValidation {
  const issues: string[] = [];
  if (!pod.signed) issues.push('POD is not signed');
  if (!pod.legible) issues.push('POD is not legible');
  if (!pod.loadReference) issues.push('POD has no load reference to match');
  return { valid: issues.length === 0, issues };
}

export interface BillableShipmentRef {
  shipmentId: string;
  loadReference: string;
  state: string;
}

export type PodMatch =
  | { matched: true; shipmentId: string; validation: PodValidation }
  | { matched: false; reason: 'invalid_pod' | 'no_matching_shipment' | 'shipment_not_billable'; validation: PodValidation };

const BILLABLE_STATES = new Set(['IN_TRANSIT', 'DELIVERED', 'BILL_READY']);

/**
 * Match a POD to a shipment. Requires the POD to validate, the load reference
 * to match an existing shipment, and that shipment to be in a billable state.
 */
export function matchPod(pod: PodDocument, shipments: BillableShipmentRef[]): PodMatch {
  const validation = validatePod(pod);
  if (!validation.valid) return { matched: false, reason: 'invalid_pod', validation };

  const wanted = pod.loadReference!.toUpperCase();
  const hit = shipments.find((s) => s.loadReference.toUpperCase() === wanted);
  if (!hit) return { matched: false, reason: 'no_matching_shipment', validation };
  if (!BILLABLE_STATES.has(hit.state)) return { matched: false, reason: 'shipment_not_billable', validation };
  return { matched: true, shipmentId: hit.shipmentId, validation };
}
