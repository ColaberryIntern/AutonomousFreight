import {
  isConsentCurrent,
  buildConsentStatus,
  CURRENT_CONSENT_VERSION,
} from '../../../services/user/src/domain/consent';

describe('consent domain', () => {
  it('isConsentCurrent returns true for matching version', () => {
    expect(isConsentCurrent(CURRENT_CONSENT_VERSION)).toBe(true);
  });

  it('isConsentCurrent returns false for null', () => {
    expect(isConsentCurrent(null)).toBe(false);
  });

  it('isConsentCurrent returns false for old version', () => {
    expect(isConsentCurrent('0.9')).toBe(false);
  });

  it('buildConsentStatus shows not consented when null', () => {
    const status = buildConsentStatus(null, null);
    expect(status.hasConsented).toBe(false);
    expect(status.isCurrent).toBe(false);
    expect(status.consentVersion).toBeNull();
  });

  it('buildConsentStatus shows current consent', () => {
    const now = new Date().toISOString();
    const status = buildConsentStatus(CURRENT_CONSENT_VERSION, now);
    expect(status.hasConsented).toBe(true);
    expect(status.isCurrent).toBe(true);
    expect(status.consentGivenAt).toBe(now);
  });

  it('buildConsentStatus shows outdated consent', () => {
    const status = buildConsentStatus('0.5', '2025-01-01T00:00:00Z');
    expect(status.hasConsented).toBe(true);
    expect(status.isCurrent).toBe(false);
  });
});
