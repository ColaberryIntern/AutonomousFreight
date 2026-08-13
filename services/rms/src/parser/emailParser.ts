/**
 * W1 email parser — inbound email → canonical RFQ.
 *
 * Deterministic baseline: same email → same RFQ (idempotent), no clock/random.
 * Emits a contract-valid RFQ whose `rawExtraction` confidence + HITL routing
 * reflect how much it could actually extract, so low-confidence RFQs land in
 * AWAITING_HUMAN instead of silently flowing downstream.
 *
 * Two extraction front-ends share one assembler:
 *   - parseEmailToRfq: the deterministic regex baseline (tests, offline).
 *   - parseEmailToRfqFromFields: assembles the same RFQ from pre-extracted
 *     fields produced by an ExtractorEngine (Karun's D30 prompt through an LLM;
 *     his D32 makes the LLM extractor the production path).
 * Everything downstream of extraction (confidence, D4/D6/D7/D8/D14 evaluation,
 * canonical contract) is identical for both.
 */
import { EQUIPMENT_TYPES, parseRfq, type EquipmentType, type ParseResult, type Rfq } from '../schema/rfq.v1';
import { emailHash, type InboundEmail } from '../../../adapters/src/email/emailAdapter';
import { customerIdFromSeed, rfqIdFromSeed } from './ids';
import { detectLanguage, extractCommodity, extractEquipment, extractLane, extractPickupDate, extractWeightLb } from './extractors';
import { evaluateOpportunity, isAsapPhrasing, toCanonicalServiceTypes, type ValidatorDiagnostic } from '../evaluate/evaluateOpportunity';
import type { ExtractedFields } from '../extract/extractorEngine';

/** Penalty weights for missing critical fields (sum defines confidence). */
const PENALTY = { origin: 0.3, destination: 0.3, weight: 0.15, equipment: 0.1, pickupDate: 0.1 } as const;

/** Map Karun's D4 validator diagnostic to our HITL reason enum. */
function hitlReasonFor(diag: ValidatorDiagnostic): 'classification' | 'signal' | 'extraction' | 'validation' | 'none' {
  if (diag.mustHaveStatus === 'blocked') {
    return diag.blockReason === 'ambiguous_date' || diag.blockReason === 'date_out_of_bounds' ? 'validation' : 'extraction';
  }
  return diag.reviewRequired ? 'extraction' : 'none';
}

/** Pull a bare address out of a From header, tolerating "Name <addr>" form. */
function bareAddress(from: string): string | undefined {
  const m = from.match(/<([^>]+)>/);
  const addr = (m ? m[1]! : from).trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr) ? addr : undefined;
}

function companyFromEmail(from: string): string {
  const domain = (bareAddress(from) ?? from).split('@')[1];
  if (!domain) return 'Unknown Shipper';
  const root = domain.split('.')[0] ?? domain;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

/** Structural place shape both extraction front-ends produce. */
interface LoosePlace {
  city?: string;
  state?: string;
  country?: string;
}

function toLocation(p: LoosePlace | undefined): { city?: string; state?: string; country: string } {
  const loc: { city?: string; state?: string; country: string } = { country: p?.country ?? 'US' };
  if (p?.city) loc.city = p.city;
  if (p?.state) loc.state = p.state;
  return loc;
}

export interface ParsedRfq {
  rfq: Rfq;
  emailHash: string;
  needsHumanReview: boolean;
}

/** The extracted pieces the assembler consumes, however they were produced. */
interface ExtractionPieces {
  origin: LoosePlace | undefined;
  destination: LoosePlace | undefined;
  equipment: EquipmentType | undefined;
  weightLb: number | undefined;
  pickupDate: string | undefined;
  commodity: string;
  language: 'en' | 'es';
}

/**
 * Assemble the canonical RFQ from extracted pieces: confidence scoring, Karun's
 * deterministic D-rules (D4/D6/D7/D8/D14) for HITL routing + service types, and
 * the strict contract validation. Shared by both extraction front-ends.
 */
function assembleRfq(email: InboundEmail, p: ExtractionPieces): ParseResult<ParsedRfq> {
  const text = `${email.subject}\n${email.body}`;
  const hash = emailHash(email);
  const fromAddr = bareAddress(email.from);

  let confidence = 1;
  if (!p.origin) confidence -= PENALTY.origin;
  if (!p.destination) confidence -= PENALTY.destination;
  if (p.weightLb === undefined) confidence -= PENALTY.weight;
  if (!p.equipment) confidence -= PENALTY.equipment;
  if (!p.pickupDate) confidence -= PENALTY.pickupDate;
  confidence = Math.max(0, Math.round(confidence * 100) / 100);

  // Evaluate Opportunity - Karun's deterministic D-rules (D4/D6/D7/D8/D14) run
  // over the extracted fields to route HITL and infer the service-type list.
  const opp = evaluateOpportunity({
    pickup: toLocation(p.origin),
    delivery: toLocation(p.destination),
    vehicleStated: !!p.equipment,
    freightStated: p.weightLb !== undefined || !!p.equipment,
    receivedAtIso: email.receivedAt,
    isAsapPhrasing: isAsapPhrasing(text),
    ...(p.equipment ? { equipmentType: p.equipment } : {}),
    ...(p.weightLb !== undefined ? { weightLb: p.weightLb } : {}),
    ...(p.pickupDate ? { pickupDateTimeIso: `${p.pickupDate}T00:00:00Z` } : {}),
  });
  const serviceTypes = toCanonicalServiceTypes(opp.serviceTypes);
  const needsHumanReview = opp.needsHumanReview;
  const hitlReason = hitlReasonFor(opp.diagnostic);
  const status = opp.routedStatus;

  const pickupStop = {
    sequence: 1,
    stopType: 'pickup' as const,
    location: toLocation(p.origin),
    ...(p.pickupDate ? { timing: { windows: [{ date: p.pickupDate }] } } : {}),
  };
  const deliveryStop = { sequence: 2, stopType: 'delivery' as const, location: toLocation(p.destination) };

  const candidate = {
    rfqId: rfqIdFromSeed(hash),
    schemaVersion: '1.0' as const,
    source: {
      channel: 'email' as const,
      messageId: email.messageId,
      receivedAt: email.receivedAt,
    },
    customer: {
      customerId: customerIdFromSeed(email.from),
      companyName: companyFromEmail(email.from),
      contacts: [{ role: 'primary' as const, name: email.from, ...(fromAddr ? { email: fromAddr } : {}) }],
    },
    shipment: {
      mode: 'FTL' as const,
      stops: [pickupStop, deliveryStop],
      commodities: [{ description: p.commodity, weightLb: p.weightLb ?? 1 }],
      equipmentOptions: [{ equipmentType: p.equipment ?? opp.vehicle.equipmentType }],
    },
    language: p.language,
    serviceTypes,
    rawExtraction: {
      overallConfidence: confidence,
      needsHumanReview,
      hitlReason,
    },
    status: status as Rfq['status'],
    createdAt: email.receivedAt,
  };

  const parsed = parseRfq(candidate);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  return { ok: true, value: { rfq: parsed.value, emailHash: hash, needsHumanReview } };
}

/**
 * Parse an inbound email into a canonical RFQ using the deterministic regex
 * extractors. Returns a typed error only if the assembled payload fails the
 * contract (a defensive invariant, not the normal low-confidence path — low
 * confidence routes to AWAITING_HUMAN, still valid).
 */
export function parseEmailToRfq(email: InboundEmail): ParseResult<ParsedRfq> {
  const text = `${email.subject}\n${email.body}`;
  const lane = extractLane(text);
  return assembleRfq(email, {
    origin: lane.origin,
    destination: lane.destination,
    equipment: extractEquipment(text),
    weightLb: extractWeightLb(text),
    pickupDate: extractPickupDate(text),
    commodity: extractCommodity(text),
    language: detectLanguage(text),
  });
}

/**
 * Assemble the canonical RFQ from pre-extracted fields (the ExtractorEngine
 * path: Karun's D30 prompt through an injected LLM). Field values are validated
 * defensively because they originate from a model, not a regex: unknown
 * equipment falls back to D5 vehicle inference, malformed weight/date are
 * dropped (and scored as missing by the confidence penalties).
 */
export function parseEmailToRfqFromFields(email: InboundEmail, fields: ExtractedFields): ParseResult<ParsedRfq> {
  const text = `${email.subject}\n${email.body}`;

  const toPlace = (x?: { city?: string; state?: string; country?: string }): LoosePlace | undefined => {
    if (!x) return undefined;
    const p: LoosePlace = {};
    if (x.city && String(x.city).trim()) p.city = String(x.city).trim();
    if (x.state && String(x.state).trim()) p.state = String(x.state).trim().toUpperCase();
    if (x.country && String(x.country).trim()) p.country = String(x.country).trim().toUpperCase();
    return p.city || p.state ? p : undefined;
  };

  const rawEquip = fields.equipmentType ? String(fields.equipmentType).trim().toUpperCase().replace(/[\s-]+/g, '_') : undefined;
  const exact = rawEquip && (EQUIPMENT_TYPES as readonly string[]).includes(rawEquip) ? (rawEquip as EquipmentType) : undefined;
  const fuzzy = !exact && rawEquip ? (EQUIPMENT_TYPES as readonly string[]).find((e) => rawEquip.includes(e)) as EquipmentType | undefined : undefined;
  const equipment = exact ?? fuzzy;

  const weightLb = typeof fields.weightLb === 'number' && Number.isFinite(fields.weightLb) && fields.weightLb > 0
    ? Math.round(fields.weightLb) : undefined;
  // Karun's 14-day sanity bound (his prompt defers this re-check downstream):
  // a model-produced date must sit between the email's receipt date and receipt
  // + 14 days, else it is dropped as hallucinated or stale. Deterministic: uses
  // the email's receivedAt, never the wall clock.
  const pickupDate = (() => {
    if (typeof fields.pickupDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fields.pickupDate)) return undefined;
    const received = Date.parse(`${email.receivedAt.slice(0, 10)}T00:00:00Z`);
    const candidate = Date.parse(`${fields.pickupDate}T00:00:00Z`);
    if (Number.isNaN(received) || Number.isNaN(candidate)) return undefined;
    const days = (candidate - received) / 86400000;
    return days >= 0 && days <= 14 ? fields.pickupDate : undefined;
  })();
  const commodity = typeof fields.commodity === 'string' && fields.commodity.trim() ? fields.commodity.trim() : 'General freight';
  const language: 'en' | 'es' = fields.language === 'es' ? 'es' : fields.language === 'en' ? 'en' : detectLanguage(text);

  return assembleRfq(email, {
    origin: toPlace(fields.origin),
    destination: toPlace(fields.destination),
    equipment,
    weightLb,
    pickupDate,
    commodity,
    language,
  });
}
