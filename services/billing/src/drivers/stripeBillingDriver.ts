/**
 * Sprint 18 — Stripe driver wrapper. Construction throws if STRIPE_SECRET_KEY missing,
 * making activation a fail-fast gate. No live calls without an explicit owner decision.
 */
import type { BillingDriver, Subscription } from './billingDriver';
import type { PlanId } from '../domain/plans';

export interface StripeConfig {
  apiKey: string;
  priceIds: Record<PlanId, string>;
}

export class StripeBillingDriver implements BillingDriver {
  private readonly priceIds: Record<PlanId, string>;

  constructor(cfg: StripeConfig) {
    if (!cfg.apiKey || !cfg.apiKey.startsWith('sk_')) {
      throw new Error('STRIPE_SECRET_KEY missing or malformed (must start with sk_)');
    }
    for (const [plan, id] of Object.entries(cfg.priceIds)) {
      if (!id) throw new Error(`Stripe price id missing for plan ${plan}`);
    }
    this.priceIds = cfg.priceIds;
  }

  subscribe(_customerId: string, planId: PlanId): Promise<Subscription> {
    void this.priceIds[planId];
    throw new Error(
      'StripeBillingDriver.subscribe not yet wired — Sprint 18 ships the contract; live activation is gated behind owner approval (see tmp/escalation.json)',
    );
  }

  cancel(_customerId: string): Promise<Subscription> {
    throw new Error('StripeBillingDriver.cancel not yet wired');
  }

  get(_customerId: string): Promise<Subscription | null> {
    throw new Error('StripeBillingDriver.get not yet wired');
  }
}
