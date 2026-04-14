import {
  ALL_ROLES,
  DEFAULT_ROLE,
  isKnownRole,
  userHasAnyRole,
} from '../../../services/user/src/domain/rbac';

describe('rbac domain', () => {
  it('whitelist is exactly the four approved roles', () => {
    expect([...ALL_ROLES].sort()).toEqual(['admin', 'auditor', 'broker', 'carrier']);
  });

  it('default role is broker', () => {
    expect(DEFAULT_ROLE).toBe('broker');
  });

  it('isKnownRole accepts whitelist members', () => {
    for (const role of ALL_ROLES) {
      expect(isKnownRole(role)).toBe(true);
    }
  });

  it('isKnownRole rejects unknown strings', () => {
    expect(isKnownRole('root')).toBe(false);
    expect(isKnownRole('')).toBe(false);
    expect(isKnownRole('ADMIN')).toBe(false);
  });

  it('userHasAnyRole returns true when required list is empty (authenticated-only gate)', () => {
    expect(userHasAnyRole([], [])).toBe(true);
    expect(userHasAnyRole(['broker'], [])).toBe(true);
  });

  it('userHasAnyRole returns true on role overlap', () => {
    expect(userHasAnyRole(['broker', 'auditor'], ['auditor'])).toBe(true);
  });

  it('userHasAnyRole returns false when user has no overlap', () => {
    expect(userHasAnyRole(['broker'], ['admin'])).toBe(false);
  });
});
