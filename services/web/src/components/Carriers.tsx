import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { colors, pill, styles } from '../styles';
import type { Carrier } from '../types';
import { CarrierDrawer } from './CarrierDrawer';

interface Props {
  token: string;
  canSeeCompliance: boolean;
}

export function Carriers({ token, canSeeCompliance }: Props): React.ReactElement {
  const [items, setItems] = useState<Carrier[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Carrier | null>(null);

  useEffect(() => {
    api<{ items: Carrier[] }>('/api/v1/carriers?active=false', token)
      .then((r) => setItems(r.items))
      .catch((e) => setErr(String(e)));
  }, [token]);

  return (
    <>
      <h1 style={styles.h1}>Carriers</h1>
      {err && <p style={styles.err}>{err}</p>}
      <div style={styles.card}>
        {items === null ? (
          <p>Loading…</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Rating</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td style={styles.td}>
                    <b>{c.name}</b>
                  </td>
                  <td style={styles.td}>{c.rating.toFixed(1)} ★</td>
                  <td style={styles.td}>
                    <span style={pill(c.active ? colors.success : colors.textMuted)}>
                      {c.active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button style={styles.btnGhost} onClick={() => setSelected(c)}>
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <CarrierDrawer
          token={token}
          carrier={selected}
          canSeeCompliance={canSeeCompliance}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
