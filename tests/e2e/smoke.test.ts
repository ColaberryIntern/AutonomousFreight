import { Pool } from 'pg';
import request from 'supertest';
import { buildGateway } from '../../services/api-gateway/src/gateway';
import { CarrierRepository } from '../../services/carrier/src/repo/carrierRepository';
import { InMemoryEventBus } from '../../services/events/src/inMemoryBus';
import {
  CaptureEmailDriver,
  PreferencesRepository,
  startNotificationService,
} from '../../services/notifications/src/index';
import { UserRepository } from '../../services/user/src/repo/userRepository';

const JWT_SECRET = 'smoke-test-secret-12345678';
const DB = process.env['DATABASE_URL'] ?? 'postgres://freight:freight@localhost:5434/freight_dev';

interface LoginBody {
  accessToken: string;
}
interface RankingsBody {
  rankings: Array<{ carrierName: string; score: number }>;
}

describe('SMOKE — critical user journey', () => {
  let pool: Pool;
  let app: ReturnType<typeof buildGateway>['app'];
  let carrierRepo: CarrierRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB });
    await new UserRepository(pool).runMigrations();
    carrierRepo = new CarrierRepository(pool);
    await carrierRepo.runMigrations();
    await new PreferencesRepository(pool).runMigrations();
    process.env['NODE_ENV'] = 'test';
    await new UserRepository(pool).deleteAllForTest();
    await carrierRepo.truncateForTest();
    const bus = new InMemoryEventBus();
    startNotificationService({ pool, bus, driver: new CaptureEmailDriver() });
    const built = buildGateway({
      pool,
      jwtSecret: JWT_SECRET,
      jwtTtl: '15m',
      logLevel: 'silent',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 100,
      bus,
    });
    app = built.app;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('register → login → me → select-carrier', async () => {
    const reg = await request(app)
      .post('/auth/register')
      .send({ email: 'smoke@af.test', password: 'GoodPassword99', role: 'broker' });
    expect(reg.status).toBe(201);

    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'smoke@af.test', password: 'GoodPassword99' });
    expect(login.status).toBe(200);
    const token = (login.body as LoginBody).accessToken;

    const me = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);

    const shipmentId = await carrierRepo.createShipmentForTest('Dallas', 'Denver', 800);
    const c1 = await carrierRepo.createCarrierForTest('SmokeCarrier A', 5, true);
    const c2 = await carrierRepo.createCarrierForTest('SmokeCarrier B', 3, true);
    await carrierRepo.createBidForTest(shipmentId, c1, 700, 15);
    await carrierRepo.createBidForTest(shipmentId, c2, 1200, 50);

    const sel = await request(app)
      .post(`/api/v1/shipments/${shipmentId}/select-carrier`)
      .set('Authorization', `Bearer ${token}`);
    expect(sel.status).toBe(200);
    const body = sel.body as RankingsBody;
    expect(body.rankings).toHaveLength(2);
    expect(body.rankings[0]?.carrierName).toBe('SmokeCarrier A');
  });

  it('GET /openapi.json publishes the API contract', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    const doc = res.body as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.paths['/auth/register']).toBeDefined();
    expect(doc.paths['/api/v1/shipments/{id}/select-carrier']).toBeDefined();
  });
});
