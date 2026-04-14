import type { Pool } from 'pg';
import request from 'supertest';
import { buildGateway } from '../../../services/api-gateway/src/gateway';
import { InMemoryEventBus } from '../../../services/events/src/inMemoryBus';
import {
  CaptureEmailDriver,
  PreferencesRepository,
  startNotificationService,
} from '../../../services/notifications/src/index';
import { getTestPool, prepareSchema, truncateUsers } from '../helpers/db';

const JWT_SECRET = 'notifications-integration-secret-12345678';
const JWT_TTL = '15m';

describe('Notification flow — register → email captured', () => {
  let pool: Pool;
  let bus: InMemoryEventBus;
  let driver: CaptureEmailDriver;
  let built: ReturnType<typeof buildGateway>;

  beforeAll(async () => {
    pool = getTestPool();
    await prepareSchema(pool);
    await new PreferencesRepository(pool).runMigrations();
    bus = new InMemoryEventBus();
    driver = new CaptureEmailDriver();
    startNotificationService({ pool, bus, driver });
    built = buildGateway({
      pool,
      jwtSecret: JWT_SECRET,
      jwtTtl: JWT_TTL,
      logLevel: 'silent',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1000,
      bus,
    });
  });

  beforeEach(async () => {
    await truncateUsers(pool);
    driver.clear();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('registering a user triggers exactly one welcome email', async () => {
    const res = await request(built.app)
      .post('/auth/register')
      .send({ email: 'notify@af.test', password: 'GoodPassword99' });
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 50));

    expect(driver.sent).toHaveLength(1);
    const sent = driver.sent[0];
    expect(sent?.to).toBe('notify@af.test');
    expect(sent?.subject).toBe('Welcome to Autonomous Freight');
    expect(sent?.text).toContain('broker');
  });

  it('failed registration (duplicate email) does not emit a second email', async () => {
    await request(built.app)
      .post('/auth/register')
      .send({ email: 'once@af.test', password: 'GoodPassword99' });
    expect(driver.sent).toHaveLength(1);

    const dup = await request(built.app)
      .post('/auth/register')
      .send({ email: 'once@af.test', password: 'GoodPassword99' });
    expect(dup.status).toBe(409);
    expect(driver.sent).toHaveLength(1);
  });
});
