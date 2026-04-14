import React, { useState } from 'react';
import { api } from '../api';
import { styles } from '../styles';
import type { User } from '../types';

interface Props {
  onLogin: (token: string, user: User) => void;
}

export function Login({ onLogin }: Props): React.ReactElement {
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
