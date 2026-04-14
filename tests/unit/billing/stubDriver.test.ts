import { StubBillingDriver } from '../../../services/billing/src/drivers/stubBillingDriver';

describe('StubBillingDriver', () => {
  it('subscribes and reads back', async () => {
    const d = new StubBillingDriver();
    const sub = await d.subscribe('cust_1', 'pro');
    expect(sub.status).toBe('active');
    expect(sub.planId).toBe('pro');
    const got = await d.get('cust_1');
    expect(got?.planId).toBe('pro');
  });

  it('cancel marks subscription canceled', async () => {
    const d = new StubBillingDriver();
    await d.subscribe('cust_1', 'basic');
    const c = await d.cancel('cust_1');
    expect(c.status).toBe('canceled');
  });

  it('cancel rejects when no subscription exists', async () => {
    const d = new StubBillingDriver();
    await expect(d.cancel('ghost')).rejects.toBeDefined();
  });

  it('get returns null for unknown customer', async () => {
    const d = new StubBillingDriver();
    expect(await d.get('nobody')).toBeNull();
  });
});
