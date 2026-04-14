import type { Pool } from 'pg';
import request from 'supertest';
import { buildGateway } from '../../../services/api-gateway/src/gateway';
import { CarrierRepository } from '../../../services/carrier/src/repo/carrierRepository';
import { ComplianceRepository } from '../../../services/compliance/src/repo/complianceRepository';
import { InMemoryEventBus } from '../../../services/events/src/inMemoryBus';
import { AuditRepository } from '../../../services/user/src/repo/auditRepository';
import { getTestPool, prepareSchema, truncateUsers } from '../helpers/db';

jest.setTimeout(60_000);

const JWT = 'gates-integration-secret-12345678';

interface LoginBody {
  accessToken: string;
}
interface GateBody {
  result: 'pass' | 'soft' | 'hard';
  findings: Array<{ code: string; severity: string }>;
}
interface ErrorBody {
  error: string;
  findings?: Array<{ code: string; severity: string }>;
  requiresOverride?: boolean;
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

describe('Compliance gates on assign-carrier', () => {
  let pool: Pool;
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
    await carrierRepo.truncateForTest();
    await complianceRepo.truncateForTest();
    await truncateUsers(pool);
    await auditRepo.truncateForTest();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('preflight returns hard for carrier with no compliance snapshot', async () => {
    const token = await loginAs(built.app, 'gate-pre@af.test');
    const ship = await carrierRepo.createShipmentForTest('A', 'B', 100);
    const carrier = await carrierRepo.createCarrierForTest('Naked Carrier', 4, true);
    await carrierRepo.createBidForTest(ship, carrier, 500, 20);
    const res = await request(built.app)
      .get(`/api/v1/shipments/${ship}/gates/${carrier}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect((res.body as GateBody).result).toBe('hard');
    expect((res.body as GateBody).findings.map((f) => f.code)).toContain('no_compliance_snapshot');
  });

  it('hard-blocks assign when carrier has no insurance + writes gate.hard_blocked audit', async () => {
    const token = await loginAs(built.app, 'gate-hard@af.test');
    const ship = await carrierRepo.createShipmentForTest('A', 'B', 100);
    const carrier = await carrierRepo.createCarrierForTest('Uninsured', 4, true);
    await carrierRepo.createBidForTest(ship, carrier, 500, 20);
    await complianceRepo.upsertCarrierComplianceForTest(carrier, {
      operatingStatus: 'active',
      safetyRating: 'satisfactory',
      insuranceOnFile: false,
    });

    const res = await request(built.app)
      .post(`/api/v1/shipments/${ship}/assign-carrier`)
      .set('Authorization', `Bearer ${token}`)
      .send({ carrierId: carrier });
    expect(res.status).toBe(422);
    const body = res.body as ErrorBody;
    expect(body.error).toBe('compliance_blocked');
    expect(body.findings?.map((f) => f.code)).toContain('no_insurance');

    await new Promise((r) => setTimeout(r, 50));
    const after = await carrierRepo.findShipmentById(ship);
    expect(after?.status).toBe('quoting');

    const audits = await auditRepo.listForTest('gate.hard_blocked');
    expect(audits).toHaveLength(1);
  });

  it('soft-warns assign without override; succeeds with override + reason; audits gate.soft_overridden', async () => {
    const token = await loginAs(built.app, 'gate-soft@af.test');
    const ship = await carrierRepo.createShipmentForTest('A', 'B', 100);
    const carrier = await carrierRepo.createCarrierForTest('Conditional', 4, true);
    await carrierRepo.createBidForTest(ship, carrier, 500, 20);
    await complianceRepo.upsertCarrierComplianceForTest(carrier, {
      operatingStatus: 'active',
      safetyRating: 'conditional',
      insuranceOnFile: true,
    });

    // Without override
    const warn = await request(built.app)
      .post(`/api/v1/shipments/${ship}/assign-carrier`)
      .set('Authorization', `Bearer ${token}`)
      .send({ carrierId: carrier });
    expect(warn.status).toBe(422);
    const warnBody = warn.body as ErrorBody;
    expect(warnBody.error).toBe('compliance_warn');
    expect(warnBody.requiresOverride).toBe(true);

    // With override but no reason
    const noReason = await request(built.app)
      .post(`/api/v1/shipments/${ship}/assign-carrier?override=true`)
      .set('Authorization', `Bearer ${token}`)
      .send({ carrierId: carrier });
    expect(noReason.status).toBe(400);

    // With override + reason
    const ok = await request(built.app)
      .post(`/api/v1/shipments/${ship}/assign-carrier?override=true`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        carrierId: carrier,
        reason: 'Customer accepted carrier risk; lane is critical and no alternates.',
      });
    expect(ok.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    const audits = await auditRepo.listForTest('gate.soft_overridden');
    expect(audits).toHaveLength(1);
    const overrideRow = audits[0]!;
    const meta = overrideRow.metadata as { reason: string; findings: Array<{ code: string }> };
    expect(meta.reason).toContain('Customer accepted');
    expect(meta.findings.map((f) => f.code)).toContain('safety_conditional');
  });

  it('passes for a clean carrier — no gate audit rows, regular shipment.assigned only', async () => {
    const token = await loginAs(built.app, 'gate-pass@af.test');
    const ship = await carrierRepo.createShipmentForTest('A', 'B', 100);
    const carrier = await carrierRepo.createCarrierForTest('Pristine', 5, true);
    await carrierRepo.createBidForTest(ship, carrier, 500, 20);
    await complianceRepo.upsertCarrierComplianceForTest(carrier, {
      operatingStatus: 'active',
      safetyRating: 'satisfactory',
      insuranceOnFile: true,
    });

    const res = await request(built.app)
      .post(`/api/v1/shipments/${ship}/assign-carrier`)
      .set('Authorization', `Bearer ${token}`)
      .send({ carrierId: carrier });
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    expect(await auditRepo.listForTest('gate.hard_blocked')).toHaveLength(0);
    expect(await auditRepo.listForTest('gate.soft_overridden')).toHaveLength(0);
    const assigned = await auditRepo.listForTest('shipment.assigned');
    expect(assigned).toHaveLength(1);
  });
});
