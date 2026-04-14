import type { Pool } from 'pg';
import request from 'supertest';
import { buildGateway } from '../../../services/api-gateway/src/gateway';
import { CarrierRepository } from '../../../services/carrier/src/repo/carrierRepository';
import { ComplianceRepository } from '../../../services/compliance/src/repo/complianceRepository';
import { InMemoryEventBus } from '../../../services/events/src/inMemoryBus';
import type { DomainEvent } from '../../../services/events/src/types';
import { AuditRepository } from '../../../services/user/src/repo/auditRepository';
import { getTestPool, prepareSchema, truncateUsers } from '../helpers/db';

jest.setTimeout(60_000);

const JWT = 'cockpit-integration-secret-12345678';

interface LoginBody {
  accessToken: string;
}
interface OverviewBody {
  shipments: { byStatus: Record<string, number>; quoting: number; total: number };
  carriers: { active: number };
  compliance: {
    riskBuckets: { green: number; amber: number; red: number; unknown: number };
    artifactsExpiringWithin30d: number;
    artifactsExpired: number;
  };
  auditEventsLast24h: number;
}
interface ShipmentDetailBody {
  shipment: { id: string; status: string };
  bids: Array<{ carrierId: string; costUsd: number }>;
  rankings: Array<{ carrierId: string; score: number }>;
}
interface UsersBody {
  items: Array<{ id: string; email: string; roles: string[]; mfaEnabled: boolean }>;
}
interface AuditBody {
  items: Array<{ action: string; target?: string }>;
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

describe('Supervisor cockpit endpoints', () => {
  let pool: Pool;
  let carrierRepo: CarrierRepository;
  let complianceRepo: ComplianceRepository;
  let auditRepo: AuditRepository;
  let bus: InMemoryEventBus;
  let events: DomainEvent[];
  let built: ReturnType<typeof buildGateway>;

  beforeAll(async () => {
    pool = getTestPool();
    await prepareSchema(pool);
    carrierRepo = new CarrierRepository(pool);
    await carrierRepo.runMigrations();
    complianceRepo = new ComplianceRepository(pool);
    await complianceRepo.runMigrations();
    auditRepo = new AuditRepository(pool);

    bus = new InMemoryEventBus();
    events = [];
    bus.subscribe('shipment.carrier_selected', (e) => {
      events.push(e);
    });

    built = buildGateway({
      pool,
      jwtSecret: JWT,
      jwtTtl: '15m',
      logLevel: 'silent',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1000,
      bus,
    });
  });

  beforeEach(async () => {
    await carrierRepo.truncateForTest();
    await complianceRepo.truncateForTest();
    await auditRepo.truncateForTest();
    await truncateUsers(pool);
    events.length = 0;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('GET /api/v1/dashboard/overview returns zeros on an empty system', async () => {
    const token = await registerAndLogin(built.app, 'empty@af.test');
    const res = await request(built.app)
      .get('/api/v1/dashboard/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const body = res.body as OverviewBody;
    expect(body.carriers.active).toBe(0);
    expect(body.shipments.total).toBe(0);
    expect(body.compliance.riskBuckets).toEqual({ green: 0, amber: 0, red: 0, unknown: 0 });
  });

  it('GET /api/v1/shipments/:id returns shipment + bids + rankings', async () => {
    const token = await registerAndLogin(built.app, 'det@af.test');
    const ship = await carrierRepo.createShipmentForTest('Austin', 'Denver', 900);
    const c1 = await carrierRepo.createCarrierForTest('Alpha', 5, true);
    const c2 = await carrierRepo.createCarrierForTest('Bravo', 3, true);
    await carrierRepo.createBidForTest(ship, c1, 800, 10);
    await carrierRepo.createBidForTest(ship, c2, 1200, 50);

    const res = await request(built.app)
      .get(`/api/v1/shipments/${ship}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const body = res.body as ShipmentDetailBody;
    expect(body.shipment.status).toBe('quoting');
    expect(body.bids).toHaveLength(2);
    expect(body.rankings).toHaveLength(2);
    expect(body.rankings[0]?.carrierId).toBe(c1);
  });

  it('POST /api/v1/shipments/:id/assign-carrier moves quoting → assigned + audits + emits event', async () => {
    const token = await registerAndLogin(built.app, 'assign@af.test');
    const ship = await carrierRepo.createShipmentForTest('Houston', 'Atlanta', 800);
    const c1 = await carrierRepo.createCarrierForTest('Delta', 4, true);
    await carrierRepo.createBidForTest(ship, c1, 900, 15);

    const res = await request(built.app)
      .post(`/api/v1/shipments/${ship}/assign-carrier`)
      .set('Authorization', `Bearer ${token}`)
      .send({ carrierId: c1 });
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 30));

    const after = await carrierRepo.findShipmentById(ship);
    expect(after?.status).toBe('assigned');

    const auditRows = await auditRepo.listForTest('shipment.assigned');
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.target).toBe(ship);

    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('shipment.carrier_selected');
  });

  it('POST assign-carrier returns 409 for already-assigned shipment', async () => {
    const token = await registerAndLogin(built.app, 'twice@af.test');
    const ship = await carrierRepo.createShipmentForTest('A', 'B', 100);
    const c1 = await carrierRepo.createCarrierForTest('C', 4, true);
    await carrierRepo.createBidForTest(ship, c1, 500, 20);

    await request(built.app)
      .post(`/api/v1/shipments/${ship}/assign-carrier`)
      .set('Authorization', `Bearer ${token}`)
      .send({ carrierId: c1 });

    const res = await request(built.app)
      .post(`/api/v1/shipments/${ship}/assign-carrier`)
      .set('Authorization', `Bearer ${token}`)
      .send({ carrierId: c1 });
    expect(res.status).toBe(409);
  });

  it('POST assign-carrier returns 400 for carrier with no bid', async () => {
    const token = await registerAndLogin(built.app, 'nobid@af.test');
    const ship = await carrierRepo.createShipmentForTest('A', 'B', 100);
    const c = await carrierRepo.createCarrierForTest('Lonely', 4, true);
    const res = await request(built.app)
      .post(`/api/v1/shipments/${ship}/assign-carrier`)
      .set('Authorization', `Bearer ${token}`)
      .send({ carrierId: c });
    expect(res.status).toBe(400);
  });

  it('GET /api/v1/scoring/weights returns formula + weights', async () => {
    const token = await registerAndLogin(built.app, 'weights@af.test');
    const res = await request(built.app)
      .get('/api/v1/scoring/weights')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      weights: { cost: 0.4, distance: 0.3, rating: 0.3 },
    });
  });

  it('GET /api/v1/compliance/summary returns risk buckets (admin/auditor only)', async () => {
    const adminToken = await registerAndLogin(built.app, 'sumadm@af.test', 'admin');
    const brokerToken = await registerAndLogin(built.app, 'sumbrk@af.test', 'broker');

    const forbidden = await request(built.app)
      .get('/api/v1/compliance/summary')
      .set('Authorization', `Bearer ${brokerToken}`);
    expect(forbidden.status).toBe(403);

    const res = await request(built.app)
      .get('/api/v1/compliance/summary')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('riskBuckets');
    expect(res.body).toHaveProperty('artifactsByType');
  });

  it('GET /api/v1/admin/users (admin only) lists registered users', async () => {
    const adminToken = await registerAndLogin(built.app, 'listadm@af.test', 'admin');
    await registerAndLogin(built.app, 'extra1@af.test');
    await registerAndLogin(built.app, 'extra2@af.test');

    const res = await request(built.app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const body = res.body as UsersBody;
    expect(body.items.length).toBeGreaterThanOrEqual(3);
    expect(body.items.every((u) => typeof u.mfaEnabled === 'boolean')).toBe(true);
  });

  it('GET /api/v1/audit/logs returns admin-audit feed with pagination', async () => {
    const adminToken = await registerAndLogin(built.app, 'auditadm@af.test', 'admin');
    await auditRepo.record({ action: 'test.event', target: 'x' });
    await auditRepo.record({ action: 'test.event', target: 'y' });
    await auditRepo.record({ action: 'other.event', target: 'z' });

    const all = await request(built.app)
      .get('/api/v1/audit/logs?limit=50')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(all.status).toBe(200);
    expect((all.body as AuditBody).items.length).toBeGreaterThanOrEqual(3);

    const filtered = await request(built.app)
      .get('/api/v1/audit/logs?action=test.event')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(filtered.status).toBe(200);
    const actions = (filtered.body as AuditBody).items.map((i) => i.action);
    expect(actions.every((a) => a === 'test.event')).toBe(true);
  });

  it('broker cannot access admin audit feed', async () => {
    const brokerToken = await registerAndLogin(built.app, 'brkaudit@af.test');
    const res = await request(built.app)
      .get('/api/v1/audit/logs')
      .set('Authorization', `Bearer ${brokerToken}`);
    expect(res.status).toBe(403);
  });
});
