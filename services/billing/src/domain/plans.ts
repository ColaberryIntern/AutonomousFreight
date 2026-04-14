export type PlanId = 'basic' | 'pro' | 'enterprise';

export interface Plan {
  id: PlanId;
  name: string;
  priceUsd: number;
}

export const PLANS: Record<PlanId, Plan> = {
  basic: { id: 'basic', name: 'Basic', priceUsd: 49 },
  pro: { id: 'pro', name: 'Professional', priceUsd: 99 },
  enterprise: { id: 'enterprise', name: 'Enterprise', priceUsd: 199 },
};

export function isPlanId(s: string): s is PlanId {
  return s === 'basic' || s === 'pro' || s === 'enterprise';
}
