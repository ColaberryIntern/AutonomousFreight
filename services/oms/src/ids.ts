/** Deterministic shp_ id generation (see rms/parser/ids.ts for rationale). */
import { createHash } from 'crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 26-char Crockford-base32 from SHA-256 bytes: full entropy, deterministic. */
export function deterministicUlid(seed: string): string {
  const bytes = createHash('sha256').update(seed).digest();
  let out = '';
  for (let i = 0; i < 26; i++) {
    out += CROCKFORD.charAt(bytes[i]! % 32);
  }
  return out;
}

/** Same email hash → same shipment id → idempotent handoff. */
export function shipmentIdFromSeed(seed: string): string {
  return `shp_${deterministicUlid('shp:' + seed)}`;
}
