import { issueAccessToken, verifyAccessToken } from '../../../services/user/src/domain/jwt';

const SECRET = 'test-secret-at-least-16-chars-long';

describe('jwt domain', () => {
  it('round-trips claims through sign/verify', () => {
    const token = issueAccessToken(
      { sub: 'user-1', email: 'a@b.com', roles: ['broker'] },
      SECRET,
      '15m',
    );
    const verified = verifyAccessToken(token, SECRET);
    expect(verified.sub).toBe('user-1');
    expect(verified.email).toBe('a@b.com');
    expect(verified.roles).toEqual(['broker']);
    expect(typeof verified.iat).toBe('number');
    expect(typeof verified.exp).toBe('number');
  });

  it('rejects tokens signed with a different secret', () => {
    const token = issueAccessToken({ sub: 'u', email: 'e@e.com', roles: [] }, SECRET, '15m');
    expect(() => verifyAccessToken(token, 'a-different-secret-also-long')).toThrow();
  });

  it('rejects tokens that are already expired (beyond 60s clock tolerance)', () => {
    const token = issueAccessToken({ sub: 'u', email: 'e@e.com', roles: [] }, SECRET, '-120s');
    expect(() => verifyAccessToken(token, SECRET)).toThrow();
  });

  it('throws when the secret is missing or too short', () => {
    expect(() => issueAccessToken({ sub: 'u', email: 'e@e.com', roles: [] }, '', '15m')).toThrow();
    expect(() =>
      issueAccessToken({ sub: 'u', email: 'e@e.com', roles: [] }, 'short', '15m'),
    ).toThrow();
  });
});
