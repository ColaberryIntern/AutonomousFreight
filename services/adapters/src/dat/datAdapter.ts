/**
 * DAT adapter — the highest-value sense.
 *
 * Per Brett (Jun 18): capacity (truck availability) was missing and is now
 * first-class; competitor-load ingest is dropped. Phase-1 engine is
 * `browser-in-session` (operator-attached, no autonomous login — ToS-safe);
 * a `paid-api` engine can be swapped in later without touching the core.
 *
 * The core imports only `DatEngine` + the domain types below. Both the real
 * browser engine and the mock engine implement `DatEngine`.
 */
import type { AdapterEngine, AdapterResult } from '../contract';

/** Canonical equipment → DAT board equipment code. */
export const DAT_EQUIPMENT: Record<string, string> = {
  VAN: 'V',
  REEFER: 'R',
  FLATBED: 'F',
  CARGO_VAN: 'V',
  SPRINTER: 'V',
  CUBE_VAN: 'SB',
  STRAIGHT_TRUCK: 'SB',
  INTERMODAL: 'V',
  OTHER: 'V',
};

export interface DatPlace {
  city?: string;
  state?: string;
  country?: string;
}
export interface DatLane {
  origin: DatPlace;
  destination: DatPlace;
  equipmentCode: string;
}

/** Minimal stop shape the adapter needs — decouples DAT from the full RFQ. */
export interface MinimalStop {
  sequence: number;
  stopType: 'pickup' | 'delivery';
  location: DatPlace;
}

/**
 * Flatten a plural canonical route to DAT's single-origin/single-destination
 * shape: first stop (by sequence) → origin, last stop → destination.
 */
export function laneFromStops(stops: MinimalStop[], equipmentType: string): DatLane {
  if (stops.length < 2) throw new Error('laneFromStops requires at least 2 stops');
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const origin = ordered[0]!.location;
  const destination = ordered[ordered.length - 1]!.location;
  return { origin, destination, equipmentCode: DAT_EQUIPMENT[equipmentType] ?? 'V' };
}

export interface LaneRate {
  lane: DatLane;
  avgRatePerMile: number;
  lowRatePerMile: number;
  highRatePerMile: number;
  distanceMiles: number;
  confidence: number;
  observedAt: string;
}

export interface TruckCapacity {
  carrierName: string;
  mcNumber?: string;
  equipmentCode: string;
  originCity?: string;
  originState?: string;
  availableDate: string;
  contact?: string;
}

export interface LoadPosting {
  origin: DatPlace;
  destination: DatPlace;
  equipmentCode: string;
  pickupDate: string;
  weightLb?: number;
  rateOfferUsd?: number;
  reference: string;
}

export interface PostResult {
  postingId: string;
  reference: string;
}

/** The stable operations contract. Engines implement exactly this. */
export interface DatEngine extends AdapterEngine {
  readonly kind: 'dat';
  getLaneRate(lane: DatLane, correlationSeed: string): Promise<AdapterResult<LaneRate>>;
  searchCapacity(lane: DatLane, pickupDate: string, correlationSeed: string): Promise<AdapterResult<TruckCapacity[]>>;
  postLoad(load: LoadPosting, correlationSeed: string): Promise<AdapterResult<PostResult>>;
}
