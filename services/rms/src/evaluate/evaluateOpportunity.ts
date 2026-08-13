/**
 * Evaluate Opportunity - deterministic port of Karun's D1-D33 design baseline
 * (docs/QUOTING_REQUIREMENTS_SOURCE_OF_TRUTH.md, LOCKED 2026-05-12).
 *
 * This is the DETERMINISTIC brain of Karun's design: it runs on already-extracted
 * structured fields and produces the validator diagnostic, urgency bucket, and
 * service-type matches. The free-text extraction (his Gemini ReAct agent; D3/D30/
 * D32) is a separate, pluggable engine and is NOT reimplemented here.
 *
 * Each rule cites the decision it implements (D#) so it traces back to his doc.
 */
import { selectVehicle, type Dims, type VehicleSelection } from './vehicleSelect';

// ---- constants, verbatim from the D-rules -------------------------------
export const EXPEDITE_MAX_HOURS = 8; // D8: < 8h => ASAP
export const SAME_DAY_MAX_HOURS = 24; // D8: 8-24h => SAME_DAY
export const PARTIAL_MAX_WEIGHT_LB = 20000; // D6 Partial
export const PARTIAL_MIN_DAYS = 6; // D6 Partial: >= 6 days pickup->delivery
export const LINEAR_INCHES_MAX = 288; // D6 Partial + ELTL: < 288 linear inches
export const ELTL_MAX_WEIGHT_LB = 12000; // D6 ELTL
export const DATE_SANITY_DAYS = 14; // D9/D26: pickup within 14 days
/** D6 `**` rule: Expedite Exclusive is gated on these vehicle sizes (slide 7). */
export const EXPEDITE_EXCLUSIVE_VEHICLES = new Set(['CARGO_VAN', 'SPRINTER', 'CUBE_VAN', 'STRAIGHT_TRUCK']);
/** D8 ASAP phrasing (locale-aware, EN + ES). */
export const ASAP_KEYWORDS = ['asap', 'urgent', 'right away', 'right now', 'today', 'ahora', 'urgente'];
/** D15: these special-req tokens are signature-noise and need zone dedup. */
export const SIGNATURE_VULNERABLE = new Set(['CSA', 'TSA', 'FAST']);

export type UrgencyBucket = 'ASAP' | 'SAME_DAY' | 'STANDARD' | 'UNKNOWN';
export type ServiceType = 'TL' | 'ELTL' | 'EXP_SOLO' | 'EXP_TEAM' | 'EXPEDITE_EXCLUSIVE' | 'PARTIAL';
export type FieldSource = 'from_email' | 'from_fallback_dims_weight' | 'from_fallback_vehicle' | 'from_fallback_ftl' | 'missing';
export type MustHaveStatus = 'complete' | 'filled_with_fallbacks' | 'blocked';
export type BlockReason =
  | 'missing_location'
  | 'single_geo_point'
  | 'link_or_attachment_only'
  | 'ambiguous_date'
  | 'date_out_of_bounds'
  | 'tl_manual_flag'
  | null;

/** D31: service-type output is a list of structured matches, not a single string. */
export interface ServiceTypeMatch {
  type: ServiceType;
  confidence: number;
  firingRuleCited: string;
  source: 'from_email' | 'from_inference';
}

export interface LocationLike {
  city?: string | undefined;
  state?: string | undefined;
  postalCode?: string | undefined;
  country?: string | undefined;
}

export interface EvalInput {
  /** Ordered stops (>= pickup + delivery). Each validated per D7/D16. */
  pickup: LocationLike;
  delivery: LocationLike;
  extraStops?: LocationLike[];
  weightLb?: number | undefined;
  linearInches?: number | undefined;
  dims?: Dims | undefined;
  equipmentType?: string | undefined;
  vehicleStated?: boolean;
  /** True if any of weight / dims / vehicle was stated (D4 data-point-5). */
  freightStated?: boolean;
  pickupDateTimeIso?: string | undefined;
  deliveryDateIso?: string | undefined;
  receivedAtIso: string;
  isAsapPhrasing?: boolean;
  linkOrAttachmentOnly?: boolean;
}

export interface ValidatorDiagnostic {
  mustHaveStatus: MustHaveStatus;
  blockReason: BlockReason;
  reviewRequired: boolean;
  perField: { pickupLocation: FieldSource; deliveryLocation: FieldSource; freight: FieldSource };
  assumptions: string[];
}

export interface Opportunity {
  urgency: UrgencyBucket;
  hoursUntilPickup: number | null;
  /** D5: resolved vehicle (stated or inferred from Karun's fleet). */
  vehicle: VehicleSelection;
  serviceTypes: ServiceTypeMatch[];
  diagnostic: ValidatorDiagnostic;
  routedStatus: 'NEW' | 'AWAITING_HUMAN';
  needsHumanReview: boolean;
}

// ---- D7: location grammar ------------------------------------------------
/** D7: a location is present iff (city AND state) OR zip. Country-only fails. */
export function hasLocation(loc: LocationLike): boolean {
  return (!!loc.city && !!loc.state) || !!loc.postalCode;
}

// ---- D8: urgency bucket --------------------------------------------------
export function isAsapPhrasing(text: string): boolean {
  const t = text.toLowerCase();
  return ASAP_KEYWORDS.some((k) => t.includes(k));
}

/** D8: 8h / 24h thresholds off (parsedPickup - receivedAt), or phrasing. */
export function urgencyBucket(input: Pick<EvalInput, 'pickupDateTimeIso' | 'receivedAtIso' | 'isAsapPhrasing'>): {
  bucket: UrgencyBucket;
  hoursUntilPickup: number | null;
} {
  let hours: number | null = null;
  if (input.pickupDateTimeIso) {
    const pu = Date.parse(input.pickupDateTimeIso);
    const rec = Date.parse(input.receivedAtIso);
    if (!Number.isNaN(pu) && !Number.isNaN(rec)) hours = Math.max(0, (pu - rec) / 3_600_000);
  }
  if (input.isAsapPhrasing) return { bucket: 'ASAP', hoursUntilPickup: hours };
  if (hours === null) return { bucket: 'UNKNOWN', hoursUntilPickup: null };
  if (hours < EXPEDITE_MAX_HOURS) return { bucket: 'ASAP', hoursUntilPickup: hours };
  if (hours < SAME_DAY_MAX_HOURS) return { bucket: 'SAME_DAY', hoursUntilPickup: hours };
  return { bucket: 'STANDARD', hoursUntilPickup: hours };
}

// ---- D6: service-type inference (the six determination rules) -------------
function daysBetween(aIso?: string, bIso?: string): number | null {
  if (!aIso || !bIso) return null;
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / 86_400_000;
}

/**
 * D6: infer service types deterministically from the post-fallback fields.
 * Returns a D31-shaped list. Cascade per D6: (dims+weight -> vehicle) already
 * resolved upstream; urgency (D8) gates the expedite family. Multiple matches
 * are intentional (slide-6 pairing), never a conflict.
 */
export function inferServiceTypes(input: EvalInput, urgency: UrgencyBucket, effectiveEquipment?: string): ServiceTypeMatch[] {
  const out: ServiceTypeMatch[] = [];
  const expediteSignal = urgency === 'ASAP' || urgency === 'SAME_DAY';
  const linearOk = input.linearInches === undefined || input.linearInches < LINEAR_INCHES_MAX;
  const days = daysBetween(input.pickupDateTimeIso, input.deliveryDateIso);
  const eq = effectiveEquipment ?? input.equipmentType;

  // Exp Solo / Exp Team (`*`): stated tight timing (proxy: ASAP/SAME_DAY urgency).
  if (expediteSignal) {
    out.push({ type: 'EXP_SOLO', confidence: 0.8, firingRuleCited: 'stated_tight_times_vs_45mph', source: 'from_inference' });
    out.push({ type: 'EXP_TEAM', confidence: 0.75, firingRuleCited: 'stated_tight_times_vs_45mph', source: 'from_inference' });
    // Expedite Exclusive (`**`): `*` rule AND vehicle in the small-vehicle set.
    if (eq && EXPEDITE_EXCLUSIVE_VEHICLES.has(eq)) {
      out.push({ type: 'EXPEDITE_EXCLUSIVE', confidence: 0.85, firingRuleCited: 'expedite_plus_small_vehicle', source: 'from_inference' });
    }
  }

  // Partial (`***`): FTL/53' AND >= 6 days AND < 288 linear inches AND < 20000 lbs.
  const ftlish = eq === 'VAN' || eq === undefined;
  if (ftlish && days !== null && days >= PARTIAL_MIN_DAYS && linearOk && (input.weightLb === undefined || input.weightLb < PARTIAL_MAX_WEIGHT_LB)) {
    out.push({ type: 'PARTIAL', confidence: 0.7, firingRuleCited: 'ftl_and_6day_and_lt288in_and_lt20000lb', source: 'from_inference' });
  }

  // ELTL (`****`): < 12000 lbs AND < 288 linear inches (geographic-region gate approximated).
  if (input.weightLb !== undefined && input.weightLb < ELTL_MAX_WEIGHT_LB && linearOk) {
    out.push({ type: 'ELTL', confidence: 0.7, firingRuleCited: 'lt12000lb_and_lt288in', source: 'from_inference' });
  }

  // TL (`*****`): always a candidate but manual-flagged for now (slide 6).
  out.push({ type: 'TL', confidence: 0.6, firingRuleCited: 'tl_manual_flag', source: 'from_inference' });

  return out.sort((a, b) => b.confidence - a.confidence);
}

// ---- D4: validator diagnostic (hard-block vs soft-fill) ------------------
/**
 * D4: the validator is a diagnostic, not a binary gate. Hard-block routes to
 * HITL/missing-data; soft-fill records assumptions without blocking. Data-point-5
 * special rule: freight entirely absent => FTL default AND review_required.
 */
export function validateDetails(input: EvalInput): ValidatorDiagnostic {
  const assumptions: string[] = [];
  const pickupPresent = hasLocation(input.pickup);
  const deliveryPresent = hasLocation(input.delivery);
  const anyStopPresent = pickupPresent || deliveryPresent || (input.extraStops ?? []).some(hasLocation);

  const perField: ValidatorDiagnostic['perField'] = {
    pickupLocation: pickupPresent ? 'from_email' : 'missing',
    deliveryLocation: deliveryPresent ? 'from_email' : 'missing',
    freight: input.freightStated ? 'from_email' : 'from_fallback_ftl',
  };

  // Hard-block reasons (D4 rail a).
  let blockReason: BlockReason = null;
  if (input.linkOrAttachmentOnly) blockReason = 'link_or_attachment_only';
  else if (!pickupPresent && !deliveryPresent && anyStopPresent) blockReason = 'single_geo_point';
  else if (!pickupPresent || !deliveryPresent) blockReason = 'missing_location';
  // Date out of sanity bounds (D9/D26).
  else if (input.pickupDateTimeIso) {
    const pu = Date.parse(input.pickupDateTimeIso);
    const rec = Date.parse(input.receivedAtIso);
    if (!Number.isNaN(pu) && !Number.isNaN(rec)) {
      if (pu < rec - 86_400_000) blockReason = 'ambiguous_date'; // past date
      else if (pu > rec + DATE_SANITY_DAYS * 86_400_000) blockReason = 'date_out_of_bounds';
    }
  }

  if (blockReason) {
    return { mustHaveStatus: 'blocked', blockReason, reviewRequired: true, perField, assumptions };
  }

  // Soft-fill (D4 rail b) + data-point-5 special rule.
  let reviewRequired = false;
  if (!input.freightStated) {
    assumptions.push('freight defaulted to FTL (no weight/dims/vehicle provided)'); // D4 data-point-5
    reviewRequired = true;
  }
  if (!input.vehicleStated && input.freightStated) {
    assumptions.push("vehicle defaulted to 53' Dry Van (no vehicle declared)"); // D4 soft-fill
  }

  const mustHaveStatus: MustHaveStatus = assumptions.length > 0 ? 'filled_with_fallbacks' : 'complete';
  return { mustHaveStatus, blockReason: null, reviewRequired, perField, assumptions };
}

// ---- D14: route the diagnostic to a lifecycle status ---------------------
/** D14: map must_have_status + block_reason to our RFQ status + HITL flag. */
export function routeState(diag: ValidatorDiagnostic): { status: 'NEW' | 'AWAITING_HUMAN'; needsHumanReview: boolean } {
  if (diag.mustHaveStatus === 'blocked') {
    // tl_manual_flag would still quote (NEW); all other blocks await a human.
    if (diag.blockReason === 'tl_manual_flag') return { status: 'NEW', needsHumanReview: true };
    return { status: 'AWAITING_HUMAN', needsHumanReview: true };
  }
  return { status: 'NEW', needsHumanReview: diag.reviewRequired };
}

// ---- top-level orchestration --------------------------------------------
/** Run the deterministic Evaluate-Opportunity stage over extracted fields. */
export function evaluateOpportunity(input: EvalInput): Opportunity {
  const { bucket, hoursUntilPickup } = urgencyBucket(input);
  // D5: resolve the vehicle first (Karun's fleet), so D6's Expedite-Exclusive
  // gate can see an inferred small vehicle even when none was stated.
  const vehicle: VehicleSelection =
    input.vehicleStated && input.equipmentType
      ? { vehicle: input.equipmentType, equipmentType: input.equipmentType as VehicleSelection['equipmentType'], source: 'from_email' }
      : selectVehicle({ weightLb: input.weightLb, dims: input.dims });
  const diagnostic = validateDetails(input);
  const serviceTypes = inferServiceTypes(input, bucket, vehicle.equipmentType);
  const routed = routeState(diagnostic);
  return {
    urgency: bucket,
    hoursUntilPickup,
    vehicle,
    serviceTypes,
    diagnostic,
    routedStatus: routed.status,
    needsHumanReview: routed.needsHumanReview,
  };
}

/** Map D6/D31 service types onto the canonical RFQ serviceTypes enum. */
export function toCanonicalServiceTypes(matches: ServiceTypeMatch[]): Array<'FTL' | 'LTL' | 'ELTL' | 'PARTIAL' | 'EXPEDITE_SOLO' | 'EXPEDITE_TEAM' | 'EXPEDITE_EXCLUSIVE'> {
  const map: Record<ServiceType, 'FTL' | 'LTL' | 'ELTL' | 'PARTIAL' | 'EXPEDITE_SOLO' | 'EXPEDITE_TEAM' | 'EXPEDITE_EXCLUSIVE'> = {
    TL: 'FTL',
    ELTL: 'ELTL',
    PARTIAL: 'PARTIAL',
    EXP_SOLO: 'EXPEDITE_SOLO',
    EXP_TEAM: 'EXPEDITE_TEAM',
    EXPEDITE_EXCLUSIVE: 'EXPEDITE_EXCLUSIVE',
  };
  const seen = new Set<string>();
  const out: Array<'FTL' | 'LTL' | 'ELTL' | 'PARTIAL' | 'EXPEDITE_SOLO' | 'EXPEDITE_TEAM' | 'EXPEDITE_EXCLUSIVE'> = [];
  for (const m of matches) {
    const c = map[m.type];
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}
