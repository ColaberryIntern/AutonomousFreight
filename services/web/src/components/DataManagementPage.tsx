import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { colors, pill, relativeTime, styles } from '../styles';
import type { AuditItem, Rfq, Overview } from '../types';

interface Props {
  token: string;
}

interface PipelineCounts {
  received: number;
  parsed: number;
  priced: number;
  sent: number;
  won: number;
  lost: number;
  exception: number;
}

const DATA_ACTIONS = [
  'rfq.received',
  'rfq.parsed',
  'rfq.priced',
  'rfq.sent',
  'rfq.exception',
  'agent.document.extracted',
  'agent.document.exception',
  'document.uploaded',
  'agent.tracking.milestone',
];

function countByStatus(rfqs: Rfq[]): PipelineCounts {
  const c: PipelineCounts = { received: 0, parsed: 0, priced: 0, sent: 0, won: 0, lost: 0, exception: 0 };
  for (const r of rfqs) {
    if (r.status in c) c[r.status as keyof PipelineCounts]++;
  }
  return c;
}

export function DataManagementPage({ token }: Props): React.ReactElement {
  const [rfqs, setRfqs] = useState<Rfq[] | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [events, setEvents] = useState<AuditItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const [r, o, ...evLists] = await Promise.all([
          api<{ items: Rfq[] }>('/api/v1/rfqs?limit=200', token),
          api<Overview>('/api/v1/dashboard/overview', token),
          ...DATA_ACTIONS.map(a =>
            api<{ items: AuditItem[] }>(`/api/v1/audit/logs?action=${a}&limit=10`, token)
              .catch(() => ({ items: [] as AuditItem[] })),
          ),
        ]);
        if (cancelled) return;
        setRfqs(r.items);
        setOverview(o);
        const allEvents = evLists.flatMap(e => e.items);
        allEvents.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
        setEvents(allEvents.slice(0, 25));
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  const pipeline = rfqs ? countByStatus(rfqs) : null;

  return (
    <>
      <h1 style={styles.h1}>Data Management</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        Data pipelines, document processing, and ETL flow visibility.
      </p>

      {err && <p style={styles.err}>{err}</p>}

      {/* ETL pipeline status */}
      {pipeline && (
        <div style={styles.card}>
          <h3 style={styles.h3}>RFQ data pipeline</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([
              ['Received', pipeline.received, colors.textMuted],
              ['Parsed', pipeline.parsed, colors.primary],
              ['Priced', pipeline.priced, 'var(--cat4)'],
              ['Sent', pipeline.sent, colors.warn],
              ['Won', pipeline.won, colors.success],
              ['Lost', pipeline.lost, colors.textMuted],
              ['Exception', pipeline.exception, colors.danger],
            ] as const).map(([label, count, color]) => (
              <div key={label} style={{ ...styles.stat, borderTop: `3px solid ${color}`, minWidth: 100 }}>
                <div style={styles.statLabel}>{label}</div>
                <div style={{ ...styles.statValue, color }}>{count}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: colors.textMuted }}>
            Total RFQs ingested: {rfqs?.length ?? 0}
          </div>
        </div>
      )}

      {/* Shipment data volumes */}
      {overview && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ ...styles.card, flex: 1, minWidth: 260 }}>
            <h3 style={styles.h3}>Shipment data volume</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(overview.shipments.byStatus).map(([status, count]) => (
                <div key={status} style={{ ...styles.stat, minWidth: 90 }}>
                  <div style={styles.statLabel}>{status}</div>
                  <div style={styles.statValue}>{count}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: colors.textMuted }}>
              Total shipments: {overview.shipments.total}
            </div>
          </div>

          <div style={{ ...styles.card, flex: 1, minWidth: 260 }}>
            <h3 style={styles.h3}>Data quality</h3>
            <table style={styles.table}>
              <tbody>
                <tr>
                  <td style={{ ...styles.td, fontWeight: 600 }}>Active carriers</td>
                  <td style={styles.td}>{overview.carriers.active}</td>
                </tr>
                <tr>
                  <td style={{ ...styles.td, fontWeight: 600 }}>Compliance artifacts expiring (30d)</td>
                  <td style={styles.td}>
                    <span style={pill(overview.compliance.artifactsExpiringWithin30d > 0 ? colors.warn : colors.success)}>
                      {overview.compliance.artifactsExpiringWithin30d}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ ...styles.td, fontWeight: 600 }}>Expired artifacts</td>
                  <td style={styles.td}>
                    <span style={pill(overview.compliance.artifactsExpired > 0 ? colors.danger : colors.success)}>
                      {overview.compliance.artifactsExpired}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ ...styles.td, fontWeight: 600 }}>Audit events (24h)</td>
                  <td style={styles.td}>{overview.auditEventsLast24h}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent data events */}
      <div style={styles.card}>
        <h3 style={styles.h3}>Recent data events</h3>
        {events === null ? (
          <p style={{ fontSize: 13, color: colors.textMuted }}>Loading...</p>
        ) : events.length === 0 ? (
          <p style={{ fontSize: 13, color: colors.textMuted }}>No recent data events.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Event</th>
                <th style={styles.th}>Target</th>
                <th style={styles.th}>Details</th>
                <th style={styles.th}>When</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const isException = ev.action.includes('exception');
                return (
                  <tr key={ev.id}>
                    <td style={styles.td}>
                      <span style={pill(isException ? colors.danger : colors.primary)}>
                        {ev.action.replace('agent.', '').replace('rfq.', 'rfq:')}
                      </span>
                    </td>
                    <td style={{ ...styles.td, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                      {ev.target ? `${ev.target.slice(0, 8)}...` : '--'}
                    </td>
                    <td style={{ ...styles.td, fontSize: 12, color: colors.textDim, maxWidth: 350 }}>
                      {ev.metadata && Object.keys(ev.metadata).length > 0
                        ? JSON.stringify(ev.metadata).slice(0, 150)
                        : '--'}
                    </td>
                    <td style={{ ...styles.td, color: colors.textMuted, fontSize: 12, whiteSpace: 'nowrap' as const }}>
                      {relativeTime(ev.occurredAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Architecture note */}
      <div style={{ ...styles.card, background: 'var(--raised)' }}>
        <h3 style={styles.h3}>Data pipeline architecture</h3>
        <ul style={{ fontSize: 13, color: colors.textDim, margin: 0, paddingLeft: 20 }}>
          <li>RFQ ingestion: received &rarr; parsed &rarr; priced &rarr; sent &rarr; won/lost/exception</li>
          <li>Document Agent extracts BOL fields via deterministic extractBolFields()</li>
          <li>Tracking Agent simulates milestone progression (pickup &rarr; transit &rarr; delivered)</li>
          <li>Invoice Agent generates sequential AF-INV-NNNN from verified shipments</li>
          <li>All transformations are audited in the immutable append-only audit log</li>
          <li>PII anonymization available via platform privacy utilities</li>
        </ul>
      </div>
    </>
  );
}
