import React, { useCallback, useEffect, useState } from 'react';

const API_URL =
  (import.meta as unknown as { env: { VITE_API_URL?: string } }).env.VITE_API_URL ?? '';

interface User {
  userId: string;
  email: string;
  roles: string[];
}
interface Shipment {
  id: string;
  origin: string;
  destination: string;
  distanceMiles: number;
  status: string;
}
interface Carrier {
  id: string;
  name: string;
  rating: number;
  active: boolean;
}
interface Ranking {
  carrierId: string;
  carrierName: string;
  rating: number;
  costUsd: number;
  pickupDistanceMiles: number;
  score: number;
}
interface ComplianceSnap {
  carrierId: string;
  dotNumber?: string;
  operatingStatus: string;
  safetyRating: string;
  insuranceOnFile: boolean;
  snapshotAgeDays: number;
  riskScore: number;
  snapshotAt: string;
}

type View = 'home' | 'shipments' | 'carriers';

const styles: Record<string, React.CSSProperties> = {
  body: { fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0, color: '#1a1a1a' },
  nav: {
    background: '#0f172a',
    color: 'white',
    padding: '12px 24px',
    display: 'flex',
    gap: 16,
    alignItems: 'center',
  },
  navBrand: { fontWeight: 700, fontSize: 18 },
  navLink: {
    background: 'transparent',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    padding: '6px 12px',
    borderRadius: 4,
    fontSize: 14,
  },
  navLinkActive: { background: '#1e293b' },
  spacer: { flex: 1 },
  user: { fontSize: 13, opacity: 0.9 },
  logout: {
    background: '#334155',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    padding: '6px 12px',
    borderRadius: 4,
    fontSize: 13,
  },
  main: { padding: 24, maxWidth: 1100, margin: '0 auto' },
  card: {
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  h1: { margin: '0 0 16px', fontSize: 24 },
  h2: { margin: '0 0 12px', fontSize: 18 },
  h3: { margin: '0 0 8px', fontSize: 15, color: '#475569' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th: { textAlign: 'left' as const, padding: '8px 10px', background: '#f1f5f9', fontWeight: 600 },
  td: { padding: '8px 10px', borderTop: '1px solid #e2e8f0' },
  btn: {
    background: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  btnGhost: {
    background: 'white',
    color: '#2563eb',
    border: '1px solid #2563eb',
    padding: '6px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  err: { color: 'crimson', margin: '8px 0', fontSize: 13 },
  loginWrap: { maxWidth: 380, margin: '80px auto', padding: 24 },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #cbd5e1',
    borderRadius: 4,
    fontSize: 14,
    boxSizing: 'border-box' as const,
  },
  label: { display: 'block', marginBottom: 12, fontSize: 13, color: '#475569' },
};

function pill(bg: string, fg = 'white'): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    background: bg,
    color: fg,
  };
}

async function api<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

function riskColor(score: number): string {
  if (score < 0.3) return '#16a34a';
  if (score < 0.6) return '#f59e0b';
  return '#dc2626';
}

function Login({ onLogin }: { onLogin: (token: string, user: User) => void }): React.ReactElement {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      const body = await api<{ accessToken: string }>('/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
      });
      const me = await api<{ user: User }>('/me', body.accessToken);
      onLogin(body.accessToken, me.user);
    } catch (e) {
      setErr(`Login failed (${(e as Error).message})`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.loginWrap}>
      <h1 style={styles.h1}>Autonomous Freight</h1>
      <div style={styles.card}>
        <form onSubmit={submit}>
          <label style={styles.label}>
            Email
            <input
              name="email"
              type="email"
              required
              style={styles.input}
              defaultValue="smoke@af.test"
            />
          </label>
          <label style={styles.label}>
            Password
            <input
              name="password"
              type="password"
              required
              style={styles.input}
              defaultValue="GoodPassword99"
            />
          </label>
          <button type="submit" disabled={busy} style={styles.btn}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {err && <p style={styles.err}>{err}</p>}
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 16 }}>
            Demo credentials pre-filled. Admin: <code>tour-admin@af.test</code> /{' '}
            <code>AdminPassword99</code>.
          </p>
        </form>
      </div>
    </div>
  );
}

function Home({ user }: { user: User }): React.ReactElement {
  return (
    <div style={styles.card}>
      <h2 style={styles.h2}>Welcome, {user.email}</h2>
      <div style={{ fontSize: 13, color: '#475569' }}>
        Role(s):{' '}
        {user.roles.map((r) => (
          <span key={r} style={{ ...pill('#1e293b'), marginLeft: 4 }}>
            {r}
          </span>
        ))}
      </div>
      <p style={{ marginTop: 16, fontSize: 14 }}>
        This UAT shell exposes the headline features built across Sprints 0–18. Click{' '}
        <b>Shipments</b> to see the carrier-ranking engine (directive 030), or <b>Carriers</b> to
        see the compliance risk scorer (directive 070).
      </p>
      <p style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
        Full interactive API:{' '}
        <a href="/docs" target="_blank">
          /docs
        </a>{' '}
        · Contract:{' '}
        <a href="/openapi.json" target="_blank">
          /openapi.json
        </a>
      </p>
    </div>
  );
}

function Shipments({ token }: { token: string }): React.ReactElement {
  const [items, setItems] = useState<Shipment[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rankings, setRankings] = useState<Ranking[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: Shipment[] }>('/api/v1/shipments', token)
      .then((r) => setItems(r.items))
      .catch((e) => setErr(String(e)));
  }, [token]);

  const rank = useCallback(
    async (id: string): Promise<void> => {
      setSelected(id);
      setRankings(null);
      setErr(null);
      try {
        const r = await api<{ rankings: Ranking[] }>(
          `/api/v1/shipments/${id}/select-carrier?top=5`,
          token,
          { method: 'POST' },
        );
        setRankings(r.rankings);
      } catch (e) {
        setErr(`Ranking failed: ${(e as Error).message}`);
      }
    },
    [token],
  );

  return (
    <>
      <div style={styles.card}>
        <h2 style={styles.h2}>Shipments</h2>
        {err && <p style={styles.err}>{err}</p>}
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
                    <span style={pill(s.status === 'quoting' ? '#16a34a' : '#64748b')}>
                      {s.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button
                      style={s.status === 'quoting' ? styles.btn : styles.btnGhost}
                      disabled={s.status !== 'quoting'}
                      onClick={() => void rank(s.id)}
                    >
                      Rank carriers
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div style={styles.card}>
          <h3 style={styles.h3}>Carrier ranking · shipment {selected.slice(0, 8)}…</h3>
          {rankings === null ? (
            <p>Scoring…</p>
          ) : rankings.length === 0 ? (
            <p style={{ color: '#64748b' }}>No active bids on this shipment.</p>
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
                </tr>
              </thead>
              <tbody>
                {rankings.map((r, i) => (
                  <tr key={r.carrierId}>
                    <td style={styles.td}>{i + 1}</td>
                    <td style={styles.td}>{r.carrierName}</td>
                    <td style={styles.td}>{r.rating.toFixed(1)} ★</td>
                    <td style={styles.td}>${r.costUsd.toLocaleString()}</td>
                    <td style={styles.td}>{r.pickupDistanceMiles} mi</td>
                    <td style={styles.td}>
                      <b>{r.score.toFixed(3)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>
            Score = 0.4·cost + 0.3·distance + 0.3·rating · directive 030 · pure-deterministic
            (Sprint 3)
          </p>
        </div>
      )}
    </>
  );
}

function Carriers({ token, user }: { token: string; user: User }): React.ReactElement {
  const [items, setItems] = useState<Carrier[] | null>(null);
  const [compliance, setCompliance] = useState<Record<string, ComplianceSnap | 'err'>>({});
  const [err, setErr] = useState<string | null>(null);
  const canSeeCompliance = user.roles.some((r) => ['admin', 'broker', 'auditor'].includes(r));

  useEffect(() => {
    api<{ items: Carrier[] }>('/api/v1/carriers?active=false', token)
      .then((r) => {
        setItems(r.items);
        if (canSeeCompliance) {
          for (const c of r.items) {
            api<ComplianceSnap>(`/api/v1/carriers/${c.id}/compliance`, token)
              .then((snap) => setCompliance((prev) => ({ ...prev, [c.id]: snap })))
              .catch(() => setCompliance((prev) => ({ ...prev, [c.id]: 'err' })));
          }
        }
      })
      .catch((e) => setErr(String(e)));
  }, [token, canSeeCompliance]);

  return (
    <div style={styles.card}>
      <h2 style={styles.h2}>Carriers</h2>
      {err && <p style={styles.err}>{err}</p>}
      {items === null ? (
        <p>Loading…</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Rating</th>
              <th style={styles.th}>Status</th>
              {canSeeCompliance && <th style={styles.th}>DOT #</th>}
              {canSeeCompliance && <th style={styles.th}>Safety</th>}
              {canSeeCompliance && <th style={styles.th}>Insurance</th>}
              {canSeeCompliance && <th style={styles.th}>Risk</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const snap = compliance[c.id];
              const haveSnap = snap && snap !== 'err';
              return (
                <tr key={c.id}>
                  <td style={styles.td}>
                    <b>{c.name}</b>
                  </td>
                  <td style={styles.td}>{c.rating.toFixed(1)} ★</td>
                  <td style={styles.td}>
                    <span style={pill(c.active ? '#16a34a' : '#64748b')}>
                      {c.active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  {canSeeCompliance && (
                    <td
                      style={{ ...styles.td, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                    >
                      {haveSnap ? (snap.dotNumber ?? '—') : '—'}
                    </td>
                  )}
                  {canSeeCompliance && (
                    <td style={styles.td}>{haveSnap ? snap.safetyRating : '—'}</td>
                  )}
                  {canSeeCompliance && (
                    <td style={styles.td}>{haveSnap ? (snap.insuranceOnFile ? '✓' : '✗') : '—'}</td>
                  )}
                  {canSeeCompliance && (
                    <td style={styles.td}>
                      {haveSnap ? (
                        <span style={pill(riskColor(snap.riskScore))}>
                          {snap.riskScore.toFixed(2)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>
        Risk score per directive 070 · pure function of operating status + safety rating + insurance
        + snapshot age (Sprint 7)
      </p>
    </div>
  );
}

export function App(): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>('home');

  if (!token || !user) {
    return (
      <div style={styles.body}>
        <Login
          onLogin={(t, u) => {
            setToken(t);
            setUser(u);
          }}
        />
      </div>
    );
  }

  const navBtn = (v: View, label: string): React.ReactElement => (
    <button
      style={{ ...styles.navLink, ...(view === v ? styles.navLinkActive : {}) }}
      onClick={() => setView(v)}
    >
      {label}
    </button>
  );

  return (
    <div style={styles.body}>
      <nav style={styles.nav}>
        <span style={styles.navBrand}>Autonomous Freight</span>
        {navBtn('home', 'Home')}
        {navBtn('shipments', 'Shipments')}
        {navBtn('carriers', 'Carriers')}
        <span style={styles.spacer} />
        <span style={styles.user}>{user.email}</span>
        <button
          style={styles.logout}
          onClick={() => {
            setToken(null);
            setUser(null);
          }}
        >
          Log out
        </button>
      </nav>
      <main style={styles.main}>
        {view === 'home' && <Home user={user} />}
        {view === 'shipments' && <Shipments token={token} />}
        {view === 'carriers' && <Carriers token={token} user={user} />}
      </main>
    </div>
  );
}
