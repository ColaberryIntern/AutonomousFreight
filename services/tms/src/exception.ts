/**
 * Exception handling — sub-types + recovery paths.
 *
 * CLAUDE.md Failure-First Design: "A feature is not designed until its failure
 * paths are designed" and exception must not be a silent dead-end. Each
 * sub-type has a detection hint, an owner, and a concrete recovery action.
 */
import type { ParseResult, Shipment } from '../../oms/src/schema/shipment.v1';
import { applyTmsEvent, type TmsEvent } from './stateMachine';

export const EXCEPTION_SUBTYPES = ['no_capacity', 'no_show', 'breakdown', 'customer_dispute', 'document_missing'] as const;
export type ExceptionSubtype = (typeof EXCEPTION_SUBTYPES)[number];

export interface RecoveryPlan {
  subtype: ExceptionSubtype;
  owner: 'automation' | 'dispatcher' | 'account_owner' | 'compliance';
  /** The TMS event that resumes forward progress after recovery. */
  recoveryEvent: TmsEvent;
  description: string;
}

export const RECOVERY: Record<ExceptionSubtype, RecoveryPlan> = {
  no_capacity: { subtype: 'no_capacity', owner: 'automation', recoveryEvent: 'resume_sourcing', description: 'Re-source: widen lane radius, re-post to boards, raise offer within margin floor.' },
  no_show: { subtype: 'no_show', owner: 'dispatcher', recoveryEvent: 'resume_sourcing', description: 'Carrier no-show: release carrier, re-source, flag carrier reliability score.' },
  breakdown: { subtype: 'breakdown', owner: 'dispatcher', recoveryEvent: 'resume_sourcing', description: 'Equipment breakdown: arrange recovery/relay, re-source replacement if undeliverable.' },
  customer_dispute: { subtype: 'customer_dispute', owner: 'account_owner', recoveryEvent: 'resume_sourcing', description: 'Customer dispute: pause, account owner resolves scope/rate, then resume.' },
  document_missing: { subtype: 'document_missing', owner: 'compliance', recoveryEvent: 'resume_sourcing', description: 'Missing document (BOL/POD/insurance): request + verify before proceeding.' },
};

export function recoveryFor(subtype: ExceptionSubtype): RecoveryPlan {
  return RECOVERY[subtype];
}

export type FlagResult = { ok: true; shipment: Shipment; recovery: RecoveryPlan } | { ok: false; errors: string[] };

/** Flag a typed exception on an active shipment and attach its recovery plan. */
export function flagException(shipment: Shipment, subtype: ExceptionSubtype, at: string): FlagResult {
  const moved = applyTmsEvent(shipment, 'exception', at, `exception:${subtype}`);
  if (!moved.ok) return { ok: false, errors: moved.errors };
  return { ok: true, shipment: moved.value, recovery: RECOVERY[subtype] };
}

/** Execute the recovery: EXCEPTION → SOURCING (only from EXCEPTION). */
export function recover(shipment: Shipment, at: string): ParseResult<Shipment> {
  return applyTmsEvent(shipment, 'resume_sourcing', at);
}
