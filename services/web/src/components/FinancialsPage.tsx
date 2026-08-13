import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { colors, pill, relativeTime, styles } from '../styles';
import type { AuditItem } from '../types';

interface Props {
  token: string;
}

interface FinancialSummary {
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  avgMarginPct: number;
  invoiceCount: number;
  byStatus: Record<string, number>;
}

interface Reconciliation {
  invoiceCount: number;
  settledCount: number;
  disputeCount: number;
  unmatchedCount: number;
  matchRate: number;
  totalInvoicedUsd: number;
  totalSettledUsd: number;
  totalDisputedUsd: number;
  netDiscrepancyUsd: number;
}

interface Dispute {
  id: string;
  invoiceNumber: string;
  reason: string;
  discrepancyUsd: number;
  status: string;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

const FINANCIAL_ACTIONS = [
  'agent.rate_audit.passed',
  'agent.rate_audit.exception',
  'agent.invoice.generated',
  'agent.payment.matched',
  'agent.payment.match_failed',
  'agent.settlement.queued',
  'agent.settlement.paid',
  'agent.dispute.resolved',
  'agent.dispute.needs_review',
];

function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FinancialsPage({ token }: Props): React.ReactElement {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [events, setEvents] = useState<AuditItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const [s, r, d, ...evLists] = await Promise.all([
          api<FinancialSummary>('/api/v1/financials/summary', token),
          api<Reconciliation>('/api/v1/financials/reconciliation', token),
          api<{ items: Dispute[] }>('/api/v1/disputes', token),
          ...FINANCIAL_ACTIONS.map(a =>
            api<{ items: AuditItem[] }>(`/api/v1/audit/logs?action=${a}&limit=5`, token)
              .catch(() => ({ items: [] as AuditItem[] })),
          ),
        ]);
        if (cancelled) return;
        setSummary(s);
        setRecon(r);
        setDisputes(d.items);
        const allEv = evLists.flatMap(e => e.items);
        allEv.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
        setEvents(allEv.slice(0, 20));
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <>
      <h1 style={styles.h1}>Financial Auditing & Reconciliation</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        Real-time financial KPIs, invoice reconciliation, disputes, and automated audit trail.
      </p>

      {err && <p style={styles.err}>{err}</p>}

      {/* Revenue KPI cards */}
      {summary && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <KpiCard label="Total revenue" value={fmtUsd(summary.totalRevenue)} color={colors.primary} />
          <KpiCard label="Total cost" value={fmtUsd(summary.totalCost)} color={colors.textDim} />
          <KpiCard label="Total margin" value={fmtUsd(summary.totalMargin)} color={summary.totalMargin >= 0 ? colors.success : colors.danger} />
          <KpiCard label="Avg margin %" value={`${summary.avgMarginPct}%`} color={summary.avgMarginPct >= 5 ? colors.success : colors.warn} hint="Target: >= 5%" />
          <KpiCard label="Invoices" value={String(summary.invoiceCount)} color={colors.primary} />
        </div>
      )}

      {/* Reconciliation + Invoice status side by side */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        {recon && (
          <div style={{ ...styles.card, flex: 1, minWidth: 280 }}>
            <h3 style={styles.h3}>Reconciliation</h3>
            <table style={styles.table}>
              <tbody>
                <tr>
                  <td style={{ ...styles.td, fontWeight: 600 }}>Match rate</td>
                  <td style={styles.td}>
                    <span style={pill(recon.matchRate >= 90 ? colors.success : recon.matchRate >= 70 ? colors.warn : colors.danger)}>
                      {recon.matchRate}%
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ ...styles.td, fontWeight: 600 }}>Invoiced</td>
                  <td style={styles.td}>{fmtUsd(recon.totalInvoicedUsd)}</td>
                </tr>
                <tr>
                  <td style={{ ...styles.td, fontWeight: 600 }}>Settled</td>
                  <td style={styles.td}>{fmtUsd(recon.totalSettledUsd)}</td>
                </tr>
                <tr>
                  <td style={{ ...styles.td, fontWeight: 600 }}>Disputed</td>
                  <td style={styles.td}>{fmtUsd(recon.totalDisputedUsd)}</td>
                </tr>
                <tr>
                  <td style={{ ...styles.td, fontWeight: 600 }}>Net discrepancy</td>
                  <td style={styles.td}>
                    <span style={pill(recon.netDiscrepancyUsd === 0 ? colors.success : colors.warn)}>
                      {fmtUsd(recon.netDiscrepancyUsd)}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ ...styles.td, fontWeight: 600 }}>Unmatched</td>
                  <td style={styles.td}>{recon.unmatchedCount}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {summary && (
          <div style={{ ...styles.card, flex: 1, minWidth: 280 }}>
            <h3 style={styles.h3}>Invoice status</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(summary.byStatus).map(([status, count]) => {
                const c = status === 'paid' ? colors.success
                  : status === 'matched' ? colors.primary
                  : status === 'issued' ? colors.warn
                  : status === 'match_failed' ? colors.danger
                  : colors.textMuted;
                return (
                  <div key={status} style={{ ...styles.stat, borderTop: `3px solid ${c}`, minWidth: 90 }}>
                    <div style={styles.statLabel}>{status}</div>
                    <div style={{ ...styles.statValue, color: c }}>{count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Open disputes */}
      {disputes && disputes.length > 0 && (
        <div style={styles.card}>
          <h3 style={styles.h3}>Disputes ({disputes.filter(d => d.status === 'open').length} open)</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Invoice</th>
                <th style={styles.th}>Reason</th>
                <th style={styles.th}>Discrepancy</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {disputes.slice(0, 15).map((d) => (
                <tr key={d.id}>
                  <td style={{ ...styles.td, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{d.invoiceNumber}</td>
                  <td style={{ ...styles.td, fontSize: 12 }}>{d.reason}</td>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{fmtUsd(d.discrepancyUsd)}</td>
                  <td style={styles.td}>
                    <span style={pill(d.status === 'open' ? colors.warn : colors.success)}>
                      {d.status}
                    </span>
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: colors.textMuted }}>{relativeTime(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent financial events */}
      <div style={styles.card}>
        <h3 style={styles.h3}>Recent financial events</h3>
        {events === null ? (
          <p style={{ fontSize: 13, color: colors.textMuted }}>Loading...</p>
        ) : events.length === 0 ? (
          <p style={{ fontSize: 13, color: colors.textMuted }}>No recent financial events.</p>
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
                const isErr = ev.action.includes('exception') || ev.action.includes('failed') || ev.action.includes('needs_review');
                return (
                  <tr key={ev.id}>
                    <td style={styles.td}>
                      <span style={pill(isErr ? colors.danger : colors.success)}>
                        {ev.action.replace('agent.', '')}
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

      <div style={{ ...styles.card, background: 'var(--raised)' }}>
        <h3 style={styles.h3}>Automated audit pipeline</h3>
        <ul style={{ fontSize: 13, color: colors.textDim, margin: 0, paddingLeft: 20 }}>
          <li>Rate Audit Agent checks margin &ge; 5% before invoicing (directive 220)</li>
          <li>Invoice Agent generates sequential AF-INV-NNNN from verified shipments</li>
          <li>Payment Match Agent performs three-way invoice/settlement/carrier match</li>
          <li>Settlement Agent queues carrier payments from matched invoices</li>
          <li>Dispute Agent auto-resolves discrepancies &lt; 5%; escalates larger ones</li>
          <li>All decisions logged in the immutable audit trail with full metadata</li>
        </ul>
      </div>
    </>
  );
}

function KpiCard({ label, value, hint, color }: { label: string; value: string; hint?: string; color: string }): React.ReactElement {
  return (
    <div style={{ ...styles.stat, borderTop: `3px solid ${color}` }}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
      {hint && <div style={styles.statHint}>{hint}</div>}
    </div>
  );
}
