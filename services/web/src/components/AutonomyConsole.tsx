import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { colors, styles } from '../styles';
import type { ScoringWeights } from '../types';

interface Props {
  token: string;
}

const LEVELS: Array<{
  id: number;
  title: string;
  summary: string;
  graduation: string;
}> = [
  {
    id: 1,
    title: 'Human-in-the-loop',
    summary: 'Agent proposes. Human approves every step before execution.',
    graduation:
      'Move to L2 once automation accuracy ≥ 90% on ≥ 500 historical loads AND operator comfort confirmed.',
  },
  {
    id: 2,
    title: 'Human-on-the-loop',
    summary: 'Agent executes routine. Human reviews batches + approves risky actions.',
    graduation:
      'Move to L3 after 90 days at L2 with < 1% reversal rate AND A/B shows no customer-impacting regressions.',
  },
  {
    id: 3,
    title: 'Conditional autonomy',
    summary: 'Agent acts autonomously within policy; escalates edge cases.',
    graduation:
      'Move to L4 only with customer consent, 6+ months at L3, and sustained confidence > 97%.',
  },
  {
    id: 4,
    title: 'Full autonomy (headless)',
    summary: 'Zero-touch execution. Humans appear only at strategic checkpoints.',
    graduation: 'End state per V5 §13. Available to qualifying brokers from Phase 5–6.',
  },
];

export function AutonomyConsole({ token }: Props): React.ReactElement {
  const [weights, setWeights] = useState<ScoringWeights | null>(null);
  useEffect(() => {
    api<ScoringWeights>('/api/v1/scoring/weights', token)
      .then(setWeights)
      .catch(() => setWeights(null));
  }, [token]);

  return (
    <>
      <h1 style={styles.h1}>Autonomy console</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        Read-only explainer. <b>Per-operation graduation state is not yet persisted</b> — that lands
        in Phase V-2 with the autonomy_levels table and A/B harness.
      </p>

      <div style={styles.card}>
        <h3 style={styles.h3}>Carrier-selection algorithm (current: deterministic v1)</h3>
        {weights ? (
          <>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, marginBottom: 8 }}>
              {weights.formula}
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted }}>
              weights: cost = {weights.weights.cost}, distance = {weights.weights.distance}, rating
              = {weights.weights.rating}
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
              {weights.notes}
            </div>
          </>
        ) : (
          <p>Loading…</p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {LEVELS.map((l) => (
          <div
            key={l.id}
            style={{
              ...styles.card,
              flex: '1 1 260px',
              minWidth: 260,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: colors.primary,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                }}
              >
                {l.id}
              </div>
              <b>{l.title}</b>
            </div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>{l.summary}</div>
            <div
              style={{
                fontSize: 12,
                color: colors.textMuted,
                borderTop: `1px solid ${colors.cardBorder}`,
                paddingTop: 8,
              }}
            >
              <b>Graduation:</b> {l.graduation}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: colors.textMuted }}>
        Framework from V5 Blueprint §6. Each operation type (quoting, dispatch, invoicing) can sit
        at a different level per customer.
      </p>
    </>
  );
}
