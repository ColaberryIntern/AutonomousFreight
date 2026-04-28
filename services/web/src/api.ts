const API_URL =
  (import.meta as unknown as { env: { VITE_API_URL?: string } }).env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, `${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`);
  }
  return (await res.json()) as T;
}

export interface RetryOpts {
  attempts?: number;
  baseDelayMs?: number;
}

/**
 * Same contract as `api()`, but retries transient failures (network errors
 * + 5xx) once with backoff. 4xx is never retried so auth errors surface
 * immediately. Use on dashboard / read-only paths where flaky reads are
 * worth a second try.
 */
export async function apiWithRetry<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
  opts?: RetryOpts,
): Promise<T> {
  const attempts = Math.max(1, opts?.attempts ?? 2);
  const baseDelayMs = opts?.baseDelayMs ?? 500;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await api<T>(path, token, init);
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof ApiError ? err.status >= 500 : true;
      if (!retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
    }
  }
  throw lastErr;
}
