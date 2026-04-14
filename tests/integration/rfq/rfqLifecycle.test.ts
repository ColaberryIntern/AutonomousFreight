import type { Pool } from 'pg';
import request from 'supertest';
import { buildGateway } from '../../../services/api-gateway/src/gateway';
import { CarrierRepository } from '../../../services/carrier/src/repo/carrierRepository';
import { ComplianceRepository } from '../../../services/compliance/src/repo/complianceRepository';
import { InMemoryEventBus } from '../../../services/events/src/inMemoryBus';
import { RfqRepository } from '../../../services/rfq/src/repo/rfqRepository';
import { AuditRepository } from '../../../services/user/src/repo/auditRepository';
import { getTestPool, prepareSchema, truncateUsers } from '../helpers/db';

jest.setTimeout(60_000);

const JWT = 'rfq-integration-secret-12345678';

interface LoginBody {
  accessToken: string;
}
interface RfqBody {
  id: string;
  status: string;
  priceOfferedUsd: number | null;
  confidence: number | null;
  shipmentId: string | null;
}
interface RfqResponse {
  rfq?: RfqBody;
  preview?: { priceUsd: number; confidence: number };
}

async function loginAs(
  app: ReturnType<typeof buildGateway>['app'],
  email: string,
  role: 'admin' | 'broker' = 'broker',
): Promise<string> {
  await request(app).post('/auth/register').send({ email, password: 'GoodPassword99', role });
  const r = await request(app).post('/auth/login').send({ email, password: 'GoodPassword99' });
  return (r.body as LoginBody).accessToken;
}

describe('RFQ → Quote → Won → Shipment lifecycle', () => {
  let pool: Pool;
  let rfqRepo: RfqRepository;
  let carrierRepo: CarrierRepository;
  let complianceRepo: ComplianceRepository;
  let auditRepo: AuditRepository;
  let built: ReturnType<typeof buildGateway>;

  beforeAll(async () => {
    pool = getTestPool();
    await prepareSchema(pool);
    carrierRepo = new CarrierRepository(pool);
    await carrierRepo.runMigrations();
    complianceRepo = new ComplianceRepository(pool);
    await complianceRepo.runMigrations();
    rfqRepo = new RfqRepository(pool);
    await rfqRepo.runMigrations();
    auditRepo = new AuditRepository(pool);
    built = buildGateway({
      pool,
      jwtSecret: JWT,
      jwtTtl: '15m',
      logLevel: 'silent',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1000,
      bus: new InMemoryEventBus(),
    });
  });

  beforeEach(async () => {
    await rfqRepo.truncateForTest();
    await carrierRepo.truncateForTest();
    await truncateUsers(pool);
    await auditRepo.truncateForTest();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('POST /api/v1/rfqs creates an RFQ in received state', async () => {
    const token = await loginAs(built.app, 'rfq-create@af.test');
    const res = await request(built.app)
      .post('/api/v1/rfqs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer: 'ACME Logistics',
        origin: 'Dallas, TX',
        destination: 'Chicago, IL',
        distanceMiles: 920,
        equipmentType: 'dry_van',
        pickupDate: '2026-05-01',
      });
    expect(res.status).toBe(201);
    expect((res.body as RfqBody).status).toBe('received');
  });

  it('rejects unknown equipment', async () => {
    const token = await loginAs(built.app, 'rfq-bad@af.test');
    const res = await request(built.app)
      .post('/api/v1/rfqs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer: 'X',
        origin: 'A',
        destination: 'B',
        distanceMiles: 100,
        equipmentType: 'container',
        pickupDate: '2026-05-01',
      });
    expect(res.status).toBe(400);
  });

  it('run-agent prices a high-confidence RFQ → sent', async () => {
    const token = await loginAs(built.app, 'rfq-agent@af.test');
    const created = await request(built.app)
      .post('/api/v1/rfqs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer: 'ACME',
        origin: 'A',
        destination: 'B',
        distanceMiles: 800,
        equipmentType: 'dry_van',
        pickupDate: '2026-05-01',
      });
    const id = (created.body as RfqBody).id;
    const ran = await request(built.app)
      .post(`/api/v1/rfqs/${id}/run-agent`)
      .set('Authorization', `Bearer ${token}`);
    expect(ran.status).toBe(200);
    const after = (ran.body as RfqResponse).rfq!;
    expect(after.status).toBe('sent');
    expect(after.priceOfferedUsd).toBeGreaterThan(0);
    expect(after.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('low-confidence RFQ becomes exception', async () => {
    const token = await loginAs(built.app, 'rfq-exc@af.test');
    const created = await request(built.app)
      .post('/api/v1/rfqs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer: 'ACME',
        origin: 'A',
        destination: 'B',
        distanceMiles: 4500,
        equipmentType: 'flatbed',
        pickupDate: '2026-05-01',
      });
    const id = (created.body as RfqBody).id;
    await request(built.app)
      .post(`/api/v1/rfqs/${id}/run-agent`)
      .set('Authorization', `Bearer ${token}`);
    const fresh = await request(built.app)
      .get(`/api/v1/rfqs/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect((fresh.body as RfqResponse).rfq!.status).toBe('exception');
  });

  it('respond won materializes a shipment in quoting state', async () => {
    const token = await loginAs(built.app, 'rfq-won@af.test');
    const created = await request(built.app)
      .post('/api/v1/rfqs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer: 'ACME',
        origin: 'A',
        destination: 'B',
        distanceMiles: 800,
        equipmentType: 'dry_van',
        pickupDate: '2026-05-01',
      });
    const id = (created.body as RfqBody).id;
    await request(built.app)
      .post(`/api/v1/rfqs/${id}/run-agent`)
      .set('Authorization', `Bearer ${token}`);
    const respond = await request(built.app)
      .post(`/api/v1/rfqs/${id}/respond`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'won' });
    expect(respond.status).toBe(200);
    const shipmentId = (respond.body as RfqBody).shipmentId;
    expect(shipmentId).toBeTruthy();
    const ship = await carrierRepo.findShipmentById(shipmentId!);
    expect(ship?.status).toBe('quoting');
  });

  it('respond on a not-yet-sent RFQ returns 409', async () => {
    const token = await loginAs(built.app, 'rfq-409@af.test');
    const created = await request(built.app)
      .post('/api/v1/rfqs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer: 'ACME',
        origin: 'A',
        destination: 'B',
        distanceMiles: 800,
        equipmentType: 'dry_van',
        pickupDate: '2026-05-01',
      });
    const id = (created.body as RfqBody).id;
    const respond = await request(built.app)
      .post(`/api/v1/rfqs/${id}/respond`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'won' });
    expect(respond.status).toBe(409);
  });

  it('override action=send moves an exception RFQ to sent', async () => {
    const token = await loginAs(built.app, 'rfq-ovr@af.test');
    const created = await request(built.app)
      .post('/api/v1/rfqs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer: 'ACME',
        origin: 'A',
        destination: 'B',
        distanceMiles: 4500,
        equipmentType: 'flatbed',
        pickupDate: '2026-05-01',
      });
    const id = (created.body as RfqBody).id;
    await request(built.app)
      .post(`/api/v1/rfqs/${id}/run-agent`)
      .set('Authorization', `Bearer ${token}`);
    const ovr = await request(built.app)
      .post(`/api/v1/rfqs/${id}/override`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'send' });
    expect(ovr.status).toBe(200);
    expect((ovr.body as RfqBody).status).toBe('sent');
  });
});
