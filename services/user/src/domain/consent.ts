export const CURRENT_CONSENT_VERSION = '1.0';

export interface ConsentStatus {
  hasConsented: boolean;
  consentVersion: string | null;
  consentGivenAt: string | null;
  isCurrent: boolean;
}

/**
 * Checks whether the user's recorded consent matches the required version.
 * Pure function — no side effects.
 */
export function isConsentCurrent(
  consentVersion: string | null,
  requiredVersion: string = CURRENT_CONSENT_VERSION,
): boolean {
  return consentVersion === requiredVersion;
}

/**
 * Builds a consent status object for API responses.
 */
export function buildConsentStatus(
  consentVersion: string | null,
  consentGivenAt: string | null,
): ConsentStatus {
  return {
    hasConsented: consentVersion !== null,
    consentVersion,
    consentGivenAt,
    isCurrent: isConsentCurrent(consentVersion),
  };
}
