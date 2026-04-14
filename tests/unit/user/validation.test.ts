import { LoginSchema, RegisterSchema } from '../../../services/user/src/domain/validation';

describe('validation schemas', () => {
  describe('RegisterSchema', () => {
    it('accepts a well-formed payload', () => {
      const result = RegisterSchema.safeParse({
        email: 'broker@example.com',
        password: 'GoodPassword99',
        role: 'broker',
      });
      expect(result.success).toBe(true);
    });

    it('accepts a payload without a role (default applied downstream)', () => {
      const result = RegisterSchema.safeParse({
        email: 'broker@example.com',
        password: 'GoodPassword99',
      });
      expect(result.success).toBe(true);
    });

    it('rejects malformed emails', () => {
      const result = RegisterSchema.safeParse({
        email: 'not-an-email',
        password: 'GoodPassword99',
      });
      expect(result.success).toBe(false);
    });

    it('rejects passwords shorter than policy minimum', () => {
      const result = RegisterSchema.safeParse({
        email: 'broker@example.com',
        password: 'Short9',
      });
      expect(result.success).toBe(false);
    });

    it('rejects passwords without a digit', () => {
      const result = RegisterSchema.safeParse({
        email: 'broker@example.com',
        password: 'NoDigitsHere!',
      });
      expect(result.success).toBe(false);
    });

    it('rejects passwords without a letter', () => {
      const result = RegisterSchema.safeParse({
        email: 'broker@example.com',
        password: '123456789012345',
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown roles', () => {
      const result = RegisterSchema.safeParse({
        email: 'broker@example.com',
        password: 'GoodPassword99',
        role: 'superadmin',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('LoginSchema', () => {
    it('accepts a well-formed payload', () => {
      const result = LoginSchema.safeParse({
        email: 'broker@example.com',
        password: 'anything-at-all',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty password', () => {
      const result = LoginSchema.safeParse({ email: 'broker@example.com', password: '' });
      expect(result.success).toBe(false);
    });

    it('rejects malformed email', () => {
      const result = LoginSchema.safeParse({ email: 'bad', password: 'x' });
      expect(result.success).toBe(false);
    });
  });
});
