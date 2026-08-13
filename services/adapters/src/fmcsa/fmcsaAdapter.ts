/**
 * FMCSA adapter — carrier authority + insurance verification.
 *
 * Per Brett (Jun 18): "build it directly yourself to avoid the middleware where
 * you don't need it. The documentation is compelling and available. It's a
 * public site. OpenAPI." Starboard middleware is explicitly NOT in scope.
 * Phase-1 engine targets the free SaferWeb tier (authority + insurance); a
 * `qcmobile-paid` engine can be swapped later behind the same contract.
 */
import type { AdapterEngine, AdapterResult } from '../contract';

export type AuthorityStatus = 'ACTIVE' | 'INACTIVE' | 'NONE';

export interface CarrierAuthority {
  dotNumber: string;
  mcNumber?: string;
  legalName: string;
  dbaName?: string;
  authorityStatus: AuthorityStatus;
  allowedToOperate: boolean;
  outOfServiceDate?: string;
}

export interface CarrierInsurance {
  dotNumber: string;
  bipdRequiredUsd: number;
  bipdOnFileUsd: number;
  cargoOnFile: boolean;
  insuranceOnFile: boolean;
}

/** A carrier is bookable only if authority is active AND insurance is on file. */
export function isBookable(auth: CarrierAuthority, ins: CarrierInsurance, requiredCargoUsd: number): boolean {
  return (
    auth.authorityStatus === 'ACTIVE' &&
    auth.allowedToOperate &&
    ins.insuranceOnFile &&
    ins.bipdOnFileUsd >= ins.bipdRequiredUsd &&
    (requiredCargoUsd <= 0 || ins.cargoOnFile)
  );
}

/** Normalize a DOT or MC identifier to a lookup key. */
export function normalizeId(raw: string): { type: 'dot' | 'mc'; value: string } | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  const mc = s.match(/^MC-?(\d{3,8})$/);
  if (mc) return { type: 'mc', value: mc[1]! };
  const dot = s.match(/^(?:USDOT|DOT)?-?(\d{3,8})$/);
  if (dot) return { type: 'dot', value: dot[1]! };
  return null;
}

export interface FmcsaEngine extends AdapterEngine {
  readonly kind: 'fmcsa';
  getCarrierAuthority(id: string, correlationSeed: string): Promise<AdapterResult<CarrierAuthority>>;
  getInsurance(dotNumber: string, correlationSeed: string): Promise<AdapterResult<CarrierInsurance>>;
}
