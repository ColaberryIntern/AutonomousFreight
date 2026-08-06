/**
 * RMS ingestion pipeline: inbound email → (dedup) → parse → canonical RFQ, with
 * a dead-letter path for parse failures.
 *
 * Idempotency (NON-NEGOTIABLE, CLAUDE.md): the same email ingested twice yields
 * exactly one RFQ; the second call returns `duplicate` with the original rfqId.
 * Retry-safe: a mid-run failure leaves no partial RFQ, and a parse failure is
 * dead-lettered for replay rather than lost.
 */
import { parseEmailToRfq, type ParsedRfq } from '../parser/emailParser';
import { emailHash, type InboundEmail } from '../../../adapters/src/email/emailAdapter';
import type { ParseResult, Rfq } from '../schema/rfq.v1';
import type { DeadLetterStore, IdempotencyStore } from './stores';

export interface IngestDeps {
  idempotency: IdempotencyStore;
  deadLetter: DeadLetterStore;
  /**
   * Injectable extraction front-end; defaults to the deterministic W1 email
   * parser. May be async (the LLM extractor path, D30/D32).
   */
  parse?: (email: InboundEmail) => ParseResult<ParsedRfq> | Promise<ParseResult<ParsedRfq>>;
}

export type IngestOutcome =
  | { status: 'accepted'; emailHash: string; rfqId: string; rfq: Rfq; needsHumanReview: boolean }
  | { status: 'duplicate'; emailHash: string; rfqId: string }
  | { status: 'dead_letter'; emailHash: string; reason: string; errors: string[] };

export async function ingestEmail(email: InboundEmail, deps: IngestDeps): Promise<IngestOutcome> {
  const hash = emailHash(email);

  const existing = await deps.idempotency.has(hash);
  if (existing.seen && existing.rfqId) {
    return { status: 'duplicate', emailHash: hash, rfqId: existing.rfqId };
  }

  const parsed = await (deps.parse ?? parseEmailToRfq)(email);
  if (!parsed.ok) {
    await deps.deadLetter.add({
      emailHash: hash,
      from: email.from,
      subject: email.subject,
      receivedAt: email.receivedAt,
      errors: parsed.errors,
    });
    return { status: 'dead_letter', emailHash: hash, reason: 'parse_failed', errors: parsed.errors };
  }

  await deps.idempotency.mark(hash, parsed.value.rfq.rfqId);
  return {
    status: 'accepted',
    emailHash: hash,
    rfqId: parsed.value.rfq.rfqId,
    rfq: parsed.value.rfq,
    needsHumanReview: parsed.value.needsHumanReview,
  };
}
