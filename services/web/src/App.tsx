import React, { useState } from 'react';

const API_URL =
  (import.meta as unknown as { env: { VITE_API_URL?: string } }).env.VITE_API_URL ??
  'http://localhost:3000';

interface Me {
  user: { userId: string; email: string; roles: string[] };
}

export function App(): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me['user'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    });
    if (!res.ok) {
      setError(`Login failed (${res.status})`);
      return;
    }
    const body = (await res.json()) as { accessToken: string };
    setToken(body.accessToken);
    const meRes = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${body.accessToken}` },
    });
    if (meRes.ok) {
      const meBody = (await meRes.json()) as Me;
      setMe(meBody.user);
    }
  }

  if (token && me) {
    return (
      <main style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 720 }}>
        <h1>Autonomous Freight</h1>
        <p>
          Logged in as <strong>{me.email}</strong> ({me.roles.join(', ')})
        </p>
        <p>Dashboard placeholder — Sprint 17 UAT shell.</p>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 480 }}>
      <h1>Autonomous Freight — Sign in</h1>
      <form onSubmit={handleLogin}>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Email
          <input name="email" type="email" required style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Password
          <input name="password" type="password" required style={{ width: '100%' }} />
        </label>
        <button type="submit">Sign in</button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </main>
  );
}
