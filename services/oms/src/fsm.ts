/**
 * Deterministic finite-state-machine helper over the shipment lifecycle.
 * Shared by the OMS and TMS state machines: same pure-function pattern as the
 * existing rfq pricing module (same input → same output, no side effects).
 */
import type { LifecycleState, ParseResult, Shipment } from './schema/shipment.v1';

export type FromState = LifecycleState | '*';
export interface Edge {
  from: FromState;
  event: string;
  to: LifecycleState;
}

/** Resolve the next state for (from, event). Exact edges win over wildcards. */
export function nextState(edges: readonly Edge[], from: LifecycleState, event: string): LifecycleState | null {
  const exact = edges.find((e) => e.from === from && e.event === event);
  if (exact) return exact.to;
  const wild = edges.find((e) => e.from === '*' && e.event === event);
  return wild ? wild.to : null;
}

export function canTransition(edges: readonly Edge[], from: LifecycleState, event: string): boolean {
  return nextState(edges, from, event) !== null;
}

/** List the events legal from a given state (exact + wildcard). */
export function legalEvents(edges: readonly Edge[], from: LifecycleState): string[] {
  const out = new Set<string>();
  for (const e of edges) if (e.from === from || e.from === '*') out.add(e.event);
  return [...out];
}

/**
 * Apply an event immutably: returns a NEW shipment with the new state, an
 * appended audit transition, and updatedAt bumped. Illegal transitions return a
 * typed error, never a throw and never a silent no-op.
 */
export function applyEvent(
  edges: readonly Edge[],
  shipment: Shipment,
  event: string,
  at: string,
  note?: string,
): ParseResult<Shipment> {
  const to = nextState(edges, shipment.state, event);
  if (to === null) {
    return { ok: false, errors: [`illegal transition: cannot '${event}' from '${shipment.state}'`] };
  }
  const transition = { from: shipment.state, to, event, at, ...(note ? { note } : {}) };
  return {
    ok: true,
    value: { ...shipment, state: to, updatedAt: at, audit: [...shipment.audit, transition] },
  };
}
