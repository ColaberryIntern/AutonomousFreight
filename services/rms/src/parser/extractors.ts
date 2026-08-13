/**
 * Deterministic field extractors for the W1 email parser.
 *
 * These are the pure, unit-testable pieces the parser composes. This is the
 * deterministic W1 baseline; Karun's D1-D33 (LLM/ML) parser is the intended
 * higher-fidelity replacement and slots in behind the same emailParser output
 * contract (BC RMS-W1: "Adopt Karun's D1-D33 parser as W1 baseline").
 */
import type { EquipmentType } from '../schema/rfq.v1';

export interface Place {
  city?: string;
  state?: string;
  country?: string;
}

const STATE = '([A-Z]{2,3})';
const CITY = '([A-Za-z .\\-]+?)';

/** Normalize a US/MX 2-3 letter state token to upper-case. */
function place(city: string | undefined, state: string | undefined): Place {
  const p: Place = { country: 'US' };
  if (city) p.city = city.trim();
  if (state) p.state = state.trim().toUpperCase();
  return p;
}

/**
 * Extract origin + destination from common phrasings:
 *  - "from Dallas, TX to Chicago, IL"
 *  - "Origin: Dallas, TX  Destination: Chicago, IL"
 *  - "pickup Dallas TX ... delivery Chicago IL"
 */
// Keywords are first-letter case-tolerant; the STATE token stays strictly
// upper-case (2-3 letters). We deliberately do NOT use the 'i' flag: with it,
// [A-Z]{2,3} would also match lower-case letters and could capture "ago" out of
// "Chicago" as the state and "Chic" as the city.
export function extractLane(text: string): { origin?: Place; destination?: Place } {
  const fromTo = new RegExp(`\\b[Ff]rom\\s+${CITY},?\\s*${STATE}\\s+[Tt]o\\s+${CITY},?\\s*${STATE}\\b`).exec(text);
  if (fromTo) {
    return { origin: place(fromTo[1], fromTo[2]), destination: place(fromTo[3], fromTo[4]) };
  }
  const originM = new RegExp(`\\b[Oo]rigin\\s*[:\\-]?\\s*${CITY},?\\s*${STATE}\\b`).exec(text);
  const destM = new RegExp(`\\b(?:[Dd]estination|[Dd]est)\\s*[:\\-]?\\s*${CITY},?\\s*${STATE}\\b`).exec(text);
  if (originM || destM) {
    const out: { origin?: Place; destination?: Place } = {};
    if (originM) out.origin = place(originM[1], originM[2]);
    if (destM) out.destination = place(destM[1], destM[2]);
    return out;
  }
  const puM = new RegExp(`\\b(?:[Pp]ickup|[Pp]ick up|PU)\\s*[:\\-]?\\s*${CITY},?\\s*${STATE}\\b`).exec(text);
  const delM = new RegExp(`\\b(?:[Dd]elivery|[Dd]eliver|[Dd]rop|DEL)\\s*[:\\-]?\\s*${CITY},?\\s*${STATE}\\b`).exec(text);
  const out: { origin?: Place; destination?: Place } = {};
  if (puM) out.origin = place(puM[1], puM[2]);
  if (delM) out.destination = place(delM[1], delM[2]);
  return out;
}

const EQUIPMENT_KEYWORDS: ReadonlyArray<readonly [RegExp, EquipmentType]> = [
  [/\breefer|refrigerated|temp[- ]?control/i, 'REEFER'],
  [/\bflat ?bed|flat\b/i, 'FLATBED'],
  [/\bsprinter\b/i, 'SPRINTER'],
  [/\bcargo ?van\b/i, 'CARGO_VAN'],
  [/\bcube ?van\b/i, 'CUBE_VAN'],
  [/\bstraight ?truck|26 ?ft/i, 'STRAIGHT_TRUCK'],
  [/\bdry ?van|van|53'?\b/i, 'VAN'],
];

export function extractEquipment(text: string): EquipmentType | undefined {
  for (const [re, type] of EQUIPMENT_KEYWORDS) {
    if (re.test(text)) return type;
  }
  return undefined;
}

/** Extract total weight in pounds (handles "42,000 lbs", "42000 pounds"). */
export function extractWeightLb(text: string): number | undefined {
  const m = /(\d[\d,]{1,9})\s*(?:lbs?|pounds?)\b/i.exec(text);
  if (!m || !m[1]) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Extract the first ISO date (YYYY-MM-DD) as the pickup date. */
export function extractPickupDate(text: string): string | undefined {
  const m = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  return m ? m[1] : undefined;
}

/** Extract a commodity description; falls back to a safe generic. */
export function extractCommodity(text: string): string {
  const m = /\b(?:commodity|goods|freight|product)\s*[:\-]\s*([A-Za-z0-9 ,.\-]{2,60})/i.exec(text);
  return m && m[1] ? m[1].trim() : 'General freight';
}

/** Very small ES detector — enough to set the reply-language field. */
export function detectLanguage(text: string): 'en' | 'es' {
  return /\b(recoger|entrega|carga|camion|origen|destino|peso)\b/i.test(text) ? 'es' : 'en';
}
