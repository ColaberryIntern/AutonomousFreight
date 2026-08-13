/**
 * Sylectus + Full Circle adapter — POST-ONLY UI rider.
 *
 * Jun 4: the API is broken for headless use. Jun 18 (Brett): carrier replies
 * come back by email or phone, NOT through Sylectus. So this adapter POSTS a
 * load via the attached UI session and READS posted loads + truck availability,
 * but deliberately has NO reply-handling surface. Carrier replies are caught by
 * the Email adapter and cross-linked by load id (see loadIdFromText).
 */
import type { AdapterEngine, AdapterResult } from '../contract';

export interface SylectusPosting {
  reference: string;
  origin: string;
  destination: string;
  equipment: string;
  pickupDate: string;
  miles?: number;
  weightLb?: number;
}
export interface SylectusPostResult {
  postingId: string;
  reference: string;
}
export interface SylectusTruck {
  carrierName: string;
  equipment: string;
  location: string;
  availableDate: string;
}

/**
 * Extract a load-id / reference token from free-text (an email subject/body) so
 * an out-of-band carrier reply can be linked back to the shipment it answers.
 * Recognizes AF-load ids and generic "Load #NNNN" / "Ref: XXX" patterns.
 */
export function loadIdFromText(text: string): string | null {
  const patterns = [
    // AF ids may contain internal hyphens (AF-INV-0099, AF-01JV9QX3).
    /\bAF-[A-Z0-9-]{2,}\b/i,
    /\bload\s*#?\s*([A-Z0-9-]{4,})/i,
    /\bref(?:erence)?\s*[:#]?\s*([A-Z0-9-]{4,})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return (m[1] ?? m[0]).toUpperCase();
  }
  return null;
}

export interface SylectusEngine extends AdapterEngine {
  readonly kind: 'sylectus';
  postLoad(posting: SylectusPosting, correlationSeed: string): Promise<AdapterResult<SylectusPostResult>>;
  readPostedLoads(correlationSeed: string): Promise<AdapterResult<SylectusPosting[]>>;
  readTruckAvailability(correlationSeed: string): Promise<AdapterResult<SylectusTruck[]>>;
  // NOTE: intentionally no readReplies() — replies do not return via Sylectus.
}
