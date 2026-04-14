import type { Pool } from 'pg';
import request from 'supertest';
import { buildGateway } from '../../../services/api-gateway/src/gateway';
import { REQUEST_ID_HEADER } from '../../../services/api-gateway/src/middleware/traceId';
import { getTestPool, prepareSchema, truncateUsers } from '../helpers/db';

const JWT_SECRET = 'gateway-integration-secret-12345678';
const JWT_TTL = '15m';

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

describe('Gateway — end-to-end (integration)', () => {
  let pool: Pool;
  let built: ReturnType<typeof buildGateway>;

  beforeAll(async () => {
    pool = getTestPool();
    await prepareSchema(pool);
    built = buildGateway({
      pool,
      jwtSecret: JWT_SECRET,
      jwtTtl: JWT_TTL,
      logLevel: 'silent',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1000,
    });
  });

  beforeEach(async () => {
    await truncateUsers(pool);
    built.metricsRegistry.resetMetrics();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('serves /health without auth or rate limit', async () => {
    const res = await request(built.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers[REQUEST_ID_HEADER]).toBeUndefined();
  });

  it('attaches a request id on every non-ops response', async () => {
    const res = await request(built.app)
      .post('/auth/register')
      .send({ email: 'e2e@af.test', password: 'GoodPassword99' });
    expect(res.status).toBe(201);
    const rid = res.headers[REQUEST_ID_HEADER];
    expect(typeof rid).toBe('string');
    expect((rid as string).length).toBeGreaterThan(7);
  });

  it('echoes a valid client-supplied request id', async () => {
    const clientId = 'client-trace-1234';
    const res = await request(built.app)
      .post('/auth/register')
      .set(REQUEST_ID_HEADER, clientId)
      .send({ email: 'echo@af.test', password: 'GoodPassword99' });
    expect(res.headers[REQUEST_ID_HEADER]).toBe(clientId);
  });

  it('runs the full register → login → /me flow through the gateway', async () => {
    const reg = await request(built.app)
      .post('/auth/register')
      .send({ email: 'flow@af.test', password: 'GoodPassword99' });
    expect(reg.status).toBe(201);
    expect((reg.body as RegisterBody).email).toBe('flow@af.test');

    const login = await request(built.app)
      .post('/auth/login')
      .send({ email: 'flow@af.test', password: 'GoodPassword99' });
    expect(login.status).toBe(200);
    const token = (login.body as LoginBody).accessToken;

    const me = await request(built.app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect((me.body as MeBody).user.email).toBe('flow@af.test');
  });

  it('exposes Prometheus metrics and increments after traffic', async () => {
    await request(built.app).get('/health');
    await request(built.app)
      .post('/auth/register')
      .send({ email: 'metric@af.test', password: 'GoodPassword99' });

    const metrics = await request(built.app).get('/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.headers['content-type']).toMatch(/text\/plain/);
    expect(metrics.text).toContain('http_requests_total');
    expect(metrics.text).toMatch(/http_requests_total\{[^}]*method="POST"[^}]*\} 1/);
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(built.app).get('/definitely/not/here');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
    expect(res.headers[REQUEST_ID_HEADER]).toBeDefined();
  });

  it('rate-limits when max is exceeded', async () => {
    const limited = buildGateway({
      pool,
      jwtSecret: JWT_SECRET,
      jwtTtl: JWT_TTL,
      logLevel: 'silent',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 3,
    });
    const agent = request.agent(limited.app);
    await agent.post('/auth/login').send({ email: 'x@af.test', password: 'whatever' });
    await agent.post('/auth/login').send({ email: 'x@af.test', password: 'whatever' });
    await agent.post('/auth/login').send({ email: 'x@af.test', password: 'whatever' });
    const over = await agent.post('/auth/login').send({ email: 'x@af.test', password: 'whatever' });
    expect(over.status).toBe(429);
    expect(over.body).toEqual({ error: 'rate_limited' });
  });
});
