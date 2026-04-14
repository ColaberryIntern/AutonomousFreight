import { hashPassword, verifyPassword } from '../../../services/user/src/domain/password';

jest.setTimeout(30_000);

describe('password domain', () => {
  it('hashPassword produces a bcrypt hash (not plaintext)', async () => {
    const hash = await hashPassword('CorrectHorse9Battery!');
    expect(hash).not.toBe('CorrectHorse9Battery!');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash.length).toBeGreaterThanOrEqual(55);
  });

  it('verifyPassword returns true for the correct plaintext', async () => {
    const hash = await hashPassword('CorrectHorse9Battery!');
    await expect(verifyPassword('CorrectHorse9Battery!', hash)).resolves.toBe(true);
  });

  it('verifyPassword returns false for the wrong plaintext', async () => {
    const hash = await hashPassword('CorrectHorse9Battery!');
    await expect(verifyPassword('wrong-guess', hash)).resolves.toBe(false);
  });

  it('hashPassword is non-deterministic (different salts each call)', async () => {
    const h1 = await hashPassword('SamePlain1Password');
    const h2 = await hashPassword('SamePlain1Password');
    expect(h1).not.toBe(h2);
  });
});
