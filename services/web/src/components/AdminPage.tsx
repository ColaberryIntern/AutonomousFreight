import React, { useCallback, useEffect, useState } from 'react';
import { api, apiWithRetry } from '../api';
import { colors, pill, relativeTime, styles } from '../styles';
import type { AdminUser } from '../types';

interface Props {
  token: string;
}

interface AdminSummary {
  users: {
    total: number;
    byRole: Record<string, number>;
    mfaEnabled: number;
    mfaAdoptionPct: number;
    registeredLast7d: number;
  };
  audit: {
    adminActionsLast24h: number;
    topActions: Array<{ action: string; count: number }>;
  };
  generatedAt: string;
}

export function AdminPage({ token }: Props): React.ReactElement {
  const [items, setItems] = useState<AdminUser[] | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [healthCheckedAt, setHealthCheckedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const goto = useCallback((path: string): void => {
    window.location.hash = path;
  }, []);

  useEffect(() => {
    api<{ items: AdminUser[] }>('/api/v1/admin/users', token)
      .then((r) => setItems(r.items))
      .catch((e) => setErr(String(e)));
  }, [token]);

  // Live KPIs from /api/v1/admin/summary, poll every 30s (same cadence as SecurityPage).
  useEffect(() => {
    let cancelled = false;
    function load(): void {
      apiWithRetry<AdminSummary>('/api/v1/admin/summary', token)
        .then((r) => {
          if (!cancelled) setSummary(r);
        })
        .catch(() => {});
    }
    load();
    const iv = setInterval(load, 30_000);
    return (): void => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [token]);

  // System status — surfaces /health on the dashboard.
  useEffect(() => {
    let cancelled = false;
    api<{ status: string }>('/health', null)
      .then((r) => {
        if (!cancelled) {
          setHealthOk(r.status === 'ok');
          setHealthCheckedAt(new Date().toISOString());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealthOk(false);
          setHealthCheckedAt(new Date().toISOString());
        }
      });
  }, []);

  return (
    <>
      <style>{`
        .af-admin-stat-row { display: flex; flex-wrap: wrap; gap: 12px; }
        .af-admin-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        @media (max-width: 768px) {
          .af-admin-h1 { font-size: 20px !important; }
          .af-admin-stat { min-width: 140px !important; padding: 12px !important; }
          .af-admin-stat-value { font-size: 22px !important; }
          .af-admin-td { padding: 12px 14px !important; font-size: 13px !important; }
          .af-admin-th { padding: 12px 14px !important; }
        }
      `}</style>

      <h1 style={styles.h1} className="af-admin-h1">
        Admin · Users
      </h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 24 }}>
        Read-only in Phase V-1. Role editing and user-lifecycle actions are deferred to V-2 pending
        a governance escalation (CLAUDE.md §Approval Boundaries).
      </p>
      {err && <p style={styles.err}>{err}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button style={styles.btn} onClick={() => goto('#/audit')}>
          View audit log
        </button>
        <button style={styles.btnGhost} onClick={() => goto('#/security')}>
          Security
        </button>
      </div>

      {healthOk !== null && (
        <div
          style={{
            ...styles.card,
            borderLeft: `4px solid ${healthOk ? colors.success : colors.danger}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={pill(healthOk ? colors.success : colors.danger)}>
            {healthOk ? 'System OK' : 'System degraded'}
          </span>
          <span style={{ fontWeight: 600 }}>System health</span>
          <span style={{ color: colors.textDim, fontSize: 12 }}>
            via GET /health
            {healthCheckedAt && ` · checked ${relativeTime(healthCheckedAt)}`}
          </span>
        </div>
      )}

      {summary && (
        <div className="af-admin-stat-row">
          <div style={styles.stat} className="af-admin-stat">
            <div style={styles.statLabel}>Total users</div>
            <div style={styles.statValue} className="af-admin-stat-value">
              {summary.users.total}
            </div>
          </div>
          <div
            style={{
              ...styles.stat,
              borderTop: `3px solid ${
                summary.users.mfaAdoptionPct >= 80
                  ? colors.success
                  : summary.users.mfaAdoptionPct >= 50
                    ? colors.warn
                    : colors.danger
              }`,
            }}
            className="af-admin-stat"
          >
            <div style={styles.statLabel}>MFA adoption</div>
            <div style={styles.statValue} className="af-admin-stat-value">
              {summary.users.mfaAdoptionPct}%
            </div>
            <div style={styles.statHint}>
              {summary.users.mfaEnabled} / {summary.users.total} users
            </div>
          </div>
          <div style={styles.stat} className="af-admin-stat">
            <div style={styles.statLabel}>Registered (7d)</div>
            <div style={styles.statValue} className="af-admin-stat-value">
              {summary.users.registeredLast7d}
            </div>
          </div>
          <div style={styles.stat} className="af-admin-stat">
            <div style={styles.statLabel}>Admin actions (24h)</div>
            <div style={styles.statValue} className="af-admin-stat-value">
              {summary.audit.adminActionsLast24h}
            </div>
            {summary.audit.topActions[0] && (
              <div style={styles.statHint}>
                top: {summary.audit.topActions[0].action.split('.').slice(-1)[0]}
              </div>
            )}
          </div>
        </div>
      )}

      <section
        aria-label="User list"
        style={{ ...styles.card, borderLeft: `4px solid ${colors.primary}` }}
      >
        <h3 style={styles.h3}>
          Users
          {items && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: colors.textMuted }}>
              {items.length} total
            </span>
          )}
        </h3>
        <div className="af-admin-table-wrap">
          {items === null ? (
            <p>Loading…</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th} className="af-admin-th">
                    Email
                  </th>
                  <th style={styles.th} className="af-admin-th">
                    Roles
                  </th>
                  <th style={styles.th} className="af-admin-th">
                    MFA
                  </th>
                  <th style={styles.th} className="af-admin-th">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id}>
                    <td style={styles.td} className="af-admin-td">
                      <b>{u.email}</b>
                    </td>
                    <td style={styles.td} className="af-admin-td">
                      {u.roles.map((r) => (
                        <span key={r} style={{ ...pill(colors.navBg), marginRight: 4 }}>
                          {r}
                        </span>
                      ))}
                    </td>
                    <td style={styles.td} className="af-admin-td">
                      <span style={pill(u.mfaEnabled ? colors.success : colors.textMuted)}>
                        {u.mfaEnabled ? 'enabled' : 'not enrolled'}
                      </span>
                    </td>
                    <td
                      style={{ ...styles.td, fontSize: 12, color: colors.textMuted }}
                      className="af-admin-td"
                    >
                      {relativeTime(u.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
