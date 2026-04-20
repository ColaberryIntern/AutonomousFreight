export type PlanId = 'trial' | 'basic' | 'pro' | 'enterprise';

export interface Plan {
  id: PlanId;
  name: string;
  priceUsd: number;
  trialDays?: number;
}

export const PLANS: Record<PlanId, Plan> = {
  trial: { id: 'trial', name: 'Free Trial', priceUsd: 0, trialDays: 14 },
  basic: { id: 'basic', name: 'Basic', priceUsd: 49 },
  pro: { id: 'pro', name: 'Professional', priceUsd: 99 },
  enterprise: { id: 'enterprise', name: 'Enterprise', priceUsd: 199 },
};

export function isPlanId(s: string): s is PlanId {
  return s === 'trial' || s === 'basic' || s === 'pro' || s === 'enterprise';
}
