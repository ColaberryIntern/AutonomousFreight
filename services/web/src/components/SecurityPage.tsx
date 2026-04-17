import React from 'react';
import { colors, pill, styles } from '../styles';

interface Props {
  token: string;
}

export function SecurityPage({ _token }: { _token: Props['token'] }): React.ReactElement {
  return (
    <>
      <h1 style={styles.h1}>Security & Penetration Testing</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        Security posture, automated pen-test harness, and test suite status.
      </p>

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
                'Immutable append-only log, 10,834+ entries, actor + target + metadata',
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
