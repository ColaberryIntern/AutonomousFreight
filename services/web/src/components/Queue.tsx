import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { colors, pill, statusColor, styles } from '../styles';
import type { Shipment, ShipmentDetail } from '../types';

interface Props {
  token: string;
  canApprove: boolean;
  onDetail: (shipmentId: string) => void;
}

interface QueueRow {
  shipment: Shipment;
  detail: ShipmentDetail | null;
  approving: boolean;
}

export function Queue({ token, canApprove, onDetail }: Props): React.ReactElement {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await api<{ items: Shipment[] }>('/api/v1/shipments', token);
      const quoting = r.items.filter((s) => s.status === 'quoting');
      const enriched = await Promise.all(
        quoting.map(async (s) => {
          try {
            const d = await api<ShipmentDetail>(`/api/v1/shipments/${s.id}`, token);
            return { shipment: s, detail: d, approving: false };
          } catch {
            return { shipment: s, detail: null, approving: false };
          }
        }),
      );
      setRows(enriched);
    } catch (e) {
      setErr(String(e));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(shipmentId: string, carrierId: string): Promise<void> {
    setRows((prev) =>
      prev ? prev.map((r) => (r.shipment.id === shipmentId ? { ...r, approving: true } : r)) : prev,
    );
    try {
      await api(`/api/v1/shipments/${shipmentId}/assign-carrier`, token, {
        method: 'POST',
        body: JSON.stringify({ carrierId }),
      });
      setFlash(`Assigned. Shipment ${shipmentId.slice(0, 8)}… moved to assigned.`);
      setTimeout(() => setFlash(null), 4000);
      await load();
    } catch (e) {
      setErr(`Assign failed: ${(e as Error).message}`);
      setRows((prev) =>
        prev
          ? prev.map((r) => (r.shipment.id === shipmentId ? { ...r, approving: false } : r))
          : prev,
      );
    }
  }

  return (
    <>
      <h1 style={styles.h1}>Queue</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        Shipments in <b>quoting</b> state. Approve the system's top pick or open a drawer to inspect
        the bids.
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
                <th style={styles.th}>Score</th>
                <th style={styles.th}>Bids</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const top = r.detail?.rankings[0];
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
                    <td style={styles.td}>{top ? <b>{top.score.toFixed(3)}</b> : '—'}</td>
                    <td style={styles.td}>{r.detail?.bids.length ?? 0}</td>
                    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                      <button style={styles.btnGhost} onClick={() => onDetail(r.shipment.id)}>
                        Inspect
                      </button>{' '}
                      {canApprove && top && (
                        <button
                          style={styles.btn}
                          disabled={r.approving}
                          onClick={() => void approve(r.shipment.id, top.carrierId)}
                        >
                          {r.approving ? 'Approving…' : 'Approve'}
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
      <p style={{ fontSize: 12, color: colors.textMuted }}>
        Approve fires <code>POST /api/v1/shipments/:id/assign-carrier</code>, transitions the
        shipment to <i>assigned</i>, writes an audit row, and emits{' '}
        <code>shipment.carrier_selected</code>. Directive 190 + 030.
      </p>
    </>
  );
}
