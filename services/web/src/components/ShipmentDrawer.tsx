import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { colors, pill, statusColor, styles } from '../styles';
import type { ShipmentDetail } from '../types';
import { Drawer } from './Drawer';

interface Props {
  token: string;
  shipmentId: string;
  canApprove: boolean;
  onClose: () => void;
  onAssigned: () => void;
}

export function ShipmentDrawer({
  token,
  shipmentId,
  canApprove,
  onClose,
  onAssigned,
}: Props): React.ReactElement {
  const [detail, setDetail] = useState<ShipmentDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    api<ShipmentDetail>(`/api/v1/shipments/${shipmentId}`, token)
      .then(setDetail)
      .catch((e) => setErr(String(e)));
  }, [token, shipmentId]);

  async function assign(carrierId: string): Promise<void> {
    setAssigning(carrierId);
    try {
      await api(`/api/v1/shipments/${shipmentId}/assign-carrier`, token, {
        method: 'POST',
        body: JSON.stringify({ carrierId }),
      });
      onAssigned();
      onClose();
    } catch (e) {
      setErr(`Assign failed: ${(e as Error).message}`);
      setAssigning(null);
    }
  }

  return (
    <Drawer title={`Shipment ${shipmentId.slice(0, 8)}…`} onClose={onClose}>
      {err && <p style={styles.err}>{err}</p>}
      {!detail ? (
        <p>Loading…</p>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <span style={pill(statusColor(detail.shipment.status))}>{detail.shipment.status}</span>
            <span style={{ marginLeft: 8 }}>
              {detail.shipment.origin} → {detail.shipment.destination}
            </span>
            <span style={{ marginLeft: 8, color: colors.textMuted, fontSize: 12 }}>
              {detail.shipment.distanceMiles.toLocaleString()} mi
            </span>
          </div>

          <h3 style={styles.h3}>Ranked bids ({detail.rankings.length})</h3>
          {detail.rankings.length === 0 ? (
            <p style={{ color: colors.textMuted }}>No active bids on this shipment.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Carrier</th>
                  <th style={styles.th}>Rating</th>
                  <th style={styles.th}>Cost</th>
                  <th style={styles.th}>Pickup</th>
                  <th style={styles.th}>Score</th>
                  {canApprove && detail.shipment.status === 'quoting' && (
                    <th style={styles.th}></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {detail.rankings.map((r, i) => (
                  <tr key={r.carrierId}>
                    <td style={styles.td}>{i + 1}</td>
                    <td style={styles.td}>{r.carrierName}</td>
                    <td style={styles.td}>{r.rating.toFixed(1)} ★</td>
                    <td style={styles.td}>${r.costUsd.toLocaleString()}</td>
                    <td style={styles.td}>{r.pickupDistanceMiles} mi</td>
                    <td style={styles.td}>
                      <b>{r.score.toFixed(3)}</b>
                    </td>
                    {canApprove && detail.shipment.status === 'quoting' && (
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                        <button
                          style={styles.btn}
                          disabled={assigning !== null}
                          onClick={() => void assign(r.carrierId)}
                        >
                          {assigning === r.carrierId ? 'Assigning…' : 'Assign'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 12 }}>
            <b>Score</b> = 0.4·cost + 0.3·distance + 0.3·rating. Directive 030 deterministic v1.
          </p>
        </>
      )}
    </Drawer>
  );
}
