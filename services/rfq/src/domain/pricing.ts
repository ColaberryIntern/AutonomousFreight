export type EquipmentType = 'dry_van' | 'reefer' | 'flatbed';

export const BASE_PER_MILE: Record<EquipmentType, number> = {
  dry_van: 2.1,
  reefer: 2.85,
  flatbed: 2.55,
};

export const ACCESSORIAL_FLAT = 75;
export const CONFIDENCE_AUTO_SEND_THRESHOLD = 0.85;

export interface PricingInput {
  distanceMiles: number;
  equipmentType: EquipmentType;
}

export interface PricingResult {
  priceUsd: number;
  confidence: number;
}

/** Pure pricing function per directive 200. Same input → same output. */
export function priceRfq(input: PricingInput): PricingResult {
  const base = BASE_PER_MILE[input.equipmentType];
  const priceRaw = base * input.distanceMiles + ACCESSORIAL_FLAT;
  const priceUsd = Math.round(priceRaw * 100) / 100;

  // Confidence peaks at 800-mile loads, drops linearly with distance from that.
  const distanceDelta = Math.abs(input.distanceMiles - 800);
  const rawConfidence = 1 - distanceDelta / 2000;
  const confidence = Math.max(0.5, Math.min(0.99, Math.round(rawConfidence * 100) / 100));

  return { priceUsd, confidence };
}

export function isAutoSendable(confidence: number): boolean {
  return confidence >= CONFIDENCE_AUTO_SEND_THRESHOLD;
}

export function isKnownEquipment(s: string): s is EquipmentType {
  return s === 'dry_van' || s === 'reefer' || s === 'flatbed';
}
