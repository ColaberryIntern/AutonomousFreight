import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { colors, pill, relativeTime, styles } from '../styles';
import type { AdminUser } from '../types';

interface Props {
  token: string;
}

export function AdminPage({ token }: Props): React.ReactElement {
  const [items, setItems] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: AdminUser[] }>('/api/v1/admin/users', token)
      .then((r) => setItems(r.items))
      .catch((e) => setErr(String(e)));
  }, [token]);

  return (
    <>
      <h1 style={styles.h1}>Admin · Users</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        Read-only in Phase V-1. Role editing and user-lifecycle actions are deferred to V-2 pending
        a governance escalation (CLAUDE.md §Approval Boundaries).
      </p>
      {err && <p style={styles.err}>{err}</p>}
      <div style={styles.card}>
        {items === null ? (
          <p>Loading…</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Roles</th>
                <th style={styles.th}>MFA</th>
                <th style={styles.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td style={styles.td}>
                    <b>{u.email}</b>
                  </td>
                  <td style={styles.td}>
                    {u.roles.map((r) => (
                      <span key={r} style={{ ...pill(colors.navBg), marginRight: 4 }}>
                        {r}
                      </span>
                    ))}
                  </td>
                  <td style={styles.td}>
                    <span style={pill(u.mfaEnabled ? colors.success : colors.textMuted)}>
                      {u.mfaEnabled ? 'enabled' : 'not enrolled'}
                    </span>
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: colors.textMuted }}>
                    {relativeTime(u.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
