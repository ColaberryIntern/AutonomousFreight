/**
 * Sense Layer — base adapter contract.
 *
 * "Own the brain, rent the senses." The OMS/TMS core only ever talks to these
 * typed contracts, never a vendor SDK or a scraped page directly. Each adapter
 * declares a stable operations interface; concrete *engines* implement it
 * (e.g. DAT `browser-in-session` now, DAT `paid-api` later). Swapping the
 * engine must not touch a single line of core code (BC: "Adapter: Contract
 * pattern enforcement across all 5 adapters").
 *
 * Every operation returns an AdapterResult, never throws across the boundary,
 * and every error is classified per the CLAUDE.md Observability Framework so
 * the caller's retry policy is driven by category, not by string-matching.
 */

/** Error categories drive retry behavior (CLAUDE.md Observability Framework). */
export type ErrorCategory = 'transient' | 'validation' | 'auth' | 'external_api' | 'internal_bug';

/** Only transient + external_api are retryable; the rest are terminal. */
export const RETRYABLE: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>(['transient', 'external_api']);

export interface AdapterError {
  category: ErrorCategory;
  message: string;
  /** Vendor/engine-specific detail, safe to log. Never contains secrets. */
  detail?: string;
}

export type AdapterResult<T> =
  | { ok: true; value: T; meta: OpMeta }
  | { ok: false; error: AdapterError; meta: OpMeta };

/** Per-operation observability envelope. correlationId is non-negotiable. */
export interface OpMeta {
  adapter: string;
  engine: string;
  operation: string;
  correlationId: string;
  startedAt: string;
  durationMs: number;
}

export type HealthState = 'up' | 'degraded' | 'down';
export interface HealthStatus {
  state: HealthState;
  engine: string;
  detail?: string;
}

/**
 * Base interface every adapter engine satisfies. `kind` is the vendor domain
 * (dat/fmcsa/sylectus/email); `engine` is the concrete implementation label.
 */
export interface AdapterEngine {
  readonly kind: string;
  readonly engine: string;
  health(): Promise<HealthStatus>;
}

export function isRetryable(error: AdapterError): boolean {
  return RETRYABLE.has(error.category);
}

/** True if a category should be retried given how many attempts already ran. */
export function shouldRetry(error: AdapterError, attempt: number, maxAttempts: number): boolean {
  return isRetryable(error) && attempt < maxAttempts;
}

export function ok<T>(value: T, meta: OpMeta): AdapterResult<T> {
  return { ok: true, value, meta };
}

export function err<T>(error: AdapterError, meta: OpMeta): AdapterResult<T> {
  return { ok: false, error, meta };
}

/** Deterministic correlation id derived from inputs (no clock/random needed). */
export function correlationId(adapter: string, operation: string, seed: string): string {
  let h = 2166136261;
  const s = `${adapter}:${operation}:${seed}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${adapter}-${operation}-${(h >>> 0).toString(16).padStart(8, '0')}`;
}
