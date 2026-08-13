/**
 * Deterministic ULID-style id generation.
 *
 * We derive ids from the inbound email hash rather than the clock/randomness so
 * that re-processing the same email yields the SAME rfqId. That is the
 * idempotency guarantee the ingestion pipeline relies on (CLAUDE.md: "Inserting
 * the same row twice is a violation"). Crockford base32 alphabet (no I/L/O/U)
 * matches the RFQ_ID_PATTERN in the contract.
 */
import { createHash } from 'crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * 26-char Crockford-base32 string, fully determined by `seed`.
 * Derived from SHA-256 bytes (not a 32-bit-seeded PRNG): the id looks like a
 * 128-bit ULID and must carry that entropy, or two loads collide despite the
 * 26-char shape. Deterministic (same seed -> same id) for idempotency.
 */
export function deterministicUlid(seed: string): string {
  const bytes = createHash('sha256').update(seed).digest();
  let out = '';
  for (let i = 0; i < 26; i++) {
    out += CROCKFORD.charAt(bytes[i]! % 32);
  }
  return out;
}

export function rfqIdFromSeed(seed: string): string {
  return `rfq_${deterministicUlid(seed)}`;
}

export function customerIdFromSeed(seed: string): string {
  return `cust_${deterministicUlid('cust:' + seed)}`;
}
