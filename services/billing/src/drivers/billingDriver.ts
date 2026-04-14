import type { PlanId } from '../domain/plans';

export interface Subscription {
  customerId: string;
  planId: PlanId;
  status: 'active' | 'canceled' | 'past_due';
  currentPeriodEnd: string;
}

export interface BillingDriver {
  subscribe(customerId: string, planId: PlanId): Promise<Subscription>;
  cancel(customerId: string): Promise<Subscription>;
  get(customerId: string): Promise<Subscription | null>;
}
