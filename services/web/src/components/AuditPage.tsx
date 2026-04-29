import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { colors, relativeTime, styles } from '../styles';
import type { AuditItem } from '../types';

interface Props {
  token: string;
}

const PAGE = 25;

export function AuditPage({ token }: Props): React.ReactElement {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState('');

  const load = useCallback(async (): Promise<void> => {
    try {
      const qs = new URLSearchParams({
        limit: String(PAGE),
        offset: String(offset),
      });
      if (filter) qs.set('action', filter);
      const r = await api<{ items: AuditItem[] }>(`/api/v1/audit/logs?${qs.toString()}`, token);
      setItems(r.items);
    } catch (e) {
      setErr(String(e));
    }
  }, [token, offset, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <h1 style={styles.h1}>Audit Log</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        Immutable system event log — filter by action prefix to drill into a workflow.
      </p>
      {err && <p style={styles.err}>{err}</p>}
      <div style={styles.card}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            style={{ ...styles.input, maxWidth: 320 }}
            placeholder="Filter by action (e.g. shipment.assigned)"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setOffset(0);
            }}
          />
          <button
            style={styles.btnGhost}
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
          >
            ← Prev
          </button>
          <button
            style={styles.btnGhost}
            disabled={items !== null && items.length < PAGE}
            onClick={() => setOffset((o) => o + PAGE)}
          >
            Next →
          </button>
        </div>

        {items === null ? (
          <p>Loading…</p>
        ) : items.length === 0 ? (
          <p style={{ color: colors.textMuted }}>No audit events match.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Actor</th>
                <th style={styles.th}>Target</th>
                <th style={styles.th}>Metadata</th>
                <th style={styles.th}>When</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ev) => (
                <tr key={ev.id}>
                  <td style={styles.td}>
                    <code style={{ fontSize: 12 }}>{ev.action}</code>
                  </td>
                  <td style={{ ...styles.td, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                    {ev.actorUserId ? `${ev.actorUserId.slice(0, 8)}…` : '—'}
                  </td>
                  <td style={{ ...styles.td, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                    {ev.target ? `${ev.target.slice(0, 8)}…` : '—'}
                  </td>
                  <td style={{ ...styles.td, fontSize: 11, color: colors.textMuted }}>
                    {ev.metadata && Object.keys(ev.metadata).length > 0
                      ? JSON.stringify(ev.metadata)
                      : '—'}
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
    </>
  );
}
