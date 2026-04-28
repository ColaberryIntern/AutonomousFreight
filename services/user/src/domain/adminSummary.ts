import type { Pool } from 'pg';
import { ALL_ROLES, type Role } from './rbac';

export interface AdminUserSummary {
  total: number;
  byRole: Record<Role, number>;
  mfaEnabled: number;
  mfaAdoptionPct: number;
  registeredLast7d: number;
}

export interface AdminAuditSummary {
  adminActionsLast24h: number;
  topActions: Array<{ action: string; count: number }>;
}

export interface AdminSummary {
  users: AdminUserSummary;
  audit: AdminAuditSummary;
  generatedAt: string;
}

const ADMIN_ACTION_PATTERNS: readonly string[] = [
  'user.consent.granted',
  'autonomy.level_changed',
  'gate.hard_blocked',
  'gate.soft_overridden',
  'auth.mfa.enrolled',
];

function emptyByRole(): Record<Role, number> {
  return ALL_ROLES.reduce(
    (acc, r) => {
      acc[r] = 0;
      return acc;
    },
    {} as Record<Role, number>,
  );
}

/**
 * Aggregate admin-dashboard KPIs in a single pass.
 * Pure compute over the same `pool` the rest of the user service uses;
 * no caching, no side effects.
 */
export async function computeAdminSummary(deps: { pool: Pool }): Promise<AdminSummary> {
  const { pool } = deps;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [totalRow, mfaRow, recentRow, byRoleRows, adminAuditRow, topActionsRows] = await Promise.all(
    [
      pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM users'),
      pool.query<{ c: string }>(
        'SELECT COUNT(*)::text AS c FROM users WHERE mfa_enabled = TRUE',
      ),
      pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM users WHERE created_at >= $1', [
        sevenDaysAgo,
      ]),
      pool.query<{ role_name: string; c: string }>(
        `SELECT role_name, COUNT(*)::text AS c
         FROM user_roles GROUP BY role_name`,
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM audit_log
         WHERE occurred_at >= $1 AND action = ANY($2::text[])`,
        [oneDayAgo, ADMIN_ACTION_PATTERNS],
      ),
      pool.query<{ action: string; c: string }>(
        `SELECT action, COUNT(*)::text AS c FROM audit_log
         WHERE occurred_at >= $1 AND action = ANY($2::text[])
         GROUP BY action
         ORDER BY COUNT(*) DESC
         LIMIT 5`,
        [oneDayAgo, ADMIN_ACTION_PATTERNS],
      ),
    ],
  );

  const total = Number(totalRow.rows[0]?.c ?? 0);
  const mfaEnabled = Number(mfaRow.rows[0]?.c ?? 0);
  const registeredLast7d = Number(recentRow.rows[0]?.c ?? 0);

  const byRole = emptyByRole();
  for (const row of byRoleRows.rows) {
    if ((ALL_ROLES as readonly string[]).includes(row.role_name)) {
      byRole[row.role_name as Role] = Number(row.c);
    }
  }

  const mfaAdoptionPct =
    total === 0 ? 0 : Math.round(((mfaEnabled / total) * 100 + Number.EPSILON) * 10) / 10;

  return {
    users: { total, byRole, mfaEnabled, mfaAdoptionPct, registeredLast7d },
    audit: {
      adminActionsLast24h: Number(adminAuditRow.rows[0]?.c ?? 0),
      topActions: topActionsRows.rows.map((row) => ({
        action: row.action,
        count: Number(row.c),
      })),
    },
    generatedAt: new Date().toISOString(),
  };
}

export { ADMIN_ACTION_PATTERNS };
