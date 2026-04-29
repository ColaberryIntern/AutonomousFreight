import React, { useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '../api';
import { colors, pill, styles } from '../styles';
import type { ComplianceSummary, ExpiringArtifact } from '../types';

interface Props {
  token: string;
}

const RISK_COLORS: Record<string, string> = {
  green: colors.success,
  amber: colors.warn,
  red: colors.danger,
  unknown: colors.textMuted,
};

function daysUntil(iso: string): number {
  return Math.floor((Date.parse(iso) - Date.now()) / 86_400_000);
}

export function CompliancePage({ token }: Props): React.ReactElement {
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [expiring, setExpiring] = useState<ExpiringArtifact[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<ComplianceSummary>('/api/v1/compliance/summary', token),
      api<{ items: ExpiringArtifact[] }>('/api/v1/compliance/expiring?within_days=90', token),
    ])
      .then(([s, e]) => {
        setSummary(s);
        setExpiring(e.items);
      })
      .catch((e) => setErr(String(e)));
  }, [token]);

  if (err) return <p style={styles.err}>{err}</p>;
  if (!summary || !expiring) return <p>Loading…</p>;

  const riskData = Object.entries(summary.riskBuckets).map(([name, value]) => ({ name, value }));
  const byType = Object.entries(summary.artifactsByType);

  return (
    <>
      <h1 style={styles.h1}>Carrier Compliance</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        Risk distribution, artifact health, and upcoming expirations across the active carrier
        network.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ ...styles.card, flex: 1, minWidth: 320 }}>
          <h3
            style={styles.h3}
            title="Carriers bucketed by composite risk score (green/amber/red); unknown = no compliance snapshot on file."
          >
            Carrier risk distribution
          </h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={riskData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  label={({ name, value }: { name?: string; value?: number }): string =>
                    `${name ?? ''} (${value ?? 0})`
                  }
                >
                  {riskData.map((e) => (
                    <Cell key={e.name} fill={RISK_COLORS[e.name] ?? colors.textMuted} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ ...styles.card, flex: 1, minWidth: 320 }}>
          <h3
            style={styles.h3}
            title="Counts of compliance artifacts (insurance, MC authority, safety rating, etc.) currently on file."
          >
            Artifacts by type
          </h3>
          {byType.length === 0 ? (
            <p style={{ color: colors.textMuted }}>No compliance artifacts seeded.</p>
          ) : (
            <table style={styles.table}>
              <tbody>
                {byType.map(([type, count]) => (
                  <tr key={type}>
                    <td style={styles.td}>{type.replace(/_/g, ' ')}</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>
            Artifacts expiring ≤30 days: <b>{summary.artifactsExpiring.total}</b> (of which{' '}
            <b>{summary.artifactsExpiring.expired}</b> already expired).
          </p>
        </div>
      </div>

      <div style={styles.card}>
        <h3
          style={styles.h3}
          title="Artifacts whose expiry falls within the next 90 days. Already-expired rows are highlighted."
        >
          Artifacts expiring (90-day window)
        </h3>
        {expiring.length === 0 ? (
          <p style={{ color: colors.textMuted }}>No artifacts within window.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Reference</th>
                <th style={styles.th}>Expires</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {expiring.map((a) => {
                const d = daysUntil(a.expiresAt);
                const pillColor = a.expired ? colors.danger : d < 30 ? colors.warn : colors.success;
                const pillText = a.expired ? `expired ${-d}d ago` : `in ${d}d`;
                return (
                  <tr key={a.id} style={a.expired ? { background: '#fef2f2' } : undefined}>
                    <td style={styles.td}>{a.artifactType.replace(/_/g, ' ')}</td>
                    <td style={styles.td}>
                      <code style={{ fontSize: 12 }}>{a.reference}</code>
                    </td>
                    <td style={styles.td}>{new Date(a.expiresAt).toLocaleDateString()}</td>
                    <td style={styles.td}>
                      <span style={pill(pillColor)}>{pillText}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ fontSize: 12, color: colors.textMuted }}>
        Directive 070 — pure risk score; hard/soft gates described in V5 §17 ship in Phase V-2.
      </p>
    </>
  );
}
