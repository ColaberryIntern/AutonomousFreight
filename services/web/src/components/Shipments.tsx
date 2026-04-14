import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { colors, pill, statusColor, styles } from '../styles';
import type { Shipment } from '../types';
import { ShipmentDrawer } from './ShipmentDrawer';

interface Props {
  token: string;
  canApprove: boolean;
}

export function Shipments({ token, canApprove }: Props): React.ReactElement {
  const [items, setItems] = useState<Shipment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await api<{ items: Shipment[] }>('/api/v1/shipments', token);
      setItems(r.items);
    } catch (e) {
      setErr(String(e));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <>
      <h1 style={styles.h1}>Shipments</h1>
      {err && <p style={styles.err}>{err}</p>}
      <div style={styles.card}>
        {items === null ? (
          <p>Loading…</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Origin → Destination</th>
                <th style={styles.th}>Distance</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...styles.td, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                    {s.id.slice(0, 8)}…
                  </td>
                  <td style={styles.td}>
                    {s.origin} → {s.destination}
                  </td>
                  <td style={styles.td}>{s.distanceMiles.toLocaleString()} mi</td>
                  <td style={styles.td}>
                    <span style={pill(statusColor(s.status))}>{s.status}</span>
                  </td>
                  <td style={styles.td}>
                    <button style={styles.btnGhost} onClick={() => setSelected(s.id)}>
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {items && items.length === 0 && <p style={{ color: colors.textMuted }}>No shipments yet.</p>}
      {selected && (
        <ShipmentDrawer
          token={token}
          shipmentId={selected}
          canApprove={canApprove}
          onClose={() => setSelected(null)}
          onAssigned={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}
