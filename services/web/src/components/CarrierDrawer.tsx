import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { colors, pill, riskColor, styles } from '../styles';
import type { Carrier, ComplianceSnap } from '../types';
import { Drawer } from './Drawer';

interface Props {
  token: string;
  carrier: Carrier;
  canSeeCompliance: boolean;
  onClose: () => void;
}

export function CarrierDrawer({
  token,
  carrier,
  canSeeCompliance,
  onClose,
}: Props): React.ReactElement {
  const [snap, setSnap] = useState<ComplianceSnap | null | 'missing'>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!canSeeCompliance) {
      setSnap('missing');
      return;
    }
    api<ComplianceSnap>(`/api/v1/carriers/${carrier.id}/compliance`, token)
      .then(setSnap)
      .catch((e) => {
        const msg = (e as Error).message;
        if (msg.includes('404')) setSnap('missing');
        else setErr(msg);
      });
  }, [token, carrier.id, canSeeCompliance]);

  return (
    <Drawer title={carrier.name} onClose={onClose}>
      <div style={{ marginBottom: 16 }}>
        <span style={pill(carrier.active ? colors.success : colors.textMuted)}>
          {carrier.active ? 'active' : 'inactive'}
        </span>
        <span style={{ marginLeft: 8 }}>{carrier.rating.toFixed(1)} ★</span>
      </div>

      {err && <p style={styles.err}>{err}</p>}

      {!canSeeCompliance ? (
        <p style={{ color: colors.textMuted }}>
          Compliance details require admin, broker, or auditor role.
        </p>
      ) : snap === null ? (
        <p>Loading compliance…</p>
      ) : snap === 'missing' ? (
        <p style={{ color: colors.textMuted }}>No compliance snapshot on file for this carrier.</p>
      ) : (
        <>
          <h3 style={styles.h3}>Risk score</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                background: riskColor(snap.riskScore),
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {snap.riskScore.toFixed(2)}
            </div>
            <div style={{ fontSize: 13, color: colors.textDim }}>
              Directive 070 computes this from operating status, safety rating, insurance on file,
              and snapshot staleness.
            </div>
          </div>

          <h3 style={{ ...styles.h3, marginTop: 20 }}>Compliance snapshot</h3>
          <table style={styles.table}>
            <tbody>
              <Row k="DOT #" v={snap.dotNumber ?? '—'} />
              <Row k="Operating status" v={snap.operatingStatus} />
              <Row k="Safety rating" v={snap.safetyRating} />
              <Row k="Insurance on file" v={snap.insuranceOnFile ? '✓ yes' : '✗ no'} />
              <Row k="Snapshot age" v={`${snap.snapshotAgeDays} day(s)`} />
              <Row k="Taken at" v={new Date(snap.snapshotAt).toLocaleString()} />
            </tbody>
          </table>
        </>
      )}
    </Drawer>
  );
}

function Row({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <tr>
      <td style={{ ...styles.td, fontWeight: 600, width: 160 }}>{k}</td>
      <td style={styles.td}>{v}</td>
    </tr>
  );
}
