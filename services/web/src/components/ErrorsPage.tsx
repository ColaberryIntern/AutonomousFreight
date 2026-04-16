import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { colors, pill, relativeTime, styles } from '../styles';
import type { AuditItem } from '../types';

interface Props {
  token: string;
}

const ERROR_ACTIONS = [
  'rfq.exception',
  'agent.document.exception',
  'agent.rate_audit.exception',
  'agent.payment.match_failed',
  'agent.dispute.needs_review',
  'agent.procurement.blocked',
  'agent.procurement.needs_review',
  'gate.hard_blocked',
  'gate.soft_overridden',
];

const SEVERITY: Record<string, { label: string; color: string }> = {
  'gate.hard_blocked': { label: 'HARD BLOCK', color: colors.danger },
  'agent.payment.match_failed': { label: 'MATCH FAIL', color: colors.danger },
  'agent.rate_audit.exception': { label: 'RATE EXCEPTION', color: colors.danger },
  'agent.document.exception': { label: 'DOC EXCEPTION', color: colors.warn },
  'rfq.exception': { label: 'LOW CONFIDENCE', color: colors.warn },
  'agent.dispute.needs_review': { label: 'DISPUTE', color: colors.warn },
  'agent.procurement.blocked': { label: 'BLOCKED', color: colors.danger },
  'agent.procurement.needs_review': { label: 'NEEDS REVIEW', color: colors.warn },
  'gate.soft_overridden': { label: 'OVERRIDDEN', color: '#8b5cf6' },
};

export function ErrorsPage({ token }: Props): React.ReactElement {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const all: AuditItem[] = [];
        for (const action of ERROR_ACTIONS) {
          const r = await api<{ items: AuditItem[] }>(
            `/api/v1/audit/logs?action=${action}&limit=20`,
            token,
          );
          all.push(...r.items);
        }
        all.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
        setItems(all);
      } catch (e) {
        setErr(String(e));
      }
    }
    void load();
  }, [token]);

  const filtered = items && filter !== 'all' ? items.filter((i) => i.action === filter) : items;

  return (
    <>
      <h1 style={styles.h1}>Error Handling</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        System errors, compliance blocks, agent exceptions, and items requiring human review.
        Sourced from the immutable audit log across all 9 agents.
      </p>

      {err && <p style={styles.err}>{err}</p>}

      <div style={styles.card}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button
            style={{
              ...styles.btnGhost,
              ...(filter === 'all' ? { background: colors.primary, color: 'white' } : {}),
            }}
            onClick={() => setFilter('all')}
          >
            All ({items?.length ?? 0})
          </button>
          {ERROR_ACTIONS.map((a) => {
            const count = items?.filter((i) => i.action === a).length ?? 0;
            if (count === 0) return null;
            const sev = SEVERITY[a];
            return (
              <button
                key={a}
                style={{
                  ...styles.btnGhost,
                  ...(filter === a
                    ? { background: sev?.color ?? colors.primary, color: 'white' }
                    : {}),
                }}
                onClick={() => setFilter(a)}
              >
                {sev?.label ?? a} ({count})
              </button>
            );
          })}
        </div>

        {filtered === null ? (
          <p>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: colors.textMuted }}>No errors or exceptions recorded.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Severity</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Target</th>
                <th style={styles.th}>Details</th>
                <th style={styles.th}>When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev) => {
                const sev = SEVERITY[ev.action] ?? { label: ev.action, color: colors.textMuted };
                return (
                  <tr key={`${ev.id}-${ev.action}`}>
                    <td style={styles.td}>
                      <span style={pill(sev.color)}>{sev.label}</span>
                    </td>
                    <td style={styles.td}>
                      <code style={{ fontSize: 12 }}>{ev.action}</code>
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: 11,
                      }}
                    >
                      {ev.target ? `${ev.target.slice(0, 8)}…` : '—'}
                    </td>
                    <td
                      style={{ ...styles.td, fontSize: 12, color: colors.textDim, maxWidth: 400 }}
                    >
                      {ev.metadata && Object.keys(ev.metadata).length > 0
                        ? JSON.stringify(ev.metadata).slice(0, 200)
                        : '—'}
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        color: colors.textMuted,
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {relativeTime(ev.occurredAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...styles.card, background: '#f8fafc' }}>
        <h3 style={styles.h3}>Error handling architecture</h3>
        <ul style={{ fontSize: 13, color: colors.textDim, margin: 0, paddingLeft: 20 }}>
          <li>Every agent has per-item try/catch — one failure never blocks another</li>
          <li>Compliance gates enforce hard/soft rules before state transitions (directive 201)</li>
          <li>
            Rate Audit Agent flags margin exceptions before invoice generation (directive 220)
          </li>
          <li>Payment Match Agent creates disputes on three-way match failure (directive 230)</li>
          <li>
            All errors are recorded in the immutable audit log with actor, target, and metadata
          </li>
          <li>9 distinct error status codes used: 200, 201, 400, 401, 403, 404, 409, 422, 500</li>
        </ul>
      </div>
    </>
  );
}
