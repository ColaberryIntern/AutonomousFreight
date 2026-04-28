export interface AuditLogsQueryOpts {
  limit: number;
  offset: number;
  action?: string;
}

export const AUDIT_LOGS_DEFAULT_LIMIT = 50;
export const AUDIT_LOGS_MAX_LIMIT = 200;
const ACTION_RE = /^[a-z][a-z0-9._-]{0,99}$/i;

/**
 * Sanitize raw query params for GET /api/v1/audit/logs.
 * Soft-validation: invalid values fall back to defaults so existing
 * callers (multiple frontend pages) never break. Clamps `limit` into
 * [1, AUDIT_LOGS_MAX_LIMIT] to bound DB cost; rejects malformed
 * `action` filters by dropping them.
 */
export function parseAuditLogsQuery(raw: Record<string, unknown>): AuditLogsQueryOpts {
  const limitRaw = Number(raw['limit'] ?? AUDIT_LOGS_DEFAULT_LIMIT);
  const offsetRaw = Number(raw['offset'] ?? 0);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), AUDIT_LOGS_MAX_LIMIT)
      : AUDIT_LOGS_DEFAULT_LIMIT;
  const offset =
    Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;
  const opts: AuditLogsQueryOpts = { limit, offset };
  const actionRaw = raw['action'];
  if (typeof actionRaw === 'string' && ACTION_RE.test(actionRaw)) {
    opts.action = actionRaw;
  }
  return opts;
}
