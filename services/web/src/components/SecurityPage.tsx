import React, { useEffect, useState } from 'react';
import { colors, pill, styles, relativeTime } from '../styles';

interface SecurityKpis {
  mfaAdoptionPct: number;
  loginFailures24h: number;
  loginSuccesses24h: number;
  gateHardBlocks7d: number;
  gateSoftOverrides7d: number;
  agentExceptions24h: number;
  totalUsers: number;
  mfaEnabledUsers: number;
}

interface TrendAlert {
  metric: string;
  currentHour: number;
  avgPrior: number;
  severity: 'warning' | 'critical';
}

interface AuditEvent {
  id: string;
  action: string;
  target?: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

async function api<T>(path: string, token: string): Promise<T> {
  const r = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}

export function SecurityPage({ token }: { token: string }): React.ReactElement {
  const [kpis, setKpis] = useState<SecurityKpis | null>(null);
  const [alerts, setAlerts] = useState<TrendAlert[]>([]);
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const [k, t, e] = await Promise.all([
          api<SecurityKpis>('/api/v1/security/kpis', token),
          api<{ alerts: TrendAlert[] }>('/api/v1/security/trends', token),
          api<{ items: AuditEvent[] }>('/api/v1/audit/logs?limit=10&action=auth.login.failure', token),
        ]);
        if (cancelled) return;
        setKpis(k);
        setAlerts(t.alerts);
        setRecentEvents(e.items);
      } catch {
        // non-admin users won't have access — leave empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  return (
    <>
      <h1 style={styles.h1}>Security & Penetration Testing</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        Security posture, KPIs, trend alerts, and test suite status.
      </p>

      {/* Live KPI cards */}
      {kpis && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <KpiCard label="MFA adoption" value={`${kpis.mfaAdoptionPct}%`} hint={`${kpis.mfaEnabledUsers} / ${kpis.totalUsers} users`} color={kpis.mfaAdoptionPct >= 80 ? colors.success : kpis.mfaAdoptionPct >= 50 ? colors.warn : colors.danger} />
          <KpiCard label="Login failures (24h)" value={String(kpis.loginFailures24h)} hint={`${kpis.loginSuccesses24h} successes`} color={kpis.loginFailures24h > 10 ? colors.danger : kpis.loginFailures24h > 3 ? colors.warn : colors.success} />
          <KpiCard label="Gate hard blocks (7d)" value={String(kpis.gateHardBlocks7d)} color={kpis.gateHardBlocks7d > 0 ? colors.warn : colors.success} />
          <KpiCard label="Gate overrides (7d)" value={String(kpis.gateSoftOverrides7d)} color={kpis.gateSoftOverrides7d > 5 ? colors.danger : colors.success} />
          <KpiCard label="Agent exceptions (24h)" value={String(kpis.agentExceptions24h)} color={kpis.agentExceptions24h > 0 ? colors.warn : colors.success} />
        </div>
      )}

      {loading && !kpis && (
        <div style={{ ...styles.card, textAlign: 'center' as const, color: colors.textMuted, fontSize: 13 }}>
          Loading security metrics...
        </div>
      )}

      {/* Trend alerts */}
      {alerts.length > 0 && (
        <div style={{ ...styles.card, borderLeft: `4px solid ${colors.danger}`, marginBottom: 16 }}>
          <h3 style={styles.h3}>Trend alerts</h3>
          {alerts.map((a, i) => (
            <div key={i} style={{ padding: '6px 0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={pill(a.severity === 'critical' ? colors.danger : colors.warn)}>
                {a.severity}
              </span>
              <span>
                <strong>{a.metric}</strong>: {a.currentHour} this hour vs {a.avgPrior} avg prior
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Recent failed logins */}
      {recentEvents.length > 0 && (
        <div style={{ ...styles.card, marginBottom: 16 }}>
          <h3 style={styles.h3}>Recent failed logins</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((ev) => (
                <tr key={ev.id}>
                  <td style={{ ...styles.td, fontSize: 12 }}>{relativeTime(ev.occurredAt)}</td>
                  <td style={{ ...styles.td, fontSize: 12 }}>{String(ev.metadata?.['email'] ?? '—')}</td>
                  <td style={{ ...styles.td, fontSize: 12 }}>{String(ev.metadata?.['reason'] ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Existing security controls table */}
      <div style={styles.card}>
        <h3 style={styles.h3}>Security controls</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Control</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {[
              [
                'Authentication',
                'Active',
                'JWT with 15-min expiry + bcrypt cost-12 password hashing',
              ],
              ['RBAC', 'Active', '4 roles (admin/broker/carrier/auditor), enforced on every route'],
              ['MFA (TOTP)', 'Active', 'AES-256-GCM encrypted secrets, 30s window, otplib v12'],
              [
                'Input validation',
                'Active',
                'Zod schemas on every POST endpoint (36 validation points)',
              ],
              [
                'Compliance gates',
                'Active',
                'Hard/soft gates block unsafe carrier assignments (directive 201)',
              ],
              [
                'Audit trail',
                'Active',
                'Immutable append-only log with auth event tracking',
              ],
              [
                'Token revocation',
                'Built',
                'revoked_tokens table + RevocationRepository (middleware wiring in V-2)',
              ],
              [
                'nginx security headers',
                'Active',
                'X-Frame-Options DENY, X-Content-Type nosniff, Referrer-Policy strict',
              ],
              ['/metrics blocked', 'Active', 'Prometheus endpoint returns 404 at edge (nginx)'],
              [
                'Secrets management',
                'Active',
                '.env gitignored, chmod 600 on VPS, never committed',
              ],
              [
                'Non-root container',
                'Active',
                'Dockerfile: USER 1000, read-only filesystem in K8s manifests',
              ],
              ['Rate limiting', 'Active', '120 req/min per IP, exempt /health + /metrics'],
            ].map(([control, status, detail]) => (
              <tr key={control}>
                <td style={{ ...styles.td, fontWeight: 600 }}>{control}</td>
                <td style={styles.td}>
                  <span style={pill(status === 'Active' ? colors.success : colors.warn)}>
                    {status}
                  </span>
                </td>
                <td style={{ ...styles.td, fontSize: 12, color: colors.textDim }}>{detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ ...styles.card, flex: 1, minWidth: 300 }}>
          <h3 style={styles.h3}>OWASP ZAP baseline scan</h3>
          <p style={{ fontSize: 13, color: colors.textDim }}>
            Automated penetration test via <code>security/zap-baseline.sh</code>. Runs ZAP in Docker
            against a non-production target.
          </p>
          <table style={styles.table}>
            <tbody>
              <tr>
                <td style={{ ...styles.td, fontWeight: 600 }}>Script</td>
                <td style={{ ...styles.td, fontSize: 12 }}>
                  <code>bash security/zap-baseline.sh</code>
                </td>
              </tr>
              <tr>
                <td style={{ ...styles.td, fontWeight: 600 }}>Allowlist</td>
                <td style={{ ...styles.td, fontSize: 12 }}>
                  <code>security/zap-rules.tsv</code> (CSP + Permissions-Policy triaged)
                </td>
              </tr>
              <tr>
                <td style={{ ...styles.td, fontWeight: 600 }}>Safety</td>
                <td style={{ ...styles.td, fontSize: 12 }}>
                  Refuses to scan production-looking URLs
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ ...styles.card, flex: 1, minWidth: 300 }}>
          <h3 style={styles.h3}>Test suite</h3>
          <table style={styles.table}>
            <tbody>
              {[
                ['Unit tests', '163', 'Domain logic, scoring, gates, pricing, anomaly, encryption'],
                [
                  'Integration tests',
                  '55',
                  'Full HTTP lifecycle, RBAC, gates, RFQ pipeline, cockpit',
                ],
                ['E2E smoke tests', '2', 'Register → login → carrier-select → openapi'],
                ['Acceptance tests', '41', 'scripts/e2e-acceptance.sh — 41/41 passed'],
                ['Load tests', '2 scripts', 'k6: register + select-carrier with NFR thresholds'],
              ].map(([name, count, detail]) => (
                <tr key={name}>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{name}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{count}</td>
                  <td style={{ ...styles.td, fontSize: 12, color: colors.textMuted }}>{detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...styles.card, background: '#f8fafc' }}>
        <h3 style={styles.h3}>HTTP status codes in use (error handling)</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['200', 'OK', colors.success],
            ['201', 'Created', colors.success],
            ['400', 'Bad Request', colors.warn],
            ['401', 'Unauthorized', colors.warn],
            ['403', 'Forbidden', colors.warn],
            ['404', 'Not Found', colors.warn],
            ['409', 'Conflict', colors.warn],
            ['422', 'Compliance Block', colors.danger],
            ['500', 'Server Error', colors.danger],
          ].map(([code, label, color]) => (
            <div
              key={code}
              style={{
                ...styles.stat,
                minWidth: 100,
                textAlign: 'center' as const,
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 700, color }}>{code}</div>
              <div style={{ fontSize: 11, color: colors.textMuted }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.h3}>DR readiness</h3>
        <table style={styles.table}>
          <tbody>
            {[
              ['RTO target', '≤ 1 hour'],
              ['RPO target', '≤ 15 minutes'],
              ['DR drill script', 'infra/dr/drill.sh (snapshot → restart → restore → smoke test)'],
              ['DR runbook', 'infra/dr/runbook.md (7-step procedure + rollback)'],
              ['Drill safety', 'Refuses to run in NODE_ENV=production'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ ...styles.td, fontWeight: 600, width: 160 }}>{k}</td>
                <td style={{ ...styles.td, fontSize: 13 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function KpiCard({ label, value, hint, color }: { label: string; value: string; hint?: string; color: string }): React.ReactElement {
  return (
    <div style={{ ...styles.stat, borderTop: `3px solid ${color}` }}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
      {hint && <div style={styles.statHint}>{hint}</div>}
    </div>
  );
}
