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

  const total = items?.length ?? 0;
  const activeCount = items?.filter((c) => c.active).length ?? 0;
  const avgRating =
    items && items.length > 0
      ? items.reduce((sum, c) => sum + c.rating, 0) / items.length
      : 0;

  return (
    <>
      <h1 style={styles.h1}>Carriers</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        Carrier network — ratings, active status, and compliance drill-down.
      </p>
      {err && <p style={styles.err}>{err}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <div style={styles.stat}>
          <div style={styles.statLabel}>Total carriers</div>
          <div style={styles.statValue}>{total}</div>
        </div>
        <div style={{ ...styles.stat, borderTop: `3px solid ${colors.success}` }}>
          <div style={styles.statLabel}>Active</div>
          <div style={{ ...styles.statValue, color: colors.success }}>{activeCount}</div>
          <div style={styles.statHint}>
            {total > 0 ? `${Math.round((activeCount / total) * 100)}% of network` : '—'}
          </div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statLabel}>Avg rating</div>
          <div style={styles.statValue}>{total > 0 ? `${avgRating.toFixed(1)} ★` : '—'}</div>
        </div>
      </div>

      <section
        aria-label="Carriers list"
        style={{ ...styles.card, borderLeft: `4px solid ${colors.primary}` }}
      >
        <h3 style={styles.h3}>
          Network
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: colors.textMuted }}>
            {total > 0 ? `${total} carrier${total === 1 ? '' : 's'}` : ''}
          </span>
        </h3>
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
                    <button style={styles.btn} onClick={() => setSelected(c)}>
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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
