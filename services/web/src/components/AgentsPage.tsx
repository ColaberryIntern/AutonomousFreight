import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const DEPT_COLORS: Record<string, { bg: string; label: string }> = {
  quoting: { bg: '#3B82F6', label: 'Quoting' },
  procurement: { bg: '#10B981', label: 'Procurement' },
  execution: { bg: '#F59E0B', label: 'Execution' },
  documents: { bg: '#8B5CF6', label: 'Documents' },
  financials: { bg: '#6366F1', label: 'Financials' },
};

const AGENT_DESC: Record<string, string> = {
  quoting_agent:
    'Prices incoming RFQs using deterministic formula (base_per_mile × distance + accessorial). Auto-sends quotes when confidence ≥ 0.85; routes low-confidence quotes to human exception queue.',
  procurement_agent:
    'Monitors shipments in quoting status with carrier bids. Runs compliance gate evaluation + carrier ranking. Auto-assigns when gate passes AND score ≥ 0.7; escalates to queue otherwise.',
  tracking_agent:
    'Simulates shipment milestones for assigned loads: carrier_confirmed → picked_up → in_transit → approaching → delivered. Each milestone updates shipment status and emits audit events.',
  document_agent:
    'Validates BOL documents on delivered shipments using regex field extraction (BOL number, date, freight class). Transitions to doc_verified on success; raises exception on extraction failure.',
  rate_audit_agent:
    'Compares carrier bid cost against RFQ quote price on doc_verified shipments. Passes if margin ≥ 5%; flags rate_audit_exception for human review on thin or negative margins.',
  invoice_agent:
    'Generates sequential invoices (AF-INV-NNNN) for rate_audited shipments with full financial breakdown: customer amount, carrier cost, margin USD, margin %. Transitions shipment to invoiced.',
  payment_match_agent:
    'Three-way match on paid invoices: verifies amount > 0, carrier cost > 0, and BOL document exists. Creates dispute row on match failure; advances to matched on success.',
  settlement_agent:
    'Creates carrier payment settlement rows for matched invoices. Records carrier ID, payment amount, and transitions both invoice and shipment to settled (terminal state).',
  dispute_agent:
    'Auto-resolves disputes where discrepancy < 5% of invoice amount. Flags larger discrepancies for human (HITL) review. Resolved disputes re-enter the match pipeline.',
};

const DEPT_ANCHORS: Record<string, { x: number; y: number }> = {
  quoting: { x: 140, y: 140 },
  procurement: { x: 400, y: 80 },
  execution: { x: 660, y: 140 },
  documents: { x: 660, y: 340 },
  financials: { x: 300, y: 400 },
};
const CT = { x: 400, y: 240 };
const HITL_POS = { x: 70, y: 45 };
const W = 800;
const H = 520;

function abbr(name: string): string {
  return name
    .split('_')
    .filter((w) => w !== 'agent')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

type Pos = Record<string, { x: number; y: number }>;

function homePositions(agents: Agent[]): Pos {
  const grouped: Record<string, Agent[]> = {};
  for (const a of agents) (grouped[a.department] ??= []).push(a);
  const pos: Pos = {};
  for (const [dept, list] of Object.entries(grouped)) {
    const anchor = DEPT_ANCHORS[dept];
    if (!anchor) continue;
    list.forEach((a, i) => {
      const angle = (i / list.length) * Math.PI * 2 - Math.PI / 2;
      const r = 50 + list.length * 10;
      pos[a.name] = {
        x: anchor.x + Math.cos(angle) * r,
        y: anchor.y + Math.sin(angle) * r,
      };
    });
  }
  return pos;
}

export function AgentsPage({ token }: Props): React.ReactElement {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [positions, setPositions] = useState<Pos>({});
  const homeRef = useRef<Pos>({});
  const [selected, setSelected] = useState<Agent | null>(null);
  const [historyAgent, setHistoryAgent] = useState<Agent | null>(null);
  const [runs, setRuns] = useState<RunEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ agents: Agent[] }>('/api/v1/agents', token)
      .then((r) => {
        setAgents(r.agents);
        const hp = homePositions(r.agents);
        homeRef.current = hp;
        setPositions({ ...hp });
      })
      .catch((e) => setErr(String(e)));
  }, [token]);

  // Drag: same-dept agents follow at 3% per 25ms
  useEffect(() => {
    if (!dragging || !agents) return;
    const dept = agents.find((a) => a.name === dragging)?.department;
    if (!dept) return;
    const mates = agents.filter((a) => a.department === dept && a.name !== dragging);
    const iv = setInterval(() => {
      setPositions((prev) => {
        const dp = prev[dragging];
        if (!dp) return prev;
        const next = { ...prev };
        for (const m of mates) {
          const mp = next[m.name];
          if (!mp) continue;
          const dx = dp.x - mp.x;
          const dy = dp.y - mp.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 60) {
            next[m.name] = { x: mp.x + dx * 0.03, y: mp.y + dy * 0.03 };
          }
        }
        return next;
      });
    }, 25);
    return (): void => clearInterval(iv);
  }, [dragging, agents]);

  // Snap back on release
  useEffect(() => {
    if (dragging) return;
    let frame: number;
    let iters = 0;
    function snap(): void {
      if (iters > 20) return;
      iters++;
      setPositions((prev) => {
        const next = { ...prev };
        let moved = false;
        for (const key of Object.keys(homeRef.current)) {
          const cur = next[key];
          const home = homeRef.current[key];
          if (!cur || !home) continue;
          const dx = home.x - cur.x;
          const dy = home.y - cur.y;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            next[key] = { x: cur.x + dx * 0.2, y: cur.y + dy * 0.2 };
            moved = true;
          }
        }
        if (moved) frame = requestAnimationFrame(snap);
        return next;
      });
    }
    const t = setTimeout(() => {
      frame = requestAnimationFrame(snap);
    }, 50);
    return (): void => {
      clearTimeout(t);
      cancelAnimationFrame(frame);
    };
  }, [dragging]);

  const onMouseDown = useCallback(
    (name: string, e: React.MouseEvent): void => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const p = positions[name];
      if (!p) return;
      dragOffset.current = { x: e.clientX - rect.left - p.x, y: e.clientY - rect.top - p.y };
      setDragging(name);
    },
    [positions],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent): void => {
      if (!dragging) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPositions((prev) => ({
        ...prev,
        [dragging]: {
          x: e.clientX - rect.left - dragOffset.current.x,
          y: e.clientY - rect.top - dragOffset.current.y,
        },
      }));
    },
    [dragging],
  );

  const onMouseUp = useCallback((): void => {
    setDragging(null);
  }, []);

  const openHistory = useCallback(
    async (agent: Agent): Promise<void> => {
      setHistoryAgent(agent);
      setRuns(null);
      try {
        const r = await api<{ runs: RunEntry[] }>(
          `/api/v1/agents/${agent.name}/history?limit=20`,
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
        9 named agents executing the V5 canonical lifecycle. Drag nodes to explore. Click to
        inspect.
      </p>

      {/* Detail card (above chart when agent selected) */}
      {selected && (
        <div
          style={{
            ...styles.card,
            borderLeft: `4px solid ${DEPT_COLORS[selected.department]?.bg ?? '#999'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                background: DEPT_COLORS[selected.department]?.bg ?? '#999',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 700,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              {abbr(selected.name)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.label}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <span style={pill(DEPT_COLORS[selected.department]?.bg ?? '#999')}>
                  {DEPT_COLORS[selected.department]?.label ?? selected.department}
                </span>
                <span style={pill('#6b7280')}>{selected.type}</span>
                <span style={pill(selected.status === 'active' ? colors.success : '#9ca3af')}>
                  {selected.status}
                </span>
              </div>
              <p
                style={{ fontSize: 13, color: colors.textDim, margin: '10px 0 0', lineHeight: 1.5 }}
              >
                {AGENT_DESC[selected.name] ?? 'No description available.'}
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}
                  >
                    Trigger
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                    {selected.schedule}
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}
                  >
                    Directive
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                    #{selected.directive}
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}
                  >
                    Total runs
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                    {selected.totalRuns.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}
                  >
                    Last active
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                    {selected.lastRunAt ? relativeTime(selected.lastRunAt) : 'never'}
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}
                  >
                    Last action
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                    <code style={{ fontSize: 11 }}>{selected.lastAction ?? '—'}</code>
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}
                  >
                    Audit prefix
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                    <code style={{ fontSize: 11 }}>{selected.auditPrefix}*</code>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <button style={styles.btn} onClick={() => void openHistory(selected)}>
                  View run history
                </button>
                <button
                  style={{ ...styles.btnGhost, marginLeft: 8 }}
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Org Chart Canvas */}
      <div
        ref={containerRef}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{
          ...styles.card,
          position: 'relative',
          width: W,
          height: H,
          overflow: 'hidden',
          background: '#fafbfc',
          margin: '0 auto 16px',
          cursor: dragging ? 'grabbing' : 'default',
          userSelect: 'none',
        }}
      >
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
          <line
            x1={HITL_POS.x}
            y1={HITL_POS.y}
            x2={CT.x}
            y2={CT.y}
            stroke="#111827"
            strokeWidth={2}
            strokeOpacity={0.2}
            strokeDasharray="6 3"
          />
          {agents.map((a) => {
            const p = positions[a.name];
            if (!p) return null;
            return (
              <line
                key={`ct-${a.name}`}
                x1={CT.x}
                y1={CT.y}
                x2={p.x}
                y2={p.y}
                stroke={DEPT_COLORS[a.department]?.bg ?? '#999'}
                strokeWidth={1}
                strokeOpacity={0.12}
              />
            );
          })}
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
                  strokeOpacity={0.12}
                />
              );
            }),
          )}
        </svg>

        {/* Department labels — positioned well above cluster center */}
        {Object.entries(DEPT_ANCHORS).map(([dept, anchor]) => {
          const dc = DEPT_COLORS[dept];
          if (!dc) return null;
          const deptAgents = grouped[dept] ?? [];
          const radius = 50 + deptAgents.length * 10;
          return (
            <div
              key={`label-${dept}`}
              style={{
                position: 'absolute',
                left: anchor.x,
                top: anchor.y - radius - 20,
                transform: 'translateX(-50%)',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: dc.bg,
                opacity: 0.7,
                pointerEvents: 'none',
                zIndex: 2,
                whiteSpace: 'nowrap',
              }}
            >
              {dc.label}
            </div>
          );
        })}

        {/* HITL */}
        <div
          style={{
            position: 'absolute',
            left: HITL_POS.x - 36,
            top: HITL_POS.y - 22,
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

        {/* Control Tower */}
        <div
          style={{
            position: 'absolute',
            left: CT.x - 42,
            top: CT.y - 42,
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
          }}
        >
          <span style={{ fontSize: 18 }}>🏯</span>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5 }}>CONTROL</span>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5 }}>TOWER</span>
        </div>

        {/* Agent nodes — draggable */}
        {agents.map((a) => {
          const p = positions[a.name];
          if (!p) return null;
          const dc = DEPT_COLORS[a.department];
          const isSel = selected?.name === a.name;
          const isDrag = dragging === a.name;
          return (
            <div
              key={a.name}
              onMouseDown={(e) => onMouseDown(a.name, e)}
              onClick={() => {
                if (!isDrag) setSelected(a);
              }}
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
                cursor: isDrag ? 'grabbing' : 'grab',
                zIndex: isDrag ? 30 : isSel ? 20 : 5,
                boxShadow: isSel
                  ? `0 0 0 3px white, 0 0 0 5px ${dc?.bg ?? '#999'}`
                  : isDrag
                    ? '0 8px 24px rgba(0,0,0,0.3)'
                    : '0 2px 6px rgba(0,0,0,0.15)',
                transition: isDrag ? 'none' : 'box-shadow 0.15s',
                transform: isDrag ? 'scale(1.15)' : 'scale(1)',
              }}
              title={a.label}
            >
              {abbr(a.name)}
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

      {/* Agent fleet table */}
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
                  <td
                    style={{
                      ...styles.td,
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: colors.primary,
                    }}
                    onClick={() => setSelected(a)}
                  >
                    {a.label}
                  </td>
                  <td style={styles.td}>
                    <span style={pill(dc?.bg ?? '#999')}>{dc?.label ?? a.department}</span>
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: colors.textMuted }}>{a.type}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    {a.totalRuns.toLocaleString()}
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: colors.textMuted }}>
                    {a.lastRunAt ? relativeTime(a.lastRunAt) : '—'}
                  </td>
                  <td style={styles.td}>
                    <button style={styles.btnGhost} onClick={() => void openHistory(a)}>
                      History
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* History popup modal */}
      {historyAgent && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15,23,42,0.45)',
              zIndex: 60,
            }}
            onClick={() => setHistoryAgent(null)}
          />
          <div
            style={{
              position: 'fixed',
              top: '10%',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'white',
              borderRadius: 12,
              padding: 24,
              width: 'min(720px, 90vw)',
              maxHeight: '75vh',
              overflow: 'auto',
              zIndex: 61,
              boxShadow: '0 12px 40px rgba(15,23,42,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: DEPT_COLORS[historyAgent.department]?.bg ?? '#999',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                {abbr(historyAgent.name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{historyAgent.label} — Run History</div>
                <div style={{ fontSize: 12, color: colors.textMuted }}>
                  {historyAgent.totalRuns.toLocaleString()} total runs
                </div>
              </div>
              <button style={styles.btnGhost} onClick={() => setHistoryAgent(null)}>
                Close
              </button>
            </div>
            {runs === null ? (
              <p>Loading…</p>
            ) : runs.length === 0 ? (
              <p style={{ color: colors.textMuted }}>No runs recorded yet.</p>
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
                      style={{ background: r.status === 'failed' ? '#fef2f2' : undefined }}
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
                        style={{ ...styles.td, fontSize: 11, color: colors.textDim, maxWidth: 280 }}
                      >
                        {Object.keys(r.metadata).length > 0
                          ? JSON.stringify(r.metadata).slice(0, 120)
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
        </>
      )}
    </>
  );
}
