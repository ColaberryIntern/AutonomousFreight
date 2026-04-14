import React, { useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '../api';
import { colors, pill, relativeTime, statusColor, styles } from '../styles';
import type { AuditItem, Overview } from '../types';

interface Props {
  token: string;
  isAdmin: boolean;
}

const RISK_COLORS: Record<string, string> = {
  green: colors.success,
  amber: colors.warn,
  red: colors.danger,
  unknown: colors.textMuted,
};

export function OpsHome({ token, isAdmin }: Props): React.ReactElement {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [audit, setAudit] = useState<AuditItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Overview>('/api/v1/dashboard/overview', token)
      .then(setOverview)
      .catch((e) => setErr(String(e)));
    if (isAdmin) {
      api<{ items: AuditItem[] }>('/api/v1/audit/logs?limit=10', token)
        .then((r) => setAudit(r.items))
        .catch(() => setAudit([]));
    }
  }, [token, isAdmin]);

  if (err) return <p style={styles.err}>{err}</p>;
  if (!overview) return <p>Loading…</p>;

  const riskData = Object.entries(overview.compliance.riskBuckets).map(([k, v]) => ({
    name: k,
    value: v,
  }));

  const statusBreakdown = Object.entries(overview.shipments.byStatus);

  return (
    <>
      <h1 style={styles.h1}>Operations</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <StatCard
          label="Shipments quoting"
          value={overview.shipments.quoting}
          hint={`${overview.shipments.total} total`}
        />
        <StatCard label="Active carriers" value={overview.carriers.active} />
        <StatCard
          label="Compliance ≤30d"
          value={overview.compliance.artifactsExpiringWithin30d}
          hint={`${overview.compliance.artifactsExpired} already expired`}
        />
        <StatCard label="Audit events (24h)" value={overview.auditEventsLast24h} />
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ ...styles.card, flex: 1, minWidth: 320 }}>
          <h3 style={styles.h3}>Carrier compliance — risk distribution</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={riskData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  label={({ name, value }: { name?: string; value?: number }): string =>
                    `${name ?? ''} (${value ?? 0})`
                  }
                >
                  {riskData.map((entry) => (
                    <Cell key={entry.name} fill={RISK_COLORS[entry.name] ?? colors.textMuted} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ ...styles.card, flex: 1, minWidth: 320 }}>
          <h3 style={styles.h3}>Shipments by state</h3>
          {statusBreakdown.length === 0 ? (
            <p style={{ fontSize: 13, color: colors.textMuted }}>No shipments yet.</p>
          ) : (
            <table style={styles.table}>
              <tbody>
                {statusBreakdown.map(([status, count]) => (
                  <tr key={status}>
                    <td style={styles.td}>
                      <span style={pill(statusColor(status))}>{status}</span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isAdmin && audit && (
        <div style={styles.card}>
          <h3 style={styles.h3}>Recent audit events</h3>
          {audit.length === 0 ? (
            <p style={{ fontSize: 13, color: colors.textMuted }}>No events yet.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Target</th>
                  <th style={styles.th}>When</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((ev) => (
                  <tr key={ev.id}>
                    <td style={styles.td}>
                      <code style={{ fontSize: 12 }}>{ev.action}</code>
                    </td>
                    <td
                      style={{ ...styles.td, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                    >
                      {ev.target ? `${ev.target.slice(0, 8)}…` : '—'}
                    </td>
                    <td style={{ ...styles.td, color: colors.textMuted, fontSize: 12 }}>
                      {relativeTime(ev.occurredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}): React.ReactElement {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
      {hint && <div style={styles.statHint}>{hint}</div>}
    </div>
  );
}
