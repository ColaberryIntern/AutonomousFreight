import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { colors, pill, relativeTime, styles } from '../styles';

interface Props {
  token: string;
}

interface Agent {
  name: string;
  label: string;
  department: string;
  type: string;
  schedule: string;
  directive: string;
  auditPrefix: string;
  status: string;
  lastRunAt: string | null;
  lastAction: string | null;
  totalRuns: number;
}

interface RunEntry {
  id: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  status: 'success' | 'failed';
}

const DEPT_COLORS: Record<string, { bg: string; light: string; label: string }> = {
  quoting: { bg: '#3B82F6', light: '#DBEAFE', label: 'Quoting' },
  procurement: { bg: '#10B981', light: '#D1FAE5', label: 'Procurement' },
  execution: { bg: '#F59E0B', light: '#FEF3C7', label: 'Execution' },
  documents: { bg: '#8B5CF6', light: '#EDE9FE', label: 'Documents' },
  financials: { bg: '#6366F1', light: '#E0E7FF', label: 'Financials' },
};

const DEPT_ANCHORS: Record<string, { x: number; y: number }> = {
  quoting: { x: 140, y: 120 },
  procurement: { x: 400, y: 80 },
  execution: { x: 660, y: 120 },
  documents: { x: 660, y: 320 },
  financials: { x: 300, y: 380 },
};

const CONTROL_TOWER = { x: 400, y: 220 };
const HITL = { x: 70, y: 40 };
const CANVAS_W = 800;
const CANVAS_H = 500;

function abbrev(name: string): string {
  return name
    .split('_')
    .filter((w) => w !== 'agent')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

function positionAgents(agents: Agent[]): Record<string, { x: number; y: number }> {
  const grouped: Record<string, Agent[]> = {};
  for (const a of agents) {
    (grouped[a.department] ??= []).push(a);
  }
  const pos: Record<string, { x: number; y: number }> = {};
  for (const [dept, list] of Object.entries(grouped)) {
    const anchor = DEPT_ANCHORS[dept];
    if (!anchor) continue;
    list.forEach((agent, i) => {
      const angle = (i / list.length) * Math.PI * 2 - Math.PI / 2;
      const radius = 50 + list.length * 10;
      pos[agent.name] = {
        x: anchor.x + Math.cos(angle) * radius,
        y: anchor.y + Math.sin(angle) * radius,
      };
    });
  }
  return pos;
}

export function AgentsPage({ token }: Props): React.ReactElement {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selected, setSelected] = useState<Agent | null>(null);
  const [runs, setRuns] = useState<RunEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ agents: Agent[] }>('/api/v1/agents', token)
      .then((r) => {
        setAgents(r.agents);
        setPositions(positionAgents(r.agents));
      })
      .catch((e) => setErr(String(e)));
  }, [token]);

  const selectAgent = useCallback(
    async (agent: Agent): Promise<void> => {
      setSelected(agent);
      setRuns(null);
      try {
        const r = await api<{ runs: RunEntry[] }>(
          `/api/v1/agents/${agent.name}/history?limit=15`,
          token,
        );
        setRuns(r.runs);
      } catch {
        setRuns([]);
      }
    },
    [token],
  );

  if (err) return <p style={styles.err}>{err}</p>;
  if (!agents) return <p>Loading agents…</p>;

  const grouped: Record<string, Agent[]> = {};
  for (const a of agents) (grouped[a.department] ??= []).push(a);

  return (
    <>
      <h1 style={styles.h1}>Agent Network</h1>
      <p style={{ fontSize: 13, color: colors.textMuted, marginTop: -8, marginBottom: 16 }}>
        9 named agents executing the V5 canonical lifecycle. Click any node to see run history.
      </p>

      {/* Org Chart Canvas */}
      <div
        style={{
          ...styles.card,
          position: 'relative',
          width: CANVAS_W,
          height: CANVAS_H,
          overflow: 'hidden',
          background: '#fafbfc',
          margin: '0 auto 16px',
        }}
      >
        {/* SVG connections */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          {/* HITL → Control Tower dashed line */}
          <line
            x1={HITL.x}
            y1={HITL.y}
            x2={CONTROL_TOWER.x}
            y2={CONTROL_TOWER.y}
            stroke="#111827"
            strokeWidth={2}
            strokeOpacity={0.2}
            strokeDasharray="6 3"
          />
          {/* Control Tower → each agent */}
          {agents.map((a) => {
            const p = positions[a.name];
            if (!p) return null;
            const dc = DEPT_COLORS[a.department]?.bg ?? '#999';
            return (
              <line
                key={`ct-${a.name}`}
                x1={CONTROL_TOWER.x}
                y1={CONTROL_TOWER.y}
                x2={p.x}
                y2={p.y}
                stroke={dc}
                strokeWidth={1}
                strokeOpacity={0.15}
              />
            );
          })}
          {/* Intra-department rings */}
          {Object.entries(grouped).map(([dept, list]) =>
            list.map((a, i) => {
              const next = list[(i + 1) % list.length];
              if (!next || list.length < 2) return null;
              const p1 = positions[a.name];
              const p2 = positions[next.name];
              if (!p1 || !p2) return null;
              return (
                <line
                  key={`ring-${dept}-${i}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={DEPT_COLORS[dept]?.bg ?? '#999'}
                  strokeWidth={0.8}
                  strokeOpacity={0.15}
                />
              );
            }),
          )}
        </svg>

        {/* Department labels */}
        {Object.entries(DEPT_ANCHORS).map(([dept, anchor]) => {
          const dc = DEPT_COLORS[dept];
          if (!dc) return null;
          return (
            <div
              key={`label-${dept}`}
              style={{
                position: 'absolute',
                left: anchor.x - 40,
                top: anchor.y - 50,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: dc.bg,
                opacity: 0.5,
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              {dc.label}
            </div>
          );
        })}

        {/* HITL node */}
        <div
          style={{
            position: 'absolute',
            left: HITL.x - 36,
            top: HITL.y - 22,
            width: 72,
            height: 44,
            borderRadius: 10,
            background: 'white',
            border: '2px solid #d1d5db',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            fontSize: 10,
            fontWeight: 700,
            color: '#374151',
          }}
        >
          <span style={{ fontSize: 16 }}>👤</span>
          <span>HITL</span>
        </div>

        {/* Control Tower node */}
        <div
          style={{
            position: 'absolute',
            left: CONTROL_TOWER.x - 42,
            top: CONTROL_TOWER.y - 42,
            width: 84,
            height: 84,
            borderRadius: 42,
            background: '#111827',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            cursor: 'default',
          }}
        >
          <span style={{ fontSize: 18 }}>🏯</span>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5 }}>CONTROL</span>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5 }}>TOWER</span>
        </div>

        {/* Agent nodes */}
        {agents.map((a) => {
          const p = positions[a.name];
          if (!p) return null;
          const dc = DEPT_COLORS[a.department];
          const isSelected = selected?.name === a.name;
          return (
            <div
              key={a.name}
              onClick={() => void selectAgent(a)}
              style={{
                position: 'absolute',
                left: p.x - 22,
                top: p.y - 22,
                width: 44,
                height: 44,
                borderRadius: 22,
                background: dc?.bg ?? '#999',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                zIndex: isSelected ? 20 : 5,
                boxShadow: isSelected
                  ? `0 0 0 3px white, 0 0 0 5px ${dc?.bg ?? '#999'}`
                  : '0 2px 6px rgba(0,0,0,0.15)',
                transition: 'box-shadow 0.15s',
              }}
              title={a.label}
            >
              {abbrev(a.name)}
              {/* Status dot */}
              <div
                style={{
                  position: 'absolute',
                  bottom: -1,
                  right: -1,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  background: a.status === 'active' ? '#10B981' : '#9CA3AF',
                  border: '2px solid white',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Agent summary table */}
      <div style={styles.card}>
        <h3 style={styles.h3}>Agent fleet</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Agent</th>
              <th style={styles.th}>Department</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Runs</th>
              <th style={styles.th}>Last active</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const dc = DEPT_COLORS[a.department];
              return (
                <tr key={a.name}>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{a.label}</td>
                  <td style={styles.td}>
                    <span style={pill(dc?.bg ?? '#999')}>{dc?.label ?? a.department}</span>
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: colors.textMuted }}>{a.type}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{a.totalRuns}</td>
                  <td style={{ ...styles.td, fontSize: 12, color: colors.textMuted }}>
                    {a.lastRunAt ? relativeTime(a.lastRunAt) : '—'}
                  </td>
                  <td style={styles.td}>
                    <button style={styles.btnGhost} onClick={() => void selectAgent(a)}>
                      History
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: DEPT_COLORS[selected.department]?.bg ?? '#999',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {abbrev(selected.name)}
            </div>
            <div>
              <div style={{ fontWeight: 700 }}>{selected.label}</div>
              <div style={{ fontSize: 12, color: colors.textMuted }}>
                {selected.schedule} · Directive {selected.directive}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <button style={styles.btnGhost} onClick={() => setSelected(null)}>
              Close
            </button>
          </div>

          <h3 style={styles.h3}>Run history</h3>
          {runs === null ? (
            <p>Loading…</p>
          ) : runs.length === 0 ? (
            <p style={{ color: colors.textMuted, fontSize: 13 }}>No runs recorded yet.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Target</th>
                  <th style={styles.th}>Details</th>
                  <th style={styles.th}>When</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    style={{
                      background: r.status === 'failed' ? '#fef2f2' : undefined,
                    }}
                  >
                    <td style={styles.td}>
                      <span style={pill(r.status === 'success' ? colors.success : colors.danger)}>
                        {r.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <code style={{ fontSize: 11 }}>{r.action}</code>
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: 11,
                      }}
                    >
                      {r.target ? `${r.target.slice(0, 8)}…` : '—'}
                    </td>
                    <td
                      style={{ ...styles.td, fontSize: 11, color: colors.textDim, maxWidth: 300 }}
                    >
                      {Object.keys(r.metadata).length > 0
                        ? JSON.stringify(r.metadata).slice(0, 150)
                        : '—'}
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        color: colors.textMuted,
                        fontSize: 11,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {relativeTime(r.occurredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
