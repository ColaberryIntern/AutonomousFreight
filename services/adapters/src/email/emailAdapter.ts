/**
 * Email adapter — the entry point for RMS and the catchment for Sylectus
 * carrier replies (which arrive by email, not through Sylectus).
 *
 * This is the adapter CONTRACT side (the typed interface the rest of the system
 * depends on). The concrete ingest (webhook + parse) lives in the RMS layer.
 *
 * Sending is an outbound communication; per CLAUDE.md it needs Ali sign-off, so
 * `send()` is on the contract but a real engine must gate it. The mock supports
 * it for tests only.
 */
import { createHash } from 'crypto';
import type { AdapterEngine, AdapterResult } from '../contract';

export interface InboundEmail {
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  receivedAt: string;
  hasAttachments?: boolean;
}

export interface OutboundEmail {
  to: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
}
export interface SendResult {
  providerMessageId: string;
}

/**
 * Idempotency key for an inbound email. Deterministic: prefers the channel
 * messageId; falls back to from+subject+body so a message with no id still
 * dedupes. Per CLAUDE.md: "Sending the same email twice is a violation."
 *
 * Uses a 128-bit SHA-256 prefix, NOT a folded 32-bit hash: this value is the
 * dedup key, so a collision would silently drop a distinct customer RFQ. 32 bits
 * collides at ~1% by ~9k emails; 128 bits is collision-free at any real volume.
 */
export function emailHash(email: Pick<InboundEmail, 'messageId' | 'from' | 'subject' | 'body'>): string {
  const seed = email.messageId && email.messageId.length > 0 ? email.messageId : `${email.from}|${email.subject}|${email.body}`;
  return `email_${createHash('sha256').update(seed).digest('hex').slice(0, 32)}`;
}

export interface EmailEngine extends AdapterEngine {
  readonly kind: 'email';
  fetchInbound(correlationSeed: string): Promise<AdapterResult<InboundEmail[]>>;
  /** Gated: real engines must require sign-off before sending outbound mail. */
  send(email: OutboundEmail, correlationSeed: string): Promise<AdapterResult<SendResult>>;
}
