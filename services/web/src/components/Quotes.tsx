import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { colors, pill, relativeTime, styles } from '../styles';
import type { Rfq, RfqStatus } from '../types';

interface Props {
  token: string;
  canApprove: boolean;
}

const STATUS_COLOR: Record<RfqStatus, string> = {
  received: 'var(--idle)',
  parsed: 'var(--cat1)',
  priced: 'var(--cat4)',
  sent: colors.warn,
  won: colors.success,
  lost: colors.textMuted,
  exception: colors.danger,
};

export function Quotes({ token, canApprove }: Props): React.ReactElement {
  const [items, setItems] = useState<Rfq[] | null>(null);
  const [filter, setFilter] = useState<RfqStatus | 'all'>('all');
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const qs = filter === 'all' ? '' : `?status=${filter}`;
      const r = await api<{ items: Rfq[] }>(`/api/v1/rfqs${qs}`, token);
      setItems(r.items);
    } catch (e) {
      setErr(String(e));
    }
  }, [token, filter]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  async function submitNew(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setCreating(true);
    try {
      await api('/api/v1/rfqs', token, {
        method: 'POST',
        body: JSON.stringify({
          customer: String(f.get('customer')),
          origin: String(f.get('origin')),
          destination: String(f.get('destination')),
          distanceMiles: Number(f.get('distanceMiles')),
          equipmentType: String(f.get('equipmentType')),
          pickupDate: String(f.get('pickupDate')),
        }),
      });
      e.currentTarget.reset();
      await load();
    } catch (err) {
      setErr(String(err));
    } finally {
      setCreating(false);
    }
  }

  async function runAgent(id: string): Promise<void> {
    setBusy(id);
    try {
      await api(`/api/v1/rfqs/${id}/run-agent`, token, { method: 'POST' });
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function respond(id: string, outcome: 'won' | 'lost'): Promise<void> {
    setBusy(id);
    try {
      await api(`/api/v1/rfqs/${id}/respond`, token, {
        method: 'POST',
        body: JSON.stringify({ outcome }),
      });
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function override(id: string, action: 'send' | 'kill'): Promise<void> {
    setBusy(id);
    try {
      await api(`/api/v1/rfqs/${id}/override`, token, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h1 style={styles.h1}>Quotes</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        RFQs flow through the Quoting Agent: <code>received → parsed → priced → sent</code>.
        High-confidence prices auto-send; low-confidence land in <b>exception</b> for human
        override. Won RFQs materialize into shipments visible in the Queue.
      </p>

      {canApprove && (
        <div style={styles.card}>
          <h3 style={styles.h3}>Submit a new RFQ</h3>
          <form
            onSubmit={submitNew}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}
          >
            <input
              name="customer"
              placeholder="Customer"
              required
              style={styles.input}
              defaultValue="ACME Logistics"
            />
            <input
              name="origin"
              placeholder="Origin (e.g. Dallas, TX)"
              required
              style={styles.input}
              defaultValue="Dallas, TX"
            />
            <input
              name="destination"
              placeholder="Destination"
              required
              style={styles.input}
              defaultValue="Chicago, IL"
            />
            <input
              name="distanceMiles"
              type="number"
              min="1"
              max="5000"
              placeholder="Miles"
              required
              style={styles.input}
              defaultValue="920"
            />
            <select name="equipmentType" required style={styles.input} defaultValue="dry_van">
              <option value="dry_van">Dry van</option>
              <option value="reefer">Reefer</option>
              <option value="flatbed">Flatbed</option>
            </select>
            <input
              name="pickupDate"
              type="date"
              required
              style={styles.input}
              defaultValue="2026-05-01"
            />
            <button
              type="submit"
              style={{ ...styles.btn, gridColumn: 'span 3' }}
              disabled={creating}
            >
              {creating ? 'Submitting…' : 'Submit RFQ'}
            </button>
          </form>
        </div>
      )}

      {err && <p style={styles.err}>{err}</p>}

      <div style={styles.card}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {(
            ['all', 'received', 'parsed', 'priced', 'sent', 'won', 'lost', 'exception'] as Array<
              RfqStatus | 'all'
            >
          ).map((s) => (
            <button
              key={s}
              style={{
                ...styles.btnGhost,
                ...(filter === s ? { background: colors.primary, color: 'white' } : {}),
              }}
              onClick={() => setFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>

        {items === null ? (
          <p>Loading…</p>
        ) : items.length === 0 ? (
          <p style={{ color: colors.textMuted }}>No RFQs match.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Customer</th>
                <th style={styles.th}>Lane</th>
                <th style={styles.th}>Equip</th>
                <th style={styles.th}>Price</th>
                <th style={styles.th}>Conf</th>
                <th style={styles.th}>Age</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td style={styles.td}>
                    <span style={pill(STATUS_COLOR[r.status])}>{r.status}</span>
                  </td>
                  <td style={styles.td}>{r.customer}</td>
                  <td style={styles.td}>
                    {r.origin} → {r.destination}
                    <div style={{ fontSize: 11, color: colors.textMuted }}>
                      {r.distanceMiles.toLocaleString()} mi · pickup {r.pickupDate}
                    </div>
                  </td>
                  <td style={styles.td}>{r.equipmentType.replace('_', ' ')}</td>
                  <td style={styles.td}>
                    {r.priceOfferedUsd !== null ? `$${r.priceOfferedUsd.toLocaleString()}` : '—'}
                  </td>
                  <td style={styles.td}>{r.confidence !== null ? r.confidence.toFixed(2) : '—'}</td>
                  <td style={{ ...styles.td, color: colors.textMuted, fontSize: 12 }}>
                    {relativeTime(r.createdAt)}
                  </td>
                  <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                    {canApprove && (r.status === 'received' || r.status === 'parsed') && (
                      <button
                        style={styles.btnGhost}
                        disabled={busy === r.id}
                        onClick={() => void runAgent(r.id)}
                      >
                        Run agent
                      </button>
                    )}
                    {canApprove && r.status === 'sent' && (
                      <>
                        <button
                          style={styles.btn}
                          disabled={busy === r.id}
                          onClick={() => void respond(r.id, 'won')}
                        >
                          Won
                        </button>{' '}
                        <button
                          style={styles.btnGhost}
                          disabled={busy === r.id}
                          onClick={() => void respond(r.id, 'lost')}
                        >
                          Lost
                        </button>
                      </>
                    )}
                    {canApprove && r.status === 'exception' && (
                      <>
                        <button
                          style={styles.btn}
                          disabled={busy === r.id}
                          onClick={() => void override(r.id, 'send')}
                        >
                          Send anyway
                        </button>{' '}
                        <button
                          style={styles.btnGhost}
                          disabled={busy === r.id}
                          onClick={() => void override(r.id, 'kill')}
                        >
                          Kill
                        </button>
                      </>
                    )}
                    {r.shipmentId && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: colors.textMuted }}>
                        ↳ shipment {r.shipmentId.slice(0, 8)}…
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ fontSize: 12, color: colors.textMuted }}>
        Polling every 4s. Quoting Agent runs server-side every 5s. Directives 200 + V5 §2/§5.
      </p>
    </>
  );
}
