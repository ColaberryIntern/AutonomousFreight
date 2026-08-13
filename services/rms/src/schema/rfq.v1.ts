/**
 * Canonical RFQ Payload (DAT-compatible) v1 — Zod contract.
 *
 * This is THE keystone contract for the ShipCES Autonomous Brokerage forward
 * track. It is the runtime + type-level realization of
 * `docs/dat-rfq-payload-schema.json` (JSON Schema Draft 2020-12). Every RMS/OMS
 * producer and consumer depends on this module; downstream work is "built on
 * sand" until the RFQ payload is a typed contract (BC RMS-W1).
 *
 * Design notes:
 *  - Plural-by-default: stops[], commodities[], equipmentOptions[], contacts[],
 *    windows[], serviceTypes[]. Nothing that can legitimately repeat is singular.
 *  - `.strict()` everywhere mirrors `additionalProperties: false` in the JSON
 *    Schema, so silent producer/consumer drift fails validation, not silently.
 *  - Format validators are refine-based (not zod's evolving string-format API)
 *    so the contract compiles deterministically across zod minor versions.
 *  - CLAUDE.md Contract Enforcement Layer: "No untyped inputs at module
 *    boundaries. `any` is never a contract." parseRfq() is the only sanctioned
 *    entry point; it returns a typed value or a typed error, never `any`.
 */
import { z } from 'zod';

// --- deterministic format validators (version-stable) ---------------------
const isoDateTime = z
  .string()
  .refine((s) => /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s)), {
    message: 'must be an ISO 8601 date-time',
  });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO 8601 date (YYYY-MM-DD)');
const email = z.string().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'must be an email address');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM (24h)');

export const RFQ_ID_PATTERN = /^rfq_[0-9A-HJKMNP-TV-Z]{26}$/;

// --- enums (single source of truth, re-exported for consumers) ------------
export const CHANNELS = ['email', 'whatsapp', 'api_superprocure', 'telegram', 'sms', 'manual', 'api_other'] as const;
export const SHIPMENT_MODES = ['FTL', 'LTL', 'ELTL', 'PARTIAL', 'EXPEDITE_SOLO', 'EXPEDITE_TEAM', 'EXPEDITE_EXCLUSIVE', 'INTERMODAL'] as const;
export const SERVICE_TYPES = ['FTL', 'LTL', 'ELTL', 'PARTIAL', 'EXPEDITE_SOLO', 'EXPEDITE_TEAM', 'EXPEDITE_EXCLUSIVE'] as const;
export const EQUIPMENT_TYPES = ['VAN', 'REEFER', 'FLATBED', 'CARGO_VAN', 'SPRINTER', 'CUBE_VAN', 'STRAIGHT_TRUCK', 'INTERMODAL', 'OTHER'] as const;
export const SPECIAL_REQUIREMENTS = ['TEAM_DRIVER', 'LIFTGATE', 'TWIC', 'TSA', 'FAST', 'HAZMAT', 'BLOCKING_BRACING', 'INSIDE_DELIVERY', 'TARP', 'ESCORT'] as const;
export const CONTACT_ROLES = ['primary', 'dispatcher', 'ap', 'ops', 'shipper', 'consignee', 'other'] as const;
export const STOP_TYPES = ['pickup', 'delivery'] as const;
export const TIMING_SENTIMENTS = ['asap', 'direct', 'ready_at', 'deliver_by', 'window', 'tbd'] as const;
export const RFQ_STATUSES = ['NEW', 'VALIDATING', 'AWAITING_HUMAN', 'QUOTING', 'QUOTED', 'AWARDED', 'CONVERTED', 'DECLINED', 'EXPIRED', 'EXCEPTION'] as const;
export const HITL_REASONS = ['classification', 'signal', 'extraction', 'validation', 'none'] as const;

// --- leaf schemas ---------------------------------------------------------
const GeoSchema = z.object({ lat: z.number(), lng: z.number() }).strict();

const ContactSchema = z
  .object({
    role: z.enum(CONTACT_ROLES),
    name: z.string().min(1),
    email: email.optional(),
    phone: z.string().optional(),
  })
  .strict();

const LocationSchema = z
  .object({
    facilityName: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().min(2),
    geo: GeoSchema.optional(),
  })
  .strict();

const TimingWindowSchema = z
  .object({
    date: isoDate,
    timeStart: hhmm.optional(),
    timeEnd: hhmm.optional(),
    timezone: z.string().optional(),
    sentiment: z.enum(TIMING_SENTIMENTS).optional(),
  })
  .strict();

const TimingSchema = z
  .object({
    appointmentRequired: z.boolean().optional(),
    windows: z.array(TimingWindowSchema).min(1).optional(),
  })
  .strict();

const StopSchema = z
  .object({
    sequence: z.number().int().min(1),
    stopType: z.enum(STOP_TYPES),
    location: LocationSchema,
    timing: TimingSchema.optional(),
    instructions: z.string().optional(),
    stopContacts: z.array(ContactSchema).optional(),
  })
  .strict();

const CommoditySchema = z
  .object({
    description: z.string().min(1),
    weightLb: z.number().min(0),
    palletCount: z.number().int().min(0).optional(),
    pieces: z.number().int().min(0).optional(),
    dimensions: z
      .object({ lengthIn: z.number(), widthIn: z.number(), heightIn: z.number() })
      .partial()
      .strict()
      .optional(),
    stackable: z.boolean().optional(),
    hazmat: z
      .object({ isHazmat: z.boolean().optional(), unNumber: z.string().optional(), class: z.string().optional(), packingGroup: z.string().optional() })
      .strict()
      .optional(),
    temperatureControl: z
      .object({ required: z.boolean().optional(), minF: z.number().optional(), maxF: z.number().optional() })
      .strict()
      .optional(),
    highValue: z.boolean().optional(),
    originStopSequence: z.number().int().optional(),
    destinationStopSequence: z.number().int().optional(),
  })
  .strict();

const EquipmentOptionSchema = z
  .object({
    equipmentType: z.enum(EQUIPMENT_TYPES),
    vehicleSize: z.string().optional(),
    specialRequirements: z.array(z.enum(SPECIAL_REQUIREMENTS)).optional(),
    insuranceMinimum: z.number().optional(),
  })
  .strict();

const SourceSchema = z
  .object({
    channel: z.enum(CHANNELS),
    messageId: z.string().optional(),
    receivedAt: isoDateTime,
    rawRef: z.string().optional(),
  })
  .strict();

const CustomerSchema = z
  .object({
    customerId: z.string().min(1),
    companyName: z.string().min(1),
    contacts: z.array(ContactSchema).min(1).optional(),
  })
  .strict();

const ShipmentSchema = z
  .object({
    mode: z.enum(SHIPMENT_MODES),
    stops: z.array(StopSchema).min(2),
    commodities: z.array(CommoditySchema).min(1),
    equipmentOptions: z.array(EquipmentOptionSchema).min(1),
  })
  .strict();

const PricingRequestSchema = z
  .object({
    currency: z.string().optional(),
    targetRate: z.number().optional(),
    fuelIncluded: z.boolean().optional(),
    marginFloorOverride: z.number().optional(),
    requestedBy: z.enum(['customer', 'broker', 'internal_automation']).optional(),
  })
  .strict();

const CustomerRulesSchema = z
  .object({
    isBoardEmail: z.boolean().optional(),
    kpiDriven: z.boolean().optional(),
    fuelSurchargeConfig: z
      .object({ model: z.enum(['FLAT', 'PERCENT', 'INDEX_LINKED']).optional(), value: z.number().optional() })
      .strict()
      .optional(),
    appointmentsRequired: z.boolean().optional(),
    premiumPricing: z.boolean().optional(),
    competitionCount: z.number().int().min(0).optional(),
  })
  .strict();

const RawExtractionSchema = z
  .object({
    overallConfidence: z.number().min(0).max(1).optional(),
    fieldConfidence: z.record(z.string(), z.number().min(0).max(1)).optional(),
    needsHumanReview: z.boolean().optional(),
    hitlReason: z.enum(HITL_REASONS).optional(),
  })
  .strict();

// --- top-level canonical RFQ ---------------------------------------------
export const RfqSchema = z
  .object({
    rfqId: z.string().regex(RFQ_ID_PATTERN, 'must be a ULID-prefixed rfq id'),
    schemaVersion: z.literal('1.0').optional(),
    source: SourceSchema,
    customer: CustomerSchema,
    shipment: ShipmentSchema,
    serviceTypes: z.array(z.enum(SERVICE_TYPES)).min(1).optional(),
    pricingRequest: PricingRequestSchema.optional(),
    customerRules: CustomerRulesSchema.optional(),
    language: z.enum(['en', 'es']).optional(),
    rawExtraction: RawExtractionSchema.optional(),
    status: z.enum(RFQ_STATUSES),
    createdAt: isoDateTime,
    updatedAt: isoDateTime.optional(),
  })
  .strict()
  // Route sanity, checked BY SEQUENCE (not array order), because every consumer
  // (handoff, laneFromStops, DAT flatten) orders stops by `sequence`. Validating
  // array position instead would let a producer whose array order disagrees with
  // sequence order flip origin and destination past the contract.
  .refine((rfq) => firstStopBySequence(rfq.shipment.stops)?.stopType === 'pickup', {
    message: 'first stop by sequence must be a pickup',
    path: ['shipment', 'stops'],
  })
  .refine((rfq) => lastStopBySequence(rfq.shipment.stops)?.stopType === 'delivery', {
    message: 'last stop by sequence must be a delivery',
    path: ['shipment', 'stops'],
  });

function firstStopBySequence<T extends { sequence: number }>(stops: T[]): T | undefined {
  return [...stops].sort((a, b) => a.sequence - b.sequence)[0];
}
function lastStopBySequence<T extends { sequence: number }>(stops: T[]): T | undefined {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  return ordered[ordered.length - 1];
}

export type Rfq = z.infer<typeof RfqSchema>;
export type RfqStatus = (typeof RFQ_STATUSES)[number];
export type Channel = (typeof CHANNELS)[number];
export type ShipmentMode = (typeof SHIPMENT_MODES)[number];
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

/** Typed parse result. Contract violation surfaces as data, never a throw. */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Sanctioned entry point. Returns a typed RFQ or a flat list of error strings. */
export function parseRfq(input: unknown): ParseResult<Rfq> {
  const r = RfqSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}

/** Convenience guard for call sites that only need a boolean. */
export function isRfq(input: unknown): input is Rfq {
  return RfqSchema.safeParse(input).success;
}
