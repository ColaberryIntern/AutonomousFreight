/**
 * Design System v2: the Autonomy Cockpit.
 * Spec: docs/design-system-v2.md. Live reference: scripts/design/buildDesignReference.ts
 *
 * Deliberately a RETHEME, not a rewrite. Every export the 21 components already
 * import (`colors`, `styles`, `pill`, `riskColor`, `statusColor`, `relativeTime`)
 * keeps its name and shape, so the whole cockpit picks up the new system without
 * a single component edit. New primitives are additive.
 *
 * The values now resolve to CSS custom properties rather than literal hex, which
 * buys dark mode for the entire app for free: `THEME_CSS` defines both palettes
 * and the components never learn which one is active. Inline styles accept
 * `var(--x)` exactly like a hex string, so nothing downstream changes.
 *
 * Colours were validated with the dataviz validator, not chosen by eye:
 *  - The four layers are ORDERED STAGES, not categories, so they take a
 *    single-hue ordinal ramp (intensity rises with progress through
 *    quote-to-cash). Passes monotone lightness, adjacent dL, single hue and
 *    light-end contrast in BOTH modes.
 *  - The previous `warn` (#f59e0b) against `danger` (#dc2626) sat at dE 9.2 for
 *    NORMAL vision, under the 15 floor: hard to tell apart before colourblindness
 *    is even considered. Both are replaced, and status now always ships with a
 *    glyph and a label so colour is never the only carrier of meaning.
 */
import type React from 'react';

/**
 * Token sheet. Inject once at the app root (see App.tsx). Both modes are
 * SELECTED, not auto-flipped: the dark values are declared under the media query
 * (OS setting) and under `[data-theme="dark"]` (explicit toggle), with the
 * `:not([data-theme="light"])` guard so an explicit light choice beats OS dark.
 */
export const THEME_CSS = `
:root{
  color-scheme: light;
  --plane:#f4f6f9; --surface:#ffffff; --raised:#fbfcfd; --line:#e3e8ef;
  --ink:#0f1729; --ink2:#4a5568; --muted:#7b8794;
  --rms:#86b6ef; --oms:#5598e7; --tms:#2a78d6; --bms:#1c5cab;
  --accent:#2a78d6; --accent-soft:#eaf2fd; --accent-ink:#ffffff;
  --ok:#0a7a37; --ok-bg:#e8f6ed;
  --attn:#8a5a00; --attn-bg:#fdf3e0;
  --block:#a32020; --block-bg:#fceceb;
  --idle:#64748b; --idle-bg:#f1f4f8;
  --track:#e8edf4; --overlay:rgba(15,23,41,.42);
  /* The agent war room is a deliberately dark canvas in BOTH modes: it is a
     focus surface, not a document surface. Tokenised so the ring colour around
     nodes can never drift from the canvas behind them. */
  --canvas:#0f172a; --canvas-line:#1e293b;
  /* Categorical slots for genuinely unordered sets (agent departments, RFQ
     status). Fixed ORDER is the colourblind-safety mechanism, so assign slot 1,
     then 2, then 3; never cycle and never generate a 6th. Validated as an
     adjacent set in both modes, which means any form placing them side by side
     (bars, stacks, legends) is safe. Scattered all-pairs use, like war-room
     nodes, additionally requires the direct labels those nodes already carry. */
  --cat1:#2a78d6; --cat2:#eb6834; --cat3:#1baf7a; --cat4:#eda100; --cat5:#e87ba4;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    color-scheme: dark;
    --plane:#0f1319; --surface:#171c24; --raised:#1e242e; --line:#2a323e;
    --ink:#e8eef6; --ink2:#a7b3c4; --muted:#7b8794;
    --rms:#184f95; --oms:#256abf; --tms:#3987e5; --bms:#6da7ec;
    --accent:#3987e5; --accent-soft:#16243a; --accent-ink:#ffffff;
    --ok:#4ade80; --ok-bg:#132a1d;
    --attn:#fbbf24; --attn-bg:#2e2410;
    --block:#f87171; --block-bg:#2f1618;
    --idle:#8b98a9; --idle-bg:#1c222b;
    --track:#242c38; --overlay:rgba(0,0,0,.6);
    --cat1:#3987e5; --cat2:#d95926; --cat3:#199e70; --cat4:#c98500; --cat5:#d55181;
  }
}
:root[data-theme="dark"]{
  color-scheme: dark;
  --plane:#0f1319; --surface:#171c24; --raised:#1e242e; --line:#2a323e;
  --ink:#e8eef6; --ink2:#a7b3c4; --muted:#7b8794;
  --rms:#184f95; --oms:#256abf; --tms:#3987e5; --bms:#6da7ec;
  --accent:#3987e5; --accent-soft:#16243a; --accent-ink:#ffffff;
  --ok:#4ade80; --ok-bg:#132a1d;
  --attn:#fbbf24; --attn-bg:#2e2410;
  --block:#f87171; --block-bg:#2f1618;
  --idle:#8b98a9; --idle-bg:#1c222b;
  --track:#242c38; --overlay:rgba(0,0,0,.6);
  --cat1:#3987e5; --cat2:#d95926; --cat3:#199e70; --cat4:#c98500; --cat5:#d55181;
}
*{box-sizing:border-box}
html,body,#root{height:100%}
body{margin:0;background:var(--plane);color:var(--ink2);
  font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,sans-serif;
  -webkit-font-smoothing:antialiased}
/* Every figure gets tabular numerals so columns of numbers line up. */
table,.num,input[type="number"]{font-variant-numeric:tabular-nums}
/* Visible focus is non-negotiable; 3px ring per the accessibility policy. */
:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:4px}
tbody tr:hover{background:var(--raised)}
button{font-family:inherit}
button:not(:disabled){cursor:pointer}
button:disabled{opacity:.55;cursor:not-allowed}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
`;

/**
 * Same keys as v1 so no component changes. `navBg` is now the app surface rather
 * than a slab of navy: the v1 sidebar competed with the data for attention, and
 * the Rose Rocket read ("directs the eyes where they need to be") says chrome
 * should recede.
 */
export const colors = {
  navBg: 'var(--surface)',
  navBgHover: 'var(--raised)',
  text: 'var(--ink)',
  textMuted: 'var(--muted)',
  textDim: 'var(--ink2)',
  bg: 'var(--plane)',
  cardBg: 'var(--surface)',
  cardBorder: 'var(--line)',
  primary: 'var(--accent)',
  success: 'var(--ok)',
  warn: 'var(--attn)',
  danger: 'var(--block)',
  tableHead: 'var(--raised)',
} as const;

/** The quote-to-cash ramp. Ordered stages, one hue, intensity rises with progress. */
export const layerColors = {
  RMS: 'var(--rms)',
  OMS: 'var(--oms)',
  TMS: 'var(--tms)',
  BMS: 'var(--bms)',
} as const;
export type Layer = keyof typeof layerColors;

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 10,
};

const BTN_BASE: React.CSSProperties = {
  borderRadius: 6,
  padding: '7px 13px',
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.2,
  border: '1px solid transparent',
};

export const styles: Record<string, React.CSSProperties> = {
  shell: { display: 'flex', minHeight: '100vh', background: 'var(--plane)', color: 'var(--ink2)' },
  sidebar: {
    width: 232,
    background: 'var(--surface)',
    borderRight: '1px solid var(--line)',
    color: 'var(--ink2)',
    padding: '14px 0',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto' as const,
  },
  sidebarBrand: {
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: -0.2,
    color: 'var(--ink)',
    padding: '6px 18px 18px',
  },
  sidebarLink: {
    display: 'block',
    padding: '8px 18px',
    background: 'transparent',
    border: 'none',
    borderLeft: '3px solid transparent',
    color: 'var(--ink2)',
    width: '100%',
    textAlign: 'left' as const,
    fontSize: 13.5,
    borderRadius: 0,
  },
  sidebarLinkActive: {
    background: 'var(--accent-soft)',
    borderLeft: '3px solid var(--accent)',
    color: 'var(--ink)',
    fontWeight: 600,
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column' as const, minWidth: 0 },
  topbar: {
    padding: '11px 24px',
    borderBottom: '1px solid var(--line)',
    display: 'flex',
    alignItems: 'center',
    background: 'var(--surface)',
  },
  content: { padding: 24, overflow: 'auto' as const },
  card: { ...CARD, padding: 20, marginBottom: 16 },
  h1: { margin: '0 0 16px', fontSize: 23, letterSpacing: -0.5, color: 'var(--ink)' },
  h2: { margin: '0 0 12px', fontSize: 17, letterSpacing: -0.2, color: 'var(--ink)' },
  h3: {
    margin: '0 0 8px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.9,
    textTransform: 'uppercase' as const,
    color: 'var(--muted)',
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: {
    textAlign: 'left' as const,
    padding: '9px 12px',
    background: 'var(--raised)',
    borderBottom: '1px solid var(--line)',
    fontWeight: 700,
    fontSize: 10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: 'var(--muted)',
  },
  td: { padding: '10px 12px', borderTop: '1px solid var(--line)', color: 'var(--ink2)' },
  tr: { cursor: 'pointer' as const },
  btn: { ...BTN_BASE, background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' },
  btnGhost: { ...BTN_BASE, background: 'var(--surface)', color: 'var(--ink2)', borderColor: 'var(--line)' },
  btnDanger: { ...BTN_BASE, background: 'var(--block)', color: '#fff', borderColor: 'var(--block)' },
  err: { color: 'var(--block)', margin: '8px 0', fontSize: 13 },
  stat: { ...CARD, display: 'inline-block', minWidth: 168, padding: 16, marginRight: 12, marginBottom: 12 },
  statLabel: {
    fontSize: 10.5,
    color: 'var(--muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    fontWeight: 700,
  },
  statValue: { fontSize: 27, fontWeight: 660, marginTop: 4, color: 'var(--ink)', letterSpacing: -0.6 },
  statHint: { fontSize: 12, color: 'var(--muted)', marginTop: 4 },
  loginWrap: { maxWidth: 380, margin: '80px auto', padding: 24 },
  input: {
    width: '100%',
    padding: '9px 11px',
    border: '1px solid var(--line)',
    borderRadius: 6,
    fontSize: 14,
    background: 'var(--surface)',
    color: 'var(--ink)',
    boxSizing: 'border-box' as const,
  },
  label: { display: 'block', marginBottom: 12, fontSize: 12.5, color: 'var(--ink2)' },
  drawer: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: 'min(680px, 100vw)',
    background: 'var(--surface)',
    borderLeft: '1px solid var(--line)',
    boxShadow: '-16px 0 40px rgba(15,23,41,.16)',
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
    background: 'var(--overlay)',
    zIndex: 49,
  },
};

/**
 * Status badge. Tinted surface with same-family dark ink, so the text clears
 * contrast even where the raw hue would not. ALWAYS pair with a glyph and a
 * label at the call site: colour is the third carrier of meaning, never the first.
 */
export type StatusKind = 'ok' | 'attn' | 'block' | 'idle';
export function chip(kind: StatusKind): React.CSSProperties {
  const map: Record<StatusKind, [string, string]> = {
    ok: ['var(--ok)', 'var(--ok-bg)'],
    attn: ['var(--attn)', 'var(--attn-bg)'],
    block: ['var(--block)', 'var(--block-bg)'],
    idle: ['var(--idle)', 'var(--idle-bg)'],
  };
  const [fg, bg] = map[kind];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 9px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    color: fg,
    background: bg,
    whiteSpace: 'nowrap' as const,
  };
}
/** The glyph half of a status. Never render a chip without one. */
export const CHIP_GLYPH: Record<StatusKind, string> = {
  ok: '✓',
  attn: '⚑',
  block: '✕',
  idle: '•',
};

/**
 * Confidence meter. Confidence is never a bare number: it is a bar on the shared
 * ordinal ramp plus the value, so 0.9 looks the same everywhere in the product.
 */
export function meterFill(confidence: number): React.CSSProperties {
  const hue = confidence >= 0.85 ? 'var(--bms)' : confidence >= 0.6 ? 'var(--oms)' : 'var(--rms)';
  return {
    display: 'block',
    height: '100%',
    borderRadius: 3,
    width: `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`,
    background: hue,
  };
}
export const meterTrack: React.CSSProperties = {
  width: 52,
  height: 6,
  borderRadius: 3,
  background: 'var(--track)',
  overflow: 'hidden',
  display: 'inline-block',
};

/**
 * A value the machine supplied rather than extracted. It must LOOK invented:
 * muted, dashed-underlined, and labelled "assumed" at the call site. The 1 lb
 * weight sentinel is the worked example of what silence costs.
 */
export const assumedValue: React.CSSProperties = {
  color: 'var(--muted)',
  fontWeight: 500,
  textDecoration: 'underline dashed',
  textDecorationColor: 'var(--muted)',
  textUnderlineOffset: 3,
};

/** The customer's own words that justify an extracted value. */
export const evidenceSpan: React.CSSProperties = {
  color: 'var(--ink2)',
  background: 'var(--accent-soft)',
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 12,
};

export function pill(bg: string, fg = '#fff'): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    background: bg,
    color: fg,
  };
}

export function riskColor(score: number): string {
  if (score < 0.3) return 'var(--ok)';
  if (score < 0.6) return 'var(--attn)';
  return 'var(--block)';
}

/**
 * Lifecycle status colour. Now drawn from the quote-to-cash ramp rather than an
 * arbitrary hue per state, so a shipment's colour tells you how far along it is.
 */
export function statusColor(status: string): string {
  switch (status) {
    case 'quoting':
      return 'var(--rms)';
    case 'assigned':
      return 'var(--oms)';
    case 'in_transit':
      return 'var(--tms)';
    case 'delivered':
      return 'var(--ok)';
    case 'cancelled':
      return 'var(--idle)';
    default:
      return 'var(--muted)';
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
