import { isTrialExpired, trialDaysRemaining, getTrialStatus } from '../../../services/billing/src/domain/trial';

describe('trial domain', () => {
  it('returns 14 days remaining for a trial that just started', () => {
    const now = new Date().toISOString();
    expect(trialDaysRemaining(now)).toBe(14);
  });

  it('returns 0 days remaining for a trial that started 15 days ago', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 86_400_000).toISOString();
    expect(trialDaysRemaining(fifteenDaysAgo)).toBe(0);
  });

  it('isTrialExpired returns false for active trial', () => {
    const now = new Date().toISOString();
    expect(isTrialExpired(now)).toBe(false);
  });

  it('isTrialExpired returns true for expired trial', () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    expect(isTrialExpired(old)).toBe(true);
  });

  it('returns 0 for invalid ISO string', () => {
    expect(trialDaysRemaining('not-a-date')).toBe(0);
  });

  it('getTrialStatus returns full status object', () => {
    const now = new Date().toISOString();
    const status = getTrialStatus(now);
    expect(status.active).toBe(true);
    expect(status.daysRemaining).toBe(14);
    expect(typeof status.endsAt).toBe('string');
  });

  it('getTrialStatus shows inactive for expired trial', () => {
    const old = new Date(Date.now() - 20 * 86_400_000).toISOString();
    const status = getTrialStatus(old);
    expect(status.active).toBe(false);
    expect(status.daysRemaining).toBe(0);
  });
});
