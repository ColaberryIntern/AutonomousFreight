/**
 * Canonical shipment record (v1) — the single source of truth for a load.
 *
 * One record per load, walked through the lifecycle state machine, every
 * transition audited (BC OMS: "The OMS holds the single source of truth"). The
 * record spans the whole lifecycle (OMS → TMS → BMS handoff points); each layer
 * owns transitions within its own state subset.
 */
import { z } from 'zod';
import { EQUIPMENT_TYPES, RFQ_ID_PATTERN, SHIPMENT_MODES } from '../../../rms/src/schema/rfq.v1';

export const SHIPMENT_ID_PATTERN = /^shp_[0-9A-HJKMNP-TV-Z]{26}$/;

/** Full lifecycle. OMS owns RECEIVED..TENDERED; TMS owns SOURCING..DELIVERED/EXCEPTION; BMS owns BILL_READY..INVOICED. */
export const LIFECYCLE_STATES = [
  'RECEIVED', 'PARSED', 'PRICED', 'QUOTE_SENT', 'WON', 'LOST', 'TENDERED',
  'SOURCING', 'CARRIER_ASSIGNED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION',
  'BILL_READY', 'INVOICED',
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

const isoDateTime = z.string().refine((s) => /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s)), 'ISO date-time');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO date');

const PlaceSchema = z
  .object({ city: z.string().optional(), state: z.string().optional(), country: z.string().min(2) })
  .strict();

const TransitionSchema = z
  .object({
    from: z.enum(LIFECYCLE_STATES).nullable(),
    to: z.enum(LIFECYCLE_STATES),
    event: z.string().min(1),
    at: isoDateTime,
    note: z.string().optional(),
  })
  .strict();
export type Transition = z.infer<typeof TransitionSchema>;

export const ShipmentSchema = z
  .object({
    shipmentId: z.string().regex(SHIPMENT_ID_PATTERN, 'ULID-prefixed shipment id'),
    rfqId: z.string().regex(RFQ_ID_PATTERN),
    /** Idempotency link back to the inbound email that created this shipment. */
    emailHash: z.string().min(1),
    customer: z.object({ customerId: z.string().min(1), companyName: z.string().min(1) }).strict(),
    lane: z.object({ origin: PlaceSchema, destination: PlaceSchema }).strict(),
    mode: z.enum(SHIPMENT_MODES),
    equipmentType: z.enum(EQUIPMENT_TYPES),
    totalWeightLb: z.number().min(0),
    commoditySummary: z.string().min(1),
    pickupDate: isoDate.optional(),
    deliveryDate: isoDate.optional(),
    state: z.enum(LIFECYCLE_STATES),
    economics: z
      .object({ sellRateUsd: z.number().optional(), buyRateUsd: z.number().optional(), marginPct: z.number().optional() })
      .strict(),
    assignedCarrier: z
      .object({ name: z.string(), mcNumber: z.string().optional(), dotNumber: z.string().optional() })
      .strict()
      .optional(),
    /** Set at the Delivered→BMS handoff; the Bill-Ready record id BMS consumes. */
    billReadyRef: z.string().optional(),
    audit: z.array(TransitionSchema),
    createdAt: isoDateTime,
    updatedAt: isoDateTime.optional(),
  })
  .strict();

export type Shipment = z.infer<typeof ShipmentSchema>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function parseShipment(input: unknown): ParseResult<Shipment> {
  const r = ShipmentSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}
