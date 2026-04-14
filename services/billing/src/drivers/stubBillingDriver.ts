import type { BillingDriver, Subscription } from './billingDriver';
import type { PlanId } from '../domain/plans';

export class StubBillingDriver implements BillingDriver {
  private readonly subscriptions = new Map<string, Subscription>();

  subscribe(customerId: string, planId: PlanId): Promise<Subscription> {
    const periodEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const sub: Subscription = {
      customerId,
      planId,
      status: 'active',
      currentPeriodEnd: periodEnd,
    };
    this.subscriptions.set(customerId, sub);
    return Promise.resolve(sub);
  }

  cancel(customerId: string): Promise<Subscription> {
    const existing = this.subscriptions.get(customerId);
    if (!existing) {
      return Promise.reject(new Error(`no subscription for ${customerId}`));
    }
    const canceled: Subscription = { ...existing, status: 'canceled' };
    this.subscriptions.set(customerId, canceled);
    return Promise.resolve(canceled);
  }

  get(customerId: string): Promise<Subscription | null> {
    return Promise.resolve(this.subscriptions.get(customerId) ?? null);
  }
}
