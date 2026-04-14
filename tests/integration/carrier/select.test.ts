import type { Pool } from 'pg';
import request from 'supertest';
import { buildGateway } from '../../../services/api-gateway/src/gateway';
import { CarrierRepository } from '../../../services/carrier/src/repo/carrierRepository';
import { getTestPool, prepareSchema, truncateUsers } from '../helpers/db';

const JWT_SECRET = 'carrier-integration-secret-12345678';
const JWT_TTL = '15m';

interface LoginBody {
  accessToken: string;
}
interface RankingsBody {
  shipmentId: string;
  rankings: Array<{
    carrierId: string;
    carrierName: string;
    rating: number;
    costUsd: number;
    pickupDistanceMiles: number;
    score: number;
  }>;
}

async function registerAndLogin(
  app: ReturnType<typeof buildGateway>['app'],
  email: string,
  role: 'admin' | 'broker' | 'auditor' = 'broker',
): Promise<string> {
  await request(app).post('/auth/register').send({ email, password: 'GoodPassword99', role });
  const login = await request(app).post('/auth/login').send({ email, password: 'GoodPassword99' });
  return (login.body as LoginBody).accessToken;
}

describe('POST /api/v1/shipments/:id/select-carrier', () => {
  let pool: Pool;
  let carrierRepo: CarrierRepository;
  let built: ReturnType<typeof buildGateway>;

  beforeAll(async () => {
    pool = getTestPool();
    await prepareSchema(pool);
    carrierRepo = new CarrierRepository(pool);
    await carrierRepo.runMigrations();
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
    await carrierRepo.truncateForTest();
    await truncateUsers(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('returns 401 without a bearer token', async () => {
    const res = await request(built.app).post(
      '/api/v1/shipments/00000000-0000-0000-0000-000000000000/select-carrier',
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for an auditor (not admin/broker)', async () => {
    const token = await registerAndLogin(built.app, 'auditor@af.test', 'auditor');
    const res = await request(built.app)
      .post('/api/v1/shipments/00000000-0000-0000-0000-000000000000/select-carrier')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 for a non-UUID shipment id', async () => {
    const token = await registerAndLogin(built.app, 'broker1@af.test');
    const res = await request(built.app)
      .post('/api/v1/shipments/not-a-uuid/select-carrier')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 404 when the shipment does not exist', async () => {
    const token = await registerAndLogin(built.app, 'broker2@af.test');
    const res = await request(built.app)
      .post('/api/v1/shipments/11111111-1111-1111-1111-111111111111/select-carrier')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 409 when shipment is not in quoting status', async () => {
    const token = await registerAndLogin(built.app, 'broker3@af.test');
    const shipmentId = await carrierRepo.createShipmentForTest(
      'Dallas, TX',
      'Chicago, IL',
      900,
      'assigned',
    );
    const res = await request(built.app)
      .post(`/api/v1/shipments/${shipmentId}/select-carrier`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it('returns empty rankings for a quoting shipment with no bids', async () => {
    const token = await registerAndLogin(built.app, 'broker4@af.test');
    const shipmentId = await carrierRepo.createShipmentForTest('A', 'B', 500);
    const res = await request(built.app)
      .post(`/api/v1/shipments/${shipmentId}/select-carrier`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect((res.body as RankingsBody).rankings).toEqual([]);
  });

  it('ranks carriers deterministically and excludes inactive ones', async () => {
    const token = await registerAndLogin(built.app, 'broker5@af.test');
    const shipmentId = await carrierRepo.createShipmentForTest('Austin, TX', 'Denver, CO', 900);

    const c1 = await carrierRepo.createCarrierForTest('Alpha Freight', 5, true);
    const c2 = await carrierRepo.createCarrierForTest('Bravo Trucking', 3, true);
    const c3 = await carrierRepo.createCarrierForTest('Inactive Co', 5, false);

    await carrierRepo.createBidForTest(shipmentId, c1, 500, 10);
    await carrierRepo.createBidForTest(shipmentId, c2, 1500, 60);
    await carrierRepo.createBidForTest(shipmentId, c3, 100, 5);

    const res = await request(built.app)
      .post(`/api/v1/shipments/${shipmentId}/select-carrier`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as RankingsBody;
    expect(body.shipmentId).toBe(shipmentId);
    expect(body.rankings).toHaveLength(2);
    expect(body.rankings[0]?.carrierName).toBe('Alpha Freight');
    expect(body.rankings[0]?.score).toBe(1);
    expect(body.rankings[1]?.carrierName).toBe('Bravo Trucking');
    expect(body.rankings.find((r) => r.carrierName === 'Inactive Co')).toBeUndefined();
  });

  it('respects ?top=N query parameter', async () => {
    const token = await registerAndLogin(built.app, 'broker6@af.test');
    const shipmentId = await carrierRepo.createShipmentForTest('X', 'Y', 200);
    for (let i = 0; i < 5; i++) {
      const cid = await carrierRepo.createCarrierForTest(`C${i}`, 3 + (i % 3));
      await carrierRepo.createBidForTest(shipmentId, cid, 500 + i * 100, 10 + i * 5);
    }
    const res = await request(built.app)
      .post(`/api/v1/shipments/${shipmentId}/select-carrier?top=2`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect((res.body as RankingsBody).rankings).toHaveLength(2);
  });

  it('rejects top outside [1, 50]', async () => {
    const token = await registerAndLogin(built.app, 'broker7@af.test');
    const shipmentId = await carrierRepo.createShipmentForTest('X', 'Y', 200);
    const res0 = await request(built.app)
      .post(`/api/v1/shipments/${shipmentId}/select-carrier?top=0`)
      .set('Authorization', `Bearer ${token}`);
    expect(res0.status).toBe(400);
    const res100 = await request(built.app)
      .post(`/api/v1/shipments/${shipmentId}/select-carrier?top=100`)
      .set('Authorization', `Bearer ${token}`);
    expect(res100.status).toBe(400);
  });
});
