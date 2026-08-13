/**
 * VENDORED from Karun's ShipCES_EmailParsing repo (read-only reuse; do NOT edit
 * upstream). Source: core/agents/prompts/extractor_fragments/{base,fragment_en_us,
 * fragment_es_mx}.txt.
 *
 * His D30 "base + locale fragment" extractor prompt, lifted verbatim. This is the
 * extraction brain we run our LLM extractor engine against so we reuse his
 * months of prompt work rather than re-deriving it. composePrompt() performs his
 * {{LOCALE_*}} substitution.
 */

/** base.txt - locale-agnostic instructions, verbatim. */
export const EXTRACTOR_BASE = `You are extracting structured shipment data from an RFQ email.

Locale-specific rules apply:
  Date format: {{LOCALE_DATE_FORMAT}}
  ASAP keywords: {{LOCALE_ASAP_KEYWORDS}}
  Vehicle aliases: {{LOCALE_VEHICLE_ALIASES}}

Schema (v2):
  - Route.pickups[] and Route.deliveries[] - multi-stop aware. Each Stop has
    location (city/state OR zip required), timing_window (TimingSentiment),
    and optional facility/contact/references.
  - Load[] per commodity with piece_count, weight_per_piece_lbs, dimensions.
  - CargoSummary aggregating per-Load values.
  - ServiceLevel with service_types: list[ServiceTypeMatch] (do NOT emit a
    scalar service_type - that field was deleted in v277).
  - special_requirements_v2[] - each SpecialRequirement with token, mention_zone
    (body|signature|subject), verbatim_excerpt, applies_to_opportunity.

Must-have detection:
  - Pickup location: (city AND state) OR zip. Same for delivery.
  - Pickup timing sentiment: required (a verbatim phrase or a parsed datetime).
  - Delivery timing sentiment: required (a verbatim phrase or a parsed datetime).
  - Freight unit / weight / dims: absence means FTL by default (set the FTL
    SpecialRequirement marker rather than blocking).

When a date is ambiguous (e.g., "05/06/2026" could be MM/DD or DD/MM), emit
your best interpretation under the locale rule above and set
TimingSentiment.parsed_datetime accordingly. The downstream date-disambiguation
utility re-checks with the 14-day sanity bound.

For ASAP detection, set TimingSentiment.is_asap = true when the sentiment_quote
contains any of: {{LOCALE_ASAP_KEYWORDS}}.

For Special Requirements: scan body, subject, AND signature. For CSA/TSA/FAST,
record mention_zone honestly - body-zone applies to the opportunity; signature-zone
is informational only (often appears in operator email signatures).`;

/** fragment_en_us.txt, verbatim (KEY=VALUE lines). */
export const FRAGMENT_EN_US = `LOCALE_DATE_FORMAT=MM/DD/YYYY (US format - month first)
LOCALE_ASAP_KEYWORDS="asap","urgent","right away","right now","today","now","rush","expedite","expedited","emergency"
LOCALE_VEHICLE_ALIASES=Cargo Van | Sprinter | Cube Van (Box truck, cube, small straight) | Straight Truck (Box Truck, Dock High, Dock High Straight, 22ft/24ft/26ft/20ft/18ft) | Dry Van | Reefer | Flatbed`;

/** fragment_es_mx.txt, verbatim (KEY=VALUE lines). */
export const FRAGMENT_ES_MX = `LOCALE_DATE_FORMAT=DD/MM/YYYY (Mexican format - day first)
LOCALE_ASAP_KEYWORDS="asap","ahora","urgente","ya","hoy","ahorita","urgent","right away","today"
LOCALE_VEHICLE_ALIASES=Cargo Van (Nissan, Van - NOT "Dry Van") | Sprinter (Nissan) | Cube Van (3.5, tres y media, Box truck, cube, small straight) | Straight Truck (Rabon, Box Truck, Dock High, 22ft/24ft/26ft/20ft/18ft) | Dry Van | Reefer`;

export type Locale = 'en-US' | 'es-MX';

function parseFragment(fragment: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of fragment.split('\n')) {
    const idx = raw.indexOf('=');
    if (idx > 0) out[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  }
  return out;
}

/** Compose his base prompt with the locale fragment (his D30 substitution). */
export function composePrompt(locale: Locale): string {
  const vars = parseFragment(locale === 'es-MX' ? FRAGMENT_ES_MX : FRAGMENT_EN_US);
  return EXTRACTOR_BASE.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? `{{${key}}}`);
}
