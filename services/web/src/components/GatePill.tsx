import React from 'react';
import { colors, pill } from '../styles';
import type { GateEvaluation } from '../types';

export function GatePill({ ev }: { ev: GateEvaluation | null }): React.ReactElement {
  if (!ev) return <span style={{ ...pill(colors.textMuted), fontSize: 11 }}>checking…</span>;
  if (ev.result === 'pass')
    return <span style={{ ...pill(colors.success), fontSize: 11 }}>gate: pass</span>;
  if (ev.result === 'soft')
    return <span style={{ ...pill(colors.warn), fontSize: 11 }}>gate: soft</span>;
  return <span style={{ ...pill(colors.danger), fontSize: 11 }}>gate: blocked</span>;
}

export function GateFindings({ ev }: { ev: GateEvaluation }): React.ReactElement {
  if (ev.findings.length === 0) return <span />;
  return (
    <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 12 }}>
      {ev.findings.map((f) => (
        <li key={f.code} style={{ color: f.severity === 'hard' ? colors.danger : colors.warn }}>
          <b>{f.code}:</b> {f.message}
        </li>
      ))}
    </ul>
  );
}
