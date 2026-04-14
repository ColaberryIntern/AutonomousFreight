import type { Pool } from 'pg';
import request from 'supertest';
import { buildServer } from '../../../services/user/src/api/server';
import { getTestPool, prepareSchema, truncateUsers } from '../helpers/db';

interface RegisterBody {
  userId: string;
  email: string;
  roles: string[];
}
interface LoginBody {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}
interface MeBody {
  user: { userId: string; email: string; roles: string[] };
}
const asRegister = (b: unknown): RegisterBody => b as RegisterBody;
const asLogin = (b: unknown): LoginBody => b as LoginBody;
const asMe = (b: unknown): MeBody => b as MeBody;

const JWT_SECRET = 'integration-test-secret-12345678';
const JWT_TTL = '15m';

describe('User Service — auth flow (integration)', () => {
  let pool: Pool;
  let app: ReturnType<typeof buildServer>;

  beforeAll(async () => {
    pool = getTestPool();
    await prepareSchema(pool);
    app = buildServer({ pool, jwtSecret: JWT_SECRET, jwtTtl: JWT_TTL });
  });

  beforeEach(async () => {
    await truncateUsers(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('POST /auth/register', () => {
    it('creates a user with the default broker role and returns 201', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'broker@af.test', password: 'GoodPassword99' });
      expect(res.status).toBe(201);
      const body = asRegister(res.body);
      expect(body).toMatchObject({ email: 'broker@af.test', roles: ['broker'] });
      expect(typeof body.userId).toBe('string');
    });

    it('returns 400 for a malformed email', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'GoodPassword99' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for a password that fails policy', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'a@b.com', password: 'short' });
      expect(res.status).toBe(400);
    });

    it('returns 409 on duplicate email', async () => {
      await request(app)
        .post('/auth/register')
        .send({ email: 'dup@af.test', password: 'GoodPassword99' });
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'dup@af.test', password: 'GoodPassword99' });
      expect(res.status).toBe(409);
    });

    it('accepts a whitelisted role and rejects unknown ones', async () => {
      const ok = await request(app)
        .post('/auth/register')
        .send({ email: 'admin@af.test', password: 'GoodPassword99', role: 'admin' });
      expect(ok.status).toBe(201);
      expect(asRegister(ok.body).roles).toEqual(['admin']);

      const bad = await request(app)
        .post('/auth/register')
        .send({ email: 'x@af.test', password: 'GoodPassword99', role: 'superadmin' });
      expect(bad.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('returns a JWT on correct credentials', async () => {
      await request(app)
        .post('/auth/register')
        .send({ email: 'login@af.test', password: 'GoodPassword99' });
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'login@af.test', password: 'GoodPassword99' });
      expect(res.status).toBe(200);
      const body = asLogin(res.body);
      expect(typeof body.accessToken).toBe('string');
      expect(body.tokenType).toBe('Bearer');
      expect(body.expiresIn).toBe(900);
    });

    it('returns 401 for wrong password (no enumeration signal)', async () => {
      await request(app)
        .post('/auth/register')
        .send({ email: 'loginbad@af.test', password: 'GoodPassword99' });
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'loginbad@af.test', password: 'WRONG-guess-1' });
      expect(res.status).toBe(401);
    });

    it('returns 401 for non-existent user', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'ghost@af.test', password: 'GoodPassword99' });
      expect(res.status).toBe(401);
    });
  });

  describe('RBAC on protected routes', () => {
    it('rejects requests to /me with no Authorization header', async () => {
      const res = await request(app).get('/me');
      expect(res.status).toBe(401);
    });

    it('accepts /me with a valid token and populates req.user', async () => {
      await request(app)
        .post('/auth/register')
        .send({ email: 'me@af.test', password: 'GoodPassword99' });
      const login = await request(app)
        .post('/auth/login')
        .send({ email: 'me@af.test', password: 'GoodPassword99' });
      const token = asLogin(login.body).accessToken;

      const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(asMe(res.body).user).toMatchObject({ email: 'me@af.test', roles: ['broker'] });
    });

    it('blocks a broker from /admin/ping with 403', async () => {
      await request(app)
        .post('/auth/register')
        .send({ email: 'brokerx@af.test', password: 'GoodPassword99' });
      const login = await request(app)
        .post('/auth/login')
        .send({ email: 'brokerx@af.test', password: 'GoodPassword99' });
      const token = asLogin(login.body).accessToken;

      const res = await request(app).get('/admin/ping').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('allows an admin through /admin/ping', async () => {
      await request(app)
        .post('/auth/register')
        .send({ email: 'adminx@af.test', password: 'GoodPassword99', role: 'admin' });
      const login = await request(app)
        .post('/auth/login')
        .send({ email: 'adminx@af.test', password: 'GoodPassword99' });
      const token = asLogin(login.body).accessToken;

      const res = await request(app).get('/admin/ping').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });
});
