/**
 * RMS → OMS handoff.
 *
 * Turns a canonical RFQ (from RMS) into a canonical shipment record in RECEIVED
 * state. Idempotent, deduped by email hash (CLAUDE.md: "Inserting the same row
 * twice is a violation"): the shipment id is derived from the same email hash,
 * so re-running the handoff for one email returns the existing shipment rather
 * than creating a second.
 */
import type { Rfq } from '../../rms/src/schema/rfq.v1';
import { shipmentIdFromSeed } from './ids';
import type { Shipment } from './schema/shipment.v1';
import { parseShipment } from './schema/shipment.v1';

export interface ShipmentStore {
  getByEmailHash(emailHash: string): Promise<Shipment | null>;
  getById(shipmentId: string): Promise<Shipment | null>;
  save(shipment: Shipment): Promise<void>;
}

export class InMemoryShipmentStore implements ShipmentStore {
  private readonly byId = new Map<string, Shipment>();
  private readonly byHash = new Map<string, string>();
  async getByEmailHash(emailHash: string): Promise<Shipment | null> {
    const id = this.byHash.get(emailHash);
    return id ? (this.byId.get(id) ?? null) : null;
  }
  async getById(shipmentId: string): Promise<Shipment | null> {
    return this.byId.get(shipmentId) ?? null;
  }
  async save(shipment: Shipment): Promise<void> {
    this.byId.set(shipment.shipmentId, shipment);
    this.byHash.set(shipment.emailHash, shipment.shipmentId);
  }
  get size(): number {
    return this.byId.size;
  }
}

function firstWindowDate(rfq: Rfq, stopType: 'pickup' | 'delivery'): string | undefined {
  const ordered = [...rfq.shipment.stops].sort((a, b) => a.sequence - b.sequence);
  const stop = stopType === 'pickup' ? ordered[0] : ordered[ordered.length - 1];
  return stop?.timing?.windows?.[0]?.date;
}

function toPlace(loc: { city?: string | undefined; state?: string | undefined; country: string }): { city?: string; state?: string; country: string } {
  const p: { city?: string; state?: string; country: string } = { country: loc.country };
  if (loc.city) p.city = loc.city;
  if (loc.state) p.state = loc.state;
  return p;
}

/** Pure mapping RFQ → shipment (RECEIVED). Deterministic: no clock, no random. */
export function buildShipmentFromRfq(rfq: Rfq, emailHash: string): Shipment {
  const ordered = [...rfq.shipment.stops].sort((a, b) => a.sequence - b.sequence);
  const origin = ordered[0]!.location;
  const destination = ordered[ordered.length - 1]!.location;
  const pickupDate = firstWindowDate(rfq, 'pickup');
  const deliveryDate = firstWindowDate(rfq, 'delivery');

  const shipment: Shipment = {
    shipmentId: shipmentIdFromSeed(emailHash),
    rfqId: rfq.rfqId,
    emailHash,
    customer: { customerId: rfq.customer.customerId, companyName: rfq.customer.companyName },
    lane: { origin: toPlace(origin), destination: toPlace(destination) },
    mode: rfq.shipment.mode,
    equipmentType: rfq.shipment.equipmentOptions[0]!.equipmentType,
    totalWeightLb: rfq.shipment.commodities.reduce((sum, c) => sum + c.weightLb, 0),
    commoditySummary: rfq.shipment.commodities.map((c) => c.description).join(', '),
    ...(pickupDate ? { pickupDate } : {}),
    ...(deliveryDate ? { deliveryDate } : {}),
    state: 'RECEIVED',
    economics: {},
    audit: [{ from: null, to: 'RECEIVED', event: 'ingest', at: rfq.createdAt }],
    createdAt: rfq.createdAt,
  };
  return shipment;
}

export type HandoffResult =
  | { status: 'created'; shipment: Shipment }
  | { status: 'duplicate'; shipment: Shipment }
  | { status: 'invalid'; errors: string[] };

/** Idempotent handoff. Second call for the same email hash returns duplicate. */
export async function handoffRmsToOms(rfq: Rfq, emailHash: string, store: ShipmentStore): Promise<HandoffResult> {
  const existing = await store.getByEmailHash(emailHash);
  if (existing) return { status: 'duplicate', shipment: existing };

  const candidate = buildShipmentFromRfq(rfq, emailHash);
  const validated = parseShipment(candidate);
  if (!validated.ok) return { status: 'invalid', errors: validated.errors };

  await store.save(validated.value);
  return { status: 'created', shipment: validated.value };
}
