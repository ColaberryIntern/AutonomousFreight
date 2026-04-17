import type React from 'react';

export const colors = {
  navBg: '#0f172a',
  navBgHover: '#1e293b',
  text: '#1a1a1a',
  textMuted: '#64748b',
  textDim: '#475569',
  bg: '#f8fafc',
  cardBg: 'white',
  cardBorder: '#e2e8f0',
  primary: '#2563eb',
  success: '#16a34a',
  warn: '#f59e0b',
  danger: '#dc2626',
  tableHead: '#f1f5f9',
} as const;

export const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    minHeight: '100vh',
    background: colors.bg,
    color: colors.text,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  sidebar: {
    width: 220,
    background: colors.navBg,
    color: 'white',
    padding: '16px 0',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto' as const,
  },
  sidebarBrand: { fontWeight: 700, fontSize: 18, padding: '8px 20px 20px' },
  sidebarLink: {
    display: 'block',
    padding: '10px 20px',
    background: 'transparent',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left' as const,
    fontSize: 14,
  },
  sidebarLinkActive: {
    background: colors.navBgHover,
    borderLeft: `3px solid ${colors.primary}`,
    paddingLeft: 17,
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column' as const },
  topbar: {
    padding: '12px 24px',
    borderBottom: `1px solid ${colors.cardBorder}`,
    display: 'flex',
    alignItems: 'center',
    background: 'white',
  },
  content: { padding: 24, overflow: 'auto' as const },
  card: {
    background: colors.cardBg,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  h1: { margin: '0 0 16px', fontSize: 24 },
  h2: { margin: '0 0 12px', fontSize: 18 },
  h3: { margin: '0 0 8px', fontSize: 15, color: colors.textDim },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th: {
    textAlign: 'left' as const,
    padding: '8px 10px',
    background: colors.tableHead,
    fontWeight: 600,
  },
  td: { padding: '8px 10px', borderTop: `1px solid ${colors.cardBorder}` },
  tr: { cursor: 'pointer' as const },
  btn: {
    background: colors.primary,
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  btnGhost: {
    background: 'white',
    color: colors.primary,
    border: `1px solid ${colors.primary}`,
    padding: '6px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  btnDanger: {
    background: colors.danger,
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  err: { color: 'crimson', margin: '8px 0', fontSize: 13 },
  stat: {
    display: 'inline-block',
    minWidth: 160,
    padding: 16,
    marginRight: 12,
    marginBottom: 12,
    background: 'white',
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 8,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  statValue: { fontSize: 28, fontWeight: 700, marginTop: 4 },
  statHint: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  loginWrap: { maxWidth: 380, margin: '80px auto', padding: 24 },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #cbd5e1',
    borderRadius: 4,
    fontSize: 14,
    boxSizing: 'border-box' as const,
  },
  label: { display: 'block', marginBottom: 12, fontSize: 13, color: colors.textDim },
  drawer: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: 'min(640px, 100vw)',
    background: 'white',
    boxShadow: '-8px 0 24px rgba(15,23,42,0.18)',
    padding: 24,
    overflow: 'auto' as const,
    zIndex: 50,
  },
  drawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backdrop: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(15,23,42,0.35)',
    zIndex: 49,
  },
};

export function pill(bg: string, fg = 'white'): React.CSSProperties {
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

export function riskColor(score: number): string {
  if (score < 0.3) return colors.success;
  if (score < 0.6) return colors.warn;
  return colors.danger;
}

export function statusColor(status: string): string {
  switch (status) {
    case 'quoting':
      return colors.warn;
    case 'assigned':
      return colors.primary;
    case 'in_transit':
      return '#8b5cf6';
    case 'delivered':
      return colors.success;
    case 'cancelled':
      return colors.textMuted;
    default:
      return colors.textMuted;
  }
}

export function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
