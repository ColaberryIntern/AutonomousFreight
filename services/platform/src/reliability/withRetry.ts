export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  isRetryable?: (err: unknown) => boolean;
  onAttemptFailed?: (attempt: number, err: unknown) => void;
}

export const DEFAULT_RETRY: Required<Pick<RetryOptions, 'attempts' | 'baseDelayMs'>> = {
  attempts: 2,
  baseDelayMs: 100,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn` with exponential-backoff retry. Used for transient failures
 * on read-only paths (DB connection blips, upstream timeouts).
 *
 * - `attempts` is the total number of tries (1 = no retry).
 * - Backoff: baseDelayMs, baseDelayMs*2, baseDelayMs*4, ...
 * - `isRetryable` lets callers opt out of retrying logical errors
 *   (e.g. constraint violations, 4xx). Defaults to retrying everything.
 * - Throws the last error if all attempts fail.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const attempts = Math.max(1, opts.attempts);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = opts.isRetryable ? opts.isRetryable(err) : true;
      if (!retryable || i === attempts - 1) {
        throw err;
      }
      opts.onAttemptFailed?.(i + 1, err);
      await delay(opts.baseDelayMs * 2 ** i);
    }
  }
  throw lastErr;
}
