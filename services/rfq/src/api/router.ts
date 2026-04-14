import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { CarrierRepository } from '../../../carrier/src/repo/carrierRepository';
import type { EventBus } from '../../../events/src/types';
import { requireAuth, requireRole } from '../../../user/src/api/authMiddleware';
import { AuditRepository } from '../../../user/src/repo/auditRepository';
import { runQuotingAgentTick } from '../agent/quotingAgent';
import { isKnownEquipment, priceRfq } from '../domain/pricing';
import { RfqRepository, type RfqStatus } from '../repo/rfqRepository';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateBody = z.object({
  customer: z.string().min(1).max(200),
  origin: z.string().min(1).max(200),
  destination: z.string().min(1).max(200),
  distanceMiles: z.number().int().min(1).max(5000),
  equipmentType: z.string().refine(isKnownEquipment, { message: 'invalid equipment' }),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const RespondBody = z.object({ outcome: z.enum(['won', 'lost']) });
const OverrideBody = z.object({ action: z.enum(['send', 'kill']) });

export interface RfqRouterDeps {
  pool: Pool;
  jwtSecret: string;
  bus?: EventBus;
}

export function buildRfqRouter({ pool, jwtSecret, bus }: RfqRouterDeps): Router {
  const router = Router();
  const repo = new RfqRepository(pool);
  const audit = new AuditRepository(pool);
  const carrierRepo = new CarrierRepository(pool);

  router.post(
    '/api/v1/rfqs',
    requireAuth(jwtSecret),
    requireRole('admin', 'broker'),
    async (req, res) => {
      const parsed = CreateBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input', issues: parsed.error.issues });
        return;
      }
      const created = await repo.create(parsed.data as Parameters<typeof repo.create>[0]);
      const auditEntry: Parameters<typeof audit.record>[0] = {
        action: 'rfq.created',
        target: created.id,
        metadata: { customer: created.customer },
      };
      if (req.user?.userId) auditEntry.actorUserId = req.user.userId;
      void audit.record(auditEntry);
      res.status(201).json(created);
    },
  );

  router.get('/api/v1/rfqs', requireAuth(jwtSecret), async (req, res) => {
    const status =
      typeof req.query['status'] === 'string' ? (req.query['status'] as RfqStatus) : undefined;
    const limit = req.query['limit'] !== undefined ? Number(req.query['limit']) : 50;
    const offset = req.query['offset'] !== undefined ? Number(req.query['offset']) : 0;
    const items = await repo.list(status ? { status, limit, offset } : { limit, offset });
    res.status(200).json({ items });
  });

  router.get('/api/v1/rfqs/:id', requireAuth(jwtSecret), async (req, res) => {
    const raw = req.params['id'];
    const id = typeof raw === 'string' ? raw : '';
    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }
    const rfq = await repo.findById(id);
    if (!rfq) {
      res.status(404).json({ error: 'rfq_not_found' });
      return;
    }
    const preview =
      rfq.status === 'parsed' || rfq.status === 'received'
        ? priceRfq({ distanceMiles: rfq.distanceMiles, equipmentType: rfq.equipmentType })
        : null;
    res.status(200).json({ rfq, preview });
  });

  router.post(
    '/api/v1/rfqs/:id/run-agent',
    requireAuth(jwtSecret),
    requireRole('admin', 'broker'),
    async (req, res) => {
      const raw = req.params['id'];
      const id = typeof raw === 'string' ? raw : '';
      if (!UUID_RE.test(id)) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }
      const rfq = await repo.findById(id);
      if (!rfq) {
        res.status(404).json({ error: 'rfq_not_found' });
        return;
      }
      if (rfq.status !== 'received' && rfq.status !== 'parsed') {
        res.status(409).json({ error: 'already_priced' });
        return;
      }
      const r = await runQuotingAgentTick(bus ? { repo, audit, bus } : { repo, audit });
      const fresh = await repo.findById(id);
      res.status(200).json({ rfq: fresh, agent: r });
    },
  );

  router.post(
    '/api/v1/rfqs/:id/override',
    requireAuth(jwtSecret),
    requireRole('admin', 'broker'),
    async (req, res) => {
      const raw = req.params['id'];
      const id = typeof raw === 'string' ? raw : '';
      if (!UUID_RE.test(id)) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }
      const parsed = OverrideBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input' });
        return;
      }
      const rfq = await repo.findById(id);
      if (!rfq) {
        res.status(404).json({ error: 'rfq_not_found' });
        return;
      }
      if (rfq.status !== 'exception') {
        res.status(409).json({ error: 'not_overridable' });
        return;
      }
      const next = parsed.data.action === 'send' ? 'sent' : 'lost';
      await repo.setStatus(id, next, parsed.data.action === 'kill' ? 'override_kill' : undefined);
      const auditEntry: Parameters<typeof audit.record>[0] = {
        action: parsed.data.action === 'send' ? 'rfq.override_sent' : 'rfq.override_killed',
        target: id,
      };
      if (req.user?.userId) auditEntry.actorUserId = req.user.userId;
      void audit.record(auditEntry);
      const fresh = await repo.findById(id);
      res.status(200).json(fresh);
    },
  );

  router.post(
    '/api/v1/rfqs/:id/respond',
    requireAuth(jwtSecret),
    requireRole('admin', 'broker'),
    async (req, res) => {
      const raw = req.params['id'];
      const id = typeof raw === 'string' ? raw : '';
      if (!UUID_RE.test(id)) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }
      const parsed = RespondBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input' });
        return;
      }
      const rfq = await repo.findById(id);
      if (!rfq) {
        res.status(404).json({ error: 'rfq_not_found' });
        return;
      }
      if (rfq.status !== 'sent') {
        res.status(409).json({ error: 'not_responsive' });
        return;
      }

      if (parsed.data.outcome === 'lost') {
        await repo.setStatus(id, 'lost', 'customer_declined');
        const auditEntry: Parameters<typeof audit.record>[0] = {
          action: 'rfq.lost',
          target: id,
        };
        if (req.user?.userId) auditEntry.actorUserId = req.user.userId;
        void audit.record(auditEntry);
        const fresh = await repo.findById(id);
        res.status(200).json(fresh);
        return;
      }

      // Won → materialize a shipment
      if (rfq.shipmentId) {
        res.status(409).json({ error: 'duplicate' });
        return;
      }
      const shipmentId = await carrierRepo.createShipment(
        rfq.origin,
        rfq.destination,
        rfq.distanceMiles,
      );
      await repo.attachShipment(id, shipmentId);
      const auditEntry: Parameters<typeof audit.record>[0] = {
        action: 'rfq.won',
        target: id,
        metadata: { shipmentId },
      };
      if (req.user?.userId) auditEntry.actorUserId = req.user.userId;
      void audit.record(auditEntry);
      const shipAudit: Parameters<typeof audit.record>[0] = {
        action: 'shipment.created_from_rfq',
        target: shipmentId,
        metadata: { rfqId: id },
      };
      if (req.user?.userId) shipAudit.actorUserId = req.user.userId;
      void audit.record(shipAudit);
      if (bus) {
        try {
          await bus.publish({
            name: 'rfq.won',
            version: 1,
            occurredAt: new Date().toISOString(),
            payload: { rfqId: id, shipmentId },
          });
        } catch (err) {
          console.error('[rfq.respond] publish failed', err);
        }
      }
      const fresh = await repo.findById(id);
      res.status(200).json(fresh);
    },
  );

  return router;
}
