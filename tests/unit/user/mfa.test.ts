import {
  decryptSecret,
  encryptSecret,
  enrollTotp,
  generateTotp,
  verifyTotp,
} from '../../../services/user/src/domain/mfa';

describe('MFA TOTP', () => {
  it('enrollTotp returns a valid secret and otpauth URI', () => {
    const r = enrollTotp('user@af.test');
    expect(r.secret).toMatch(/^[A-Z2-7]+$/);
    expect(r.otpauthUri).toContain('otpauth://totp/');
    expect(r.otpauthUri).toContain('AutonomousFreight');
  });

  it('verifyTotp accepts a freshly generated code for the same secret', () => {
    const { secret } = enrollTotp('user@af.test');
    const code = generateTotp(secret);
    expect(verifyTotp(code, secret)).toBe(true);
  });

  it('verifyTotp rejects a mismatched code', () => {
    const { secret } = enrollTotp('user@af.test');
    expect(verifyTotp('000000', secret)).toBe(false);
  });
});

describe('MFA secret encryption', () => {
  const KEK = 'unit-test-kek-32-chars-minimum-12345';

  it('round-trips a secret', () => {
    const enc = encryptSecret('JBSWY3DPEHPK3PXP', KEK);
    expect(enc).not.toContain('JBSWY');
    const dec = decryptSecret(enc, KEK);
    expect(dec).toBe('JBSWY3DPEHPK3PXP');
  });

  it('produces different ciphertext on each encryption (random IV/salt)', () => {
    const a = encryptSecret('hello', KEK);
    const b = encryptSecret('hello', KEK);
    expect(a).not.toBe(b);
  });

  it('decrypting with wrong KEK throws', () => {
    const enc = encryptSecret('hello', KEK);
    expect(() => decryptSecret(enc, 'a-different-kek-also-32-chars-12345')).toThrow();
  });
});
