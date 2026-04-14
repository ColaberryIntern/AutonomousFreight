import type { Pool } from 'pg';
import request from 'supertest';
import { buildServer } from '../../../services/user/src/api/server';
import { generateTotp } from '../../../services/user/src/domain/mfa';
import { decryptSecret } from '../../../services/user/src/domain/mfa';
import { UserRepository } from '../../../services/user/src/repo/userRepository';
import { getTestPool, prepareSchema, truncateUsers } from '../helpers/db';

const JWT_SECRET = 'mfa-integration-secret-12345678';
const KEK = 'mfa-integration-kek-32-chars-min!!!';

interface LoginBody {
  accessToken?: string;
  mfaRequired?: boolean;
}
interface EnrollBody {
  secret: string;
  otpauthUri: string;
}

jest.setTimeout(60_000);

describe('MFA HTTP flow', () => {
  let pool: Pool;
  let app: ReturnType<typeof buildServer>;

  beforeAll(async () => {
    pool = getTestPool();
    await prepareSchema(pool);
    app = buildServer({
      pool,
      jwtSecret: JWT_SECRET,
      jwtTtl: '15m',
      mfaKek: KEK,
    });
  });

  beforeEach(async () => {
    await truncateUsers(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('full enroll → verify → mfa-login flow', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'mfa@af.test', password: 'GoodPassword99' });

    const login1 = await request(app)
      .post('/auth/login')
      .send({ email: 'mfa@af.test', password: 'GoodPassword99' });
    expect(login1.status).toBe(200);
    const token1 = (login1.body as LoginBody).accessToken;
    expect(typeof token1).toBe('string');

    const enroll = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${token1 ?? ''}`);
    expect(enroll.status).toBe(200);
    const { secret, otpauthUri } = enroll.body as EnrollBody;
    expect(typeof secret).toBe('string');
    expect(otpauthUri).toContain('otpauth://totp/');

    const verify = await request(app)
      .post('/auth/mfa/verify')
      .set('Authorization', `Bearer ${token1 ?? ''}`)
      .send({ code: generateTotp(secret) });
    expect(verify.status).toBe(200);

    const login2 = await request(app)
      .post('/auth/login')
      .send({ email: 'mfa@af.test', password: 'GoodPassword99' });
    expect(login2.status).toBe(200);
    expect((login2.body as LoginBody).mfaRequired).toBe(true);
    expect((login2.body as LoginBody).accessToken).toBeUndefined();

    const mfaLogin = await request(app)
      .post('/auth/mfa/login')
      .send({
        email: 'mfa@af.test',
        password: 'GoodPassword99',
        code: generateTotp(secret),
      });
    expect(mfaLogin.status).toBe(200);
    expect(typeof (mfaLogin.body as LoginBody).accessToken).toBe('string');
  });

  it('rejects /auth/mfa/verify with a wrong 6-digit code', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'badcode@af.test', password: 'GoodPassword99' });
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'badcode@af.test', password: 'GoodPassword99' });
    const token = (login.body as LoginBody).accessToken;
    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${token ?? ''}`);
    const verify = await request(app)
      .post('/auth/mfa/verify')
      .set('Authorization', `Bearer ${token ?? ''}`)
      .send({ code: '000000' });
    expect(verify.status).toBe(401);
  });

  it('mfa-login fails for a user that has not enabled MFA yet', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'noenable@af.test', password: 'GoodPassword99' });
    const r = await request(app).post('/auth/mfa/login').send({
      email: 'noenable@af.test',
      password: 'GoodPassword99',
      code: '123456',
    });
    expect(r.status).toBe(401);
  });

  it('decrypted MFA secret matches what enroll returned (round-trip via DB)', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'rt@af.test', password: 'GoodPassword99' });
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'rt@af.test', password: 'GoodPassword99' });
    const token = (login.body as LoginBody).accessToken;
    const enroll = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${token ?? ''}`);
    const { secret } = enroll.body as EnrollBody;

    const repo = new UserRepository(pool);
    const fresh = await repo.findByEmailWithMfa('rt@af.test');
    expect(fresh?.mfaSecretEnc).toBeDefined();
    expect(decryptSecret(fresh!.mfaSecretEnc!, KEK)).toBe(secret);
  });
});
