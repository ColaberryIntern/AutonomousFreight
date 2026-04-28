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

interface ActivityItem {
  id: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  agentName: string;
}

interface Pulse {
  id: string;
  agentName: string;
  startedAt: number;
}

interface HealthCheck {
  metric: string;
  label: string;
  count: number;
  threshold: number;
  status: 'ok' | 'alert';
  windowHours: number;
}

interface HealthAlert {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

interface HealthSnapshot {
  checks: HealthCheck[];
  recentAlerts: HealthAlert[];
  generatedAt: string;
}

const DEPT_COLORS: Record<string, { bg: string; label: string }> = {
  quoting: { bg: '#3B82F6', label: 'Quoting' },
  procurement: { bg: '#10B981', label: 'Procurement' },
  execution: { bg: '#F59E0B', label: 'Execution' },
  documents: { bg: '#8B5CF6', label: 'Documents' },
  financials: { bg: '#6366F1', label: 'Financials' },
};

const AGENT_DESC: Record<string, string> = {
  quoting_agent: 'Prices RFQs, auto-sends high-confidence quotes',
  procurement_agent: 'Auto-assigns carriers when compliance + score pass',
  tracking_agent: 'Progresses milestones: pickup → transit → deliver',
  document_agent: 'Validates BOL via regex extraction on delivery',
  rate_audit_agent: 'Checks margin ≥ 5% before invoice generation',
  invoice_agent: 'Generates AF-INV-NNNN invoices with margin calc',
  payment_match_agent: 'Three-way match: amount + cost + BOL exists',
  settlement_agent: 'Creates carrier payment queue on matched invoices',
  dispute_agent: 'Auto-resolves disputes < 5% discrepancy',
};

const AGENT_PREFIXES: Record<string, string> = {
  'rfq.': 'quoting_agent',
  'agent.procurement.': 'procurement_agent',
  'agent.tracking.': 'tracking_agent',
  'agent.document.': 'document_agent',
  'agent.rate_audit.': 'rate_audit_agent',
  'agent.invoice.': 'invoice_agent',
  'agent.payment.': 'payment_match_agent',
  'agent.settlement.': 'settlement_agent',
  'agent.dispute.': 'dispute_agent',
};

function actionToAgent(action: string): string | null {
  for (const [prefix, name] of Object.entries(AGENT_PREFIXES)) {
    if (action.startsWith(prefix)) return name;
  }
  return null;
}

const DEPT_ANCHORS: Record<string, { x: number; y: number }> = {
  quoting: { x: 140, y: 140 },
  procurement: { x: 400, y: 80 },
  execution: { x: 660, y: 140 },
  documents: { x: 660, y: 340 },
  financials: { x: 300, y: 400 },
};

const CT_HOME = { x: 400, y: 240 };
const HITL_HOME = { x: 70, y: 45 };
const W = 800;
const H = 520;
const PULSE_DURATION = 1200;

function abbr(name: string): string {
  return name
    .split('_')
    .filter((w) => w !== 'agent')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

type Pos = Record<string, { x: number; y: number }>;

function computeHome(agents: Agent[]): Pos {
  const grouped: Record<string, Agent[]> = {};
  for (const a of agents) (grouped[a.department] ??= []).push(a);
  const pos: Pos = { __ct__: { ...CT_HOME }, __hitl__: { ...HITL_HOME } };
  for (const [dept, list] of Object.entries(grouped)) {
    const anchor = DEPT_ANCHORS[dept];
    if (!anchor) continue;
    list.forEach((a, i) => {
      const angle = (i / list.length) * Math.PI * 2 - Math.PI / 2;
      const r = 50 + list.length * 10;
      pos[a.name] = { x: anchor.x + Math.cos(angle) * r, y: anchor.y + Math.sin(angle) * r };
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
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [mode, setMode] = useState<'replay' | 'live'>('replay');
  const [replayIdx, setReplayIdx] = useState(0);
  const seenIds = useRef(new Set<string>());
  const [glowing, setGlowing] = useState<Set<string>>(new Set());
  const [health, setHealth] = useState<HealthSnapshot | null>(null);

  // Load agents
  useEffect(() => {
    api<{ agents: Agent[] }>('/api/v1/agents', token)
      .then((r) => {
        setAgents(r.agents);
        const hp = computeHome(r.agents);
        homeRef.current = hp;
        setPositions({ ...hp });
      })
      .catch((e) => setErr(String(e)));
  }, [token]);

  // Load health snapshot from Health Monitor agent (poll every 30s)
  useEffect(() => {
    let cancelled = false;
    function load(): void {
      api<HealthSnapshot>('/api/v1/agents/health', token)
        .then((r) => {
          if (!cancelled) setHealth(r);
        })
        .catch(() => {});
    }
    load();
    const iv = setInterval(load, 30_000);
    return (): void => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [token]);

  // Load 24h activity for replay
  useEffect(() => {
    api<{
      items: Array<{
        id: string;
        action: string;
        target?: string;
        metadata?: Record<string, unknown>;
        occurredAt: string;
      }>;
    }>('/api/v1/audit/logs?limit=200', token)
      .then((r) => {
        const items: ActivityItem[] = [];
        for (const row of r.items) {
          const agentName = actionToAgent(row.action);
          if (agentName) {
            items.push({
              id: row.id,
              action: row.action,
              target: row.target ?? null,
              metadata: row.metadata ?? {},
              occurredAt: row.occurredAt,
              agentName,
            });
            seenIds.current.add(row.id);
          }
        }
        items.reverse();
        setActivity(items.slice(-100));
        setReplayIdx(0);
        setMode('replay');
      })
      .catch(() => setMode('live'));
  }, [token]);

  // Replay animation
  useEffect(() => {
    if (mode !== 'replay' || activity.length === 0) return;
    if (replayIdx >= activity.length) {
      setMode('live');
      return;
    }
    const t = setTimeout(() => {
      const item = activity[replayIdx];
      if (item) firePulse(item.agentName);
      setReplayIdx((i) => i + 1);
    }, 80);
    return (): void => clearTimeout(t);
  }, [mode, replayIdx, activity]);

  // Live polling (every 4s when in live mode)
  useEffect(() => {
    if (mode !== 'live') return;
    const iv = setInterval(() => {
      api<{
        items: Array<{
          id: string;
          action: string;
          target?: string;
          metadata?: Record<string, unknown>;
          occurredAt: string;
        }>;
      }>('/api/v1/audit/logs?limit=10', token)
        .then((r) => {
          const newItems: ActivityItem[] = [];
          for (const row of r.items) {
            if (seenIds.current.has(row.id)) continue;
            const agentName = actionToAgent(row.action);
            if (agentName) {
              seenIds.current.add(row.id);
              newItems.push({
                id: row.id,
                action: row.action,
                target: row.target ?? null,
                metadata: row.metadata ?? {},
                occurredAt: row.occurredAt,
                agentName,
              });
            }
          }
          if (newItems.length > 0) {
            newItems.reverse();
            for (const item of newItems) firePulse(item.agentName);
            setActivity((prev) => [...prev, ...newItems].slice(-100));
          }
        })
        .catch(() => {});
    }, 4000);
    return (): void => clearInterval(iv);
  }, [mode, token]);

  function firePulse(agentName: string): void {
    const id = `${agentName}-${Date.now()}`;
    setPulses((prev) => [...prev, { id, agentName, startedAt: Date.now() }]);
    setGlowing((prev) => new Set(prev).add(agentName));
    setTimeout(() => {
      setPulses((prev) => prev.filter((p) => p.id !== id));
      setGlowing((prev) => {
        const next = new Set(prev);
        next.delete(agentName);
        return next;
      });
    }, PULSE_DURATION);
  }

  // Drag physics: same-dept follow
  useEffect(() => {
    if (!dragging || !agents) return;
    const isSpecial = dragging === '__ct__' || dragging === '__hitl__';
    if (isSpecial) return;
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
          if (Math.sqrt(dx * dx + dy * dy) > 60) {
            next[m.name] = { x: mp.x + dx * 0.03, y: mp.y + dy * 0.03 };
          }
        }
        return next;
      });
    }, 25);
    return (): void => clearInterval(iv);
  }, [dragging, agents]);

  // Snap back
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

  const onDown = useCallback(
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

  const onMove = useCallback(
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

  const onUp = useCallback((): void => {
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
  const ct = positions['__ct__'] ?? CT_HOME;
  const hitl = positions['__hitl__'] ?? HITL_HOME;

  return (
    <>
      <h1 style={styles.h1}>
        Agent Network
        <span
          style={{
            marginLeft: 12,
            fontSize: 12,
            fontWeight: 600,
            padding: '2px 10px',
            borderRadius: 10,
            background: mode === 'live' ? '#dc2626' : '#f59e0b',
            color: 'white',
            verticalAlign: 'middle',
            animation: mode === 'live' ? 'pulse-badge 2s infinite' : undefined,
          }}
        >
          {mode === 'live' ? '● LIVE' : `▶ REPLAY ${replayIdx}/${activity.length}`}
        </span>
      </h1>
      <style>{`
        @keyframes pulse-badge { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes glow-ring { 0%{box-shadow:0 0 0 0 rgba(255,255,255,0.7)} 100%{box-shadow:0 0 0 14px rgba(255,255,255,0)} }
        @keyframes pulse-line { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
      `}</style>

      {/* Detail card */}
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
                  {DEPT_COLORS[selected.department]?.label}
                </span>
                <span style={pill('#6b7280')}>{selected.type}</span>
                <span style={pill(colors.success)}>{selected.status}</span>
              </div>
              <p
                style={{ fontSize: 13, color: colors.textDim, margin: '10px 0 0', lineHeight: 1.5 }}
              >
                {AGENT_DESC[selected.name] ?? ''}
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3,1fr)',
                  gap: 12,
                  marginTop: 12,
                }}
              >
                {[
                  ['Trigger', selected.schedule],
                  ['Directive', `#${selected.directive}`],
                  ['Runs', selected.totalRuns.toLocaleString()],
                  ['Last active', selected.lastRunAt ? relativeTime(selected.lastRunAt) : 'never'],
                  ['Last action', selected.lastAction ?? '—'],
                  ['Prefix', `${selected.auditPrefix}*`],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div
                      style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}
                    >
                      {label}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <button style={styles.btn} onClick={() => void openHistory(selected)}>
                  View history
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

      {/* System health — from Health Monitor agent */}
      {health && (
        <div style={styles.card}>
          <h3 style={styles.h3}>
            System health
            <span
              style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: colors.textMuted }}
            >
              1-hour window · refreshes every 30s
            </span>
          </h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {health.checks.map((c) => {
              const color = c.status === 'alert' ? colors.danger : colors.success;
              return (
                <div key={c.metric} style={{ ...styles.stat, borderTop: `3px solid ${color}` }}>
                  <div style={styles.statLabel}>{c.label}</div>
                  <div style={{ ...styles.statValue, color }}>{c.count}</div>
                  <div style={styles.statHint}>
                    threshold {c.threshold} · {c.status === 'alert' ? 'BREACH' : 'normal'}
                  </div>
                </div>
              );
            })}
          </div>
          {health.recentAlerts.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.cardBorder}` }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  marginBottom: 6,
                }}
              >
                Recent alerts
              </div>
              {health.recentAlerts.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 0',
                    fontSize: 12,
                  }}
                >
                  <span style={pill(colors.danger)}>alert</span>
                  <span style={{ fontWeight: 600 }}>
                    {String(a.metadata?.['metric'] ?? 'unknown')}
                  </span>
                  <span style={{ color: colors.textDim }}>
                    {String(a.metadata?.['count'] ?? '?')} ≥ threshold{' '}
                    {String(a.metadata?.['threshold'] ?? '?')}
                  </span>
                  <span style={{ marginLeft: 'auto', color: colors.textMuted, fontSize: 11 }}>
                    {relativeTime(a.occurredAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        style={{
          ...styles.card,
          position: 'relative',
          width: W,
          height: H,
          overflow: 'hidden',
          background: '#0f172a',
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
            x1={hitl.x}
            y1={hitl.y}
            x2={ct.x}
            y2={ct.y}
            stroke="white"
            strokeWidth={1}
            strokeOpacity={0.15}
            strokeDasharray="6 3"
          />
          {agents.map((a) => {
            const p = positions[a.name];
            if (!p) return null;
            const isActive = pulses.some((pl) => pl.agentName === a.name);
            return (
              <line
                key={`ct-${a.name}`}
                x1={ct.x}
                y1={ct.y}
                x2={p.x}
                y2={p.y}
                stroke={DEPT_COLORS[a.department]?.bg ?? '#999'}
                strokeWidth={isActive ? 2 : 0.8}
                strokeOpacity={isActive ? 0.6 : 0.1}
                strokeDasharray={isActive ? '8 4' : 'none'}
                style={isActive ? { animation: 'pulse-line 0.4s linear infinite' } : undefined}
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
                  strokeWidth={0.6}
                  strokeOpacity={0.08}
                />
              );
            }),
          )}
        </svg>

        {/* Dept labels */}
        {Object.entries(DEPT_ANCHORS).map(([dept, anchor]) => {
          const dc = DEPT_COLORS[dept];
          if (!dc) return null;
          const r = 50 + (grouped[dept]?.length ?? 0) * 10;
          return (
            <div
              key={`l-${dept}`}
              style={{
                position: 'absolute',
                left: anchor.x,
                top: anchor.y - r - 18,
                transform: 'translateX(-50%)',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: dc.bg,
                opacity: 0.6,
                pointerEvents: 'none',
                zIndex: 2,
                whiteSpace: 'nowrap',
              }}
            >
              {dc.label}
            </div>
          );
        })}

        {/* HITL — draggable */}
        <div
          onMouseDown={(e) => onDown('__hitl__', e)}
          style={{
            position: 'absolute',
            left: hitl.x - 36,
            top: hitl.y - 22,
            width: 72,
            height: 44,
            borderRadius: 10,
            background: 'rgba(255,255,255,0.95)',
            border: '2px solid #6b7280',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            fontSize: 10,
            fontWeight: 700,
            color: '#374151',
            cursor: 'grab',
          }}
        >
          <span style={{ fontSize: 16 }}>👤</span>
          <span>HITL</span>
        </div>

        {/* Control Tower — draggable */}
        <div
          onMouseDown={(e) => onDown('__ct__', e)}
          style={{
            position: 'absolute',
            left: ct.x - 42,
            top: ct.y - 42,
            width: 84,
            height: 84,
            borderRadius: 42,
            background: '#1e293b',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 20px rgba(59,130,246,0.15)',
            cursor: 'grab',
            border: '2px solid rgba(255,255,255,0.1)',
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
          const isSel = selected?.name === a.name;
          const isDrag = dragging === a.name;
          const isGlow = glowing.has(a.name);
          return (
            <div
              key={a.name}
              onMouseDown={(e) => onDown(a.name, e)}
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
                boxShadow: isGlow
                  ? `0 0 0 4px ${dc?.bg ?? '#999'}44, 0 0 20px ${dc?.bg ?? '#999'}88`
                  : isSel
                    ? `0 0 0 3px white, 0 0 0 5px ${dc?.bg ?? '#999'}`
                    : '0 2px 6px rgba(0,0,0,0.3)',
                transform: isDrag ? 'scale(1.15)' : isGlow ? 'scale(1.1)' : 'scale(1)',
                transition: isDrag ? 'none' : 'transform 0.2s, box-shadow 0.2s',
                border: '2px solid rgba(255,255,255,0.2)',
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
                  background: '#10B981',
                  border: '2px solid #0f172a',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Activity feed */}
      <div style={styles.card}>
        <h3 style={styles.h3}>
          Activity feed
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: colors.textMuted }}>
            {activity.length} events · {mode === 'live' ? 'polling every 4s' : 'replaying...'}
          </span>
        </h3>
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          {activity.length === 0 ? (
            <p style={{ color: colors.textMuted }}>No agent activity yet.</p>
          ) : (
            <table style={styles.table}>
              <tbody>
                {[...activity]
                  .reverse()
                  .slice(0, 50)
                  .map((item) => {
                    const dc = agents?.find((a) => a.name === item.agentName);
                    const deptColor = DEPT_COLORS[dc?.department ?? '']?.bg ?? '#999';
                    const isFail =
                      item.action.includes('exception') ||
                      item.action.includes('failed') ||
                      item.action.includes('blocked');
                    return (
                      <tr
                        key={item.id}
                        style={{ background: isFail ? 'rgba(220,38,38,0.05)' : undefined }}
                      >
                        <td style={{ ...styles.td, width: 30 }}>
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 12,
                              background: deptColor,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontSize: 8,
                              fontWeight: 700,
                            }}
                          >
                            {abbr(item.agentName)}
                          </div>
                        </td>
                        <td
                          style={{
                            ...styles.td,
                            fontWeight: 600,
                            fontSize: 12,
                            cursor: 'pointer',
                            color: colors.primary,
                          }}
                          onClick={() => {
                            const ag = agents?.find((a) => a.name === item.agentName);
                            if (ag) setSelected(ag);
                          }}
                        >
                          {dc?.label ?? item.agentName}
                        </td>
                        <td style={styles.td}>
                          <code style={{ fontSize: 11 }}>{item.action}</code>
                        </td>
                        <td
                          style={{
                            ...styles.td,
                            fontFamily: 'ui-monospace',
                            fontSize: 10,
                            color: colors.textMuted,
                          }}
                        >
                          {item.target ? `${item.target.slice(0, 8)}…` : '—'}
                        </td>
                        <td
                          style={{
                            ...styles.td,
                            fontSize: 11,
                            color: colors.textMuted,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {relativeTime(item.occurredAt)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* History popup */}
      {historyAgent && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 60 }}
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
                  {historyAgent.totalRuns.toLocaleString()} total
                </div>
              </div>
              <button style={styles.btnGhost} onClick={() => setHistoryAgent(null)}>
                Close
              </button>
            </div>
            {runs === null ? (
              <p>Loading…</p>
            ) : runs.length === 0 ? (
              <p style={{ color: colors.textMuted }}>No runs.</p>
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
                      <td style={{ ...styles.td, fontFamily: 'ui-monospace', fontSize: 11 }}>
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
