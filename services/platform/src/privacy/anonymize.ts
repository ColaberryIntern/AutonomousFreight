const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /\+?1?[-.]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

/**
 * Replaces PII patterns (emails, phone numbers, SSNs) with redacted placeholders.
 * Pure function — no side effects.
 */
export function anonymize(text: string): string {
  return text
    .replace(EMAIL_RE, '[EMAIL_REDACTED]')
    .replace(SSN_RE, '[SSN_REDACTED]')
    .replace(PHONE_RE, '[PHONE_REDACTED]');
}

/**
 * Masks a string, showing only the first `visible` characters.
 * Example: maskField("john@example.com", 3) → "joh***"
 */
export function maskField(value: string, visible = 3): string {
  if (value.length <= visible) return '*'.repeat(value.length);
  return value.slice(0, visible) + '***';
}

/**
 * Anonymizes specific fields in an object by key name.
 * Keys matching `sensitiveKeys` have their values masked.
 */
export function anonymizeRecord(
  record: Record<string, unknown>,
  sensitiveKeys: string[] = ['email', 'phone', 'ssn', 'name'],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && sensitiveKeys.includes(key.toLowerCase())) {
      out[key] = maskField(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
