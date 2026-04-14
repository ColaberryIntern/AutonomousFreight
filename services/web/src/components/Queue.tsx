import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { colors, pill, statusColor, styles } from '../styles';
import type { GateEvaluation, Shipment, ShipmentDetail } from '../types';
import { GatePill } from './GatePill';

interface Props {
  token: string;
  canApprove: boolean;
  onDetail: (shipmentId: string) => void;
}

interface QueueRow {
  shipment: Shipment;
  detail: ShipmentDetail | null;
  gate: GateEvaluation | null;
  approving: boolean;
}

export function Queue({ token, canApprove, onDetail }: Props): React.ReactElement {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [overrideFor, setOverrideFor] = useState<{
    shipmentId: string;
    carrierId: string;
    findings: GateEvaluation['findings'];
  } | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await api<{ items: Shipment[] }>('/api/v1/shipments', token);
      const quoting = r.items.filter((s) => s.status === 'quoting');
      const enriched = await Promise.all(
        quoting.map(async (s) => {
          let detail: ShipmentDetail | null = null;
          let gate: GateEvaluation | null = null;
          try {
            detail = await api<ShipmentDetail>(`/api/v1/shipments/${s.id}`, token);
            const top = detail.rankings[0];
            if (top) {
              try {
                gate = await api<GateEvaluation>(
                  `/api/v1/shipments/${s.id}/gates/${top.carrierId}`,
                  token,
                );
              } catch {
                gate = null;
              }
            }
          } catch {
            // detail unavailable — leave nulls
          }
          return { shipment: s, detail, gate, approving: false };
        }),
      );
      setRows(enriched);
    } catch (e) {
      setErr(String(e));
    }
  }, [token]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  async function approve(
    shipmentId: string,
    carrierId: string,
    overrideReason?: string,
  ): Promise<void> {
    setRows((prev) =>
      prev ? prev.map((r) => (r.shipment.id === shipmentId ? { ...r, approving: true } : r)) : prev,
    );
    try {
      const url = overrideReason
        ? `/api/v1/shipments/${shipmentId}/assign-carrier?override=true`
        : `/api/v1/shipments/${shipmentId}/assign-carrier`;
      const body = overrideReason ? { carrierId, reason: overrideReason } : { carrierId };
      await api(url, token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setFlash(`Assigned. Shipment ${shipmentId.slice(0, 8)}… moved to assigned.`);
      setTimeout(() => setFlash(null), 4000);
      await load();
      setOverrideFor(null);
      setReason('');
    } catch (e) {
      setErr(`Assign failed: ${(e as Error).message}`);
      setRows((prev) =>
        prev
          ? prev.map((r) => (r.shipment.id === shipmentId ? { ...r, approving: false } : r))
          : prev,
      );
    }
  }

  async function handleApprove(row: QueueRow): Promise<void> {
    const top = row.detail?.rankings[0];
    if (!top) return;
    if (row.gate?.result === 'soft') {
      setOverrideFor({
        shipmentId: row.shipment.id,
        carrierId: top.carrierId,
        findings: row.gate.findings,
      });
      return;
    }
    await approve(row.shipment.id, top.carrierId);
  }

  return (
    <>
      <h1 style={styles.h1}>Queue</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        Shipments in <b>quoting</b> state. Each row's <b>gate</b> badge reflects directive 201:
        green = clear, yellow = soft (override required), red = hard block.
      </p>
      {flash && (
        <div style={{ ...styles.card, background: '#ecfdf5', borderColor: colors.success }}>
          {flash}
        </div>
      )}
      {err && <p style={styles.err}>{err}</p>}
      <div style={styles.card}>
        {rows === null ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: colors.textMuted }}>Queue is empty — no shipments in quoting state.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Shipment</th>
                <th style={styles.th}>Lane</th>
                <th style={styles.th}>Top carrier</th>
                <th style={styles.th}>Gate</th>
                <th style={styles.th}>Score</th>
                <th style={styles.th}>Bids</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const top = r.detail?.rankings[0];
                const gateResult = r.gate?.result;
                return (
                  <tr key={r.shipment.id}>
                    <td
                      style={{
                        ...styles.td,
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: 12,
                      }}
                    >
                      <span style={pill(statusColor(r.shipment.status))}>{r.shipment.status}</span>{' '}
                      {r.shipment.id.slice(0, 8)}…
                    </td>
                    <td style={styles.td}>
                      {r.shipment.origin} → {r.shipment.destination}
                      <div style={{ fontSize: 11, color: colors.textMuted }}>
                        {r.shipment.distanceMiles.toLocaleString()} mi
                      </div>
                    </td>
                    <td style={styles.td}>
                      {top ? (
                        <>
                          <b>{top.carrierName}</b>
                          <div style={{ fontSize: 11, color: colors.textMuted }}>
                            ${top.costUsd.toLocaleString()} · {top.pickupDistanceMiles} mi pickup
                          </div>
                        </>
                      ) : (
                        <span style={{ color: colors.textMuted }}>—</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <GatePill ev={r.gate} />
                    </td>
                    <td style={styles.td}>{top ? <b>{top.score.toFixed(3)}</b> : '—'}</td>
                    <td style={styles.td}>{r.detail?.bids.length ?? 0}</td>
                    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                      <button style={styles.btnGhost} onClick={() => onDetail(r.shipment.id)}>
                        Inspect
                      </button>{' '}
                      {canApprove && top && (
                        <button
                          style={
                            gateResult === 'hard' ? { ...styles.btn, opacity: 0.4 } : styles.btn
                          }
                          disabled={r.approving || gateResult === 'hard'}
                          onClick={() => void handleApprove(r)}
                          title={
                            gateResult === 'hard' ? 'Compliance hard-blocks this assignment' : ''
                          }
                        >
                          {r.approving
                            ? 'Approving…'
                            : gateResult === 'hard'
                              ? 'Blocked'
                              : gateResult === 'soft'
                                ? 'Override…'
                                : 'Approve'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {overrideFor && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15,23,42,0.45)',
              zIndex: 60,
            }}
            onClick={() => setOverrideFor(null)}
          />
          <div
            style={{
              position: 'fixed',
              top: '20%',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'white',
              padding: 24,
              borderRadius: 8,
              minWidth: 480,
              maxWidth: 640,
              zIndex: 61,
              boxShadow: '0 12px 40px rgba(15,23,42,0.3)',
            }}
          >
            <h3 style={styles.h3}>Override soft compliance gate</h3>
            <p style={{ fontSize: 13, color: colors.textDim }}>
              The system flagged this carrier with the following soft warnings. Approving requires a
              written reason that will be recorded immutably in the audit log.
            </p>
            <ul style={{ margin: '8px 0 12px 20px', fontSize: 13 }}>
              {overrideFor.findings.map((f) => (
                <li
                  key={f.code}
                  style={{ color: f.severity === 'hard' ? colors.danger : colors.warn }}
                >
                  <b>{f.code}:</b> {f.message}
                </li>
              ))}
            </ul>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (≥ 10 characters) — e.g. 'Customer accepted carrier risk; lane is critical and no alternates available.'"
              style={{
                width: '100%',
                minHeight: 80,
                padding: 8,
                fontSize: 13,
                border: `1px solid ${colors.cardBorder}`,
                borderRadius: 4,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={styles.btnGhost} onClick={() => setOverrideFor(null)}>
                Cancel
              </button>
              <button
                style={reason.trim().length < 10 ? { ...styles.btn, opacity: 0.4 } : styles.btn}
                disabled={reason.trim().length < 10}
                onClick={() =>
                  void approve(overrideFor.shipmentId, overrideFor.carrierId, reason.trim())
                }
              >
                Override + assign
              </button>
            </div>
          </div>
        </>
      )}

      <p style={{ fontSize: 12, color: colors.textMuted }}>
        Polls every 5s. Approve fires <code>POST /api/v1/shipments/:id/assign-carrier</code> with
        gate enforcement per directive 201. Hard blocks cannot be bypassed via API.
      </p>
    </>
  );
}
