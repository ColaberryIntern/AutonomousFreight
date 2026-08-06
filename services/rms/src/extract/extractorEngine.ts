/**
 * Extractor engine contract - the swappable front-end of RMS.
 *
 * The deterministic regex parser (services/rms/src/parser) is the default engine
 * used in tests and offline. The LlmExtractorEngine below runs Karun's vendored
 * extractor prompt against an injected LLM client (Claude in production), so his
 * months of extraction work become our production extractor with no downstream
 * changes: both engines produce the same ExtractedFields shape.
 */
import type { InboundEmail } from '../../../adapters/src/email/emailAdapter';
import type { EquipmentType } from '../schema/rfq.v1';
import { composePrompt, type Locale } from '../vendor/karun/extractorPrompt';

export interface ExtractedPlace {
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/** The structured output both engines produce; the parser assembles the RFQ from it. */
export interface ExtractedFields {
  origin?: ExtractedPlace;
  destination?: ExtractedPlace;
  equipmentType?: EquipmentType;
  weightLb?: number;
  commodity?: string;
  pickupDate?: string;
  language?: 'en' | 'es';
}

export type ExtractResult = { ok: true; fields: ExtractedFields } | { ok: false; errors: string[] };

export interface ExtractorEngine {
  readonly engine: string;
  extract(email: InboundEmail): Promise<ExtractResult>;
}

/** Injected LLM. In production this wraps the Anthropic client (Claude). */
export interface LlmClient {
  complete(system: string, user: string): Promise<string>;
}

/**
 * Output contract appended to Karun's vendored prompt. His base prompt (kept
 * verbatim) describes his rich v2 extraction schema but not a return format;
 * this pins the RESPONSE to the flat ExtractedFields shape this engine parses.
 * His multi-stop / multi-load detail collapses to first pickup, last delivery,
 * and aggregate weight.
 */
export const OUTPUT_CONTRACT = `Respond with ONLY one JSON object and no other text, using exactly these keys (omit any key you cannot determine):
{
  "origin":      { "city": "...", "state": "XX", "country": "US or MX" },
  "destination": { "city": "...", "state": "XX", "country": "US or MX" },
  "equipmentType": "one of: CARGO_VAN, SPRINTER, CUBE_VAN, STRAIGHT_TRUCK, VAN, REEFER, FLATBED, INTERMODAL, OTHER (map vehicle aliases per the rules above)",
  "weightLb": 12345,
  "commodity": "short description of the freight",
  "pickupDate": "YYYY-MM-DD",
  "language": "en or es"
}
Notes: origin is the FIRST pickup and destination is the LAST delivery. weightLb is the TOTAL shipment weight in pounds (sum all loads; convert from kg if needed). Include pickupDate ONLY when an explicit calendar date appears in the email; NEVER infer or invent one (weekday words like "thursday" are not a date). Do not wrap the JSON in markdown fences.`;

/** Pull the first JSON object out of an LLM response (tolerates prose/fences). */
export function extractJsonBlock(raw: string): string | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return start >= 0 && end > start ? raw.slice(start, end + 1) : null;
}

/**
 * Runs Karun's vendored extractor prompt against the injected LLM. The prompt is
 * his (composePrompt); the model is ours (Claude). Deterministic parts (JSON
 * extraction, field mapping) are unit-tested with a mock client - no live call.
 */
export class LlmExtractorEngine implements ExtractorEngine {
  readonly engine = 'karun-prompt-llm';
  constructor(
    private readonly llm: LlmClient,
    private readonly locale: Locale = 'en-US',
  ) {}

  async extract(email: InboundEmail): Promise<ExtractResult> {
    const system = `${composePrompt(this.locale)}\n\n${OUTPUT_CONTRACT}`;
    const user = `Subject: ${email.subject}\n\nFrom: ${email.from}\n\n${email.body}`;
    let raw: string;
    try {
      raw = await this.llm.complete(system, user);
    } catch (e) {
      return { ok: false, errors: [`extractor LLM error: ${(e as Error).message}`] };
    }
    const json = extractJsonBlock(raw);
    if (!json) return { ok: false, errors: ['extractor returned no JSON object'] };
    try {
      return { ok: true, fields: JSON.parse(json) as ExtractedFields };
    } catch {
      return { ok: false, errors: ['extractor returned unparseable JSON'] };
    }
  }
}
