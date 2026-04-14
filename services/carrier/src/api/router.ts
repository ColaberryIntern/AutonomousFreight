import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { evaluateAssignmentGates } from '../../../compliance/src/domain/gates';
import { ComplianceRepository } from '../../../compliance/src/repo/complianceRepository';
import type { EventBus } from '../../../events/src/types';
import { requireAuth, requireRole } from '../../../user/src/api/authMiddleware';
import { AuditRepository } from '../../../user/src/repo/auditRepository';
import { rankCarriers, WEIGHTS } from '../domain/scoring';
import { CarrierRepository } from '../repo/carrierRepository';
import { selectCarrierController } from './selectCarrierController';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AssignBody = z.object({
  carrierId: z.string().regex(UUID_RE),
  reason: z.string().min(10).max(500).optional(),
});

export interface CarrierRouterDeps {
  pool: Pool;
  jwtSecret: string;
  bus?: EventBus;
}

export function buildCarrierRouter({ pool, jwtSecret, bus }: CarrierRouterDeps): Router {
  const router = Router();
  const repo = new CarrierRepository(pool);
  const complianceRepo = new ComplianceRepository(pool);
  const audit = new AuditRepository(pool);

  router.get('/api/v1/shipments', requireAuth(jwtSecret), async (_req, res) => {
    const items = await repo.listShipments();
    res.status(200).json({ items });
  });

  router.get(
    '/api/v1/shipments/:id',
    requireAuth(jwtSecret),
    requireRole('admin', 'broker', 'auditor'),
    async (req, res) => {
      const raw = req.params['id'];
      const id = typeof raw === 'string' ? raw : '';
      if (!UUID_RE.test(id)) {
        res.status(400).json({ error: 'invalid_shipment_id' });
        return;
      }
      const shipment = await repo.findShipmentById(id);
      if (!shipment) {
        res.status(404).json({ error: 'shipment_not_found' });
        return;
      }
      const bids = await repo.listActiveBidsForShipment(id);
      const rankings = rankCarriers(bids);
      res.status(200).json({ shipment, bids, rankings });
    },
  );

  router.get('/api/v1/carriers', requireAuth(jwtSecret), async (req, res) => {
    const activeOnly = req.query['active'] !== 'false';
    const items = await repo.listCarriers(activeOnly);
    res.status(200).json({ items });
  });

  router.get('/api/v1/scoring/weights', requireAuth(jwtSecret), (_req, res) => {
    res.status(200).json({
      weights: WEIGHTS,
      formula: 'score = 0.4*cost_norm + 0.3*distance_norm + 0.3*rating_norm',
      notes:
        'Deterministic v1 per directive 030. Lower cost + closer pickup + higher rating = higher score.',
    });
  });

  router.post(
    '/api/v1/shipments/:id/select-carrier',
    requireAuth(jwtSecret),
    requireRole('admin', 'broker'),
    selectCarrierController(repo),
  );

  router.get(
    '/api/v1/shipments/:id/gates/:carrierId',
    requireAuth(jwtSecret),
    requireRole('admin', 'broker'),
    async (req, res) => {
      const sRaw = req.params['id'];
      const cRaw = req.params['carrierId'];
      const shipmentId = typeof sRaw === 'string' ? sRaw : '';
      const carrierId = typeof cRaw === 'string' ? cRaw : '';
      if (!UUID_RE.test(shipmentId) || !UUID_RE.test(carrierId)) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }
      const carrier = await repo.findCarrierById(carrierId);
      if (!carrier) {
        res.status(404).json({ error: 'carrier_not_found' });
        return;
      }
      const snap = await complianceRepo.getCarrierCompliance(carrierId);
      const evalResult = evaluateAssignmentGates({ id: carrier.id, active: carrier.active }, snap);
      res.status(200).json(evalResult);
    },
  );

  router.post(
    '/api/v1/shipments/:id/assign-carrier',
    requireAuth(jwtSecret),
    requireRole('admin', 'broker'),
    async (req, res) => {
      const raw = req.params['id'];
      const shipmentId = typeof raw === 'string' ? raw : '';
      if (!UUID_RE.test(shipmentId)) {
        res.status(400).json({ error: 'invalid_shipment_id' });
        return;
      }
      const parsed = AssignBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input' });
        return;
      }
      const wantsOverride = req.query['override'] === 'true';

      // Compliance gate evaluation BEFORE the mutation.
      const carrier = await repo.findCarrierById(parsed.data.carrierId);
      if (!carrier) {
        res.status(400).json({ error: 'no_such_bid' });
        return;
      }
      const snap = await complianceRepo.getCarrierCompliance(parsed.data.carrierId);
      const gate = evaluateAssignmentGates({ id: carrier.id, active: carrier.active }, snap);
      if (gate.result === 'hard') {
        const blockEntry: Parameters<typeof audit.record>[0] = {
          action: 'gate.hard_blocked',
          target: shipmentId,
          metadata: { carrierId: parsed.data.carrierId, findings: gate.findings },
        };
        if (req.user?.userId) blockEntry.actorUserId = req.user.userId;
        void audit.record(blockEntry);
        res.status(422).json({
          error: 'compliance_blocked',
          findings: gate.findings,
        });
        return;
      }
      if (gate.result === 'soft' && !wantsOverride) {
        res.status(422).json({
          error: 'compliance_warn',
          findings: gate.findings,
          requiresOverride: true,
        });
        return;
      }
      if (gate.result === 'soft' && wantsOverride) {
        if (!parsed.data.reason) {
          res.status(400).json({ error: 'invalid_reason' });
          return;
        }
      }

      const result = await repo.assignCarrier(shipmentId, parsed.data.carrierId);
      if (!result.ok) {
        const status =
          result.reason === 'shipment_not_found'
            ? 404
            : result.reason === 'no_such_bid'
              ? 400
              : 409;
        res.status(status).json({ error: result.reason });
        return;
      }
      // Compute the score that was implicitly accepted, for audit + event payload
      const bids = await repo.listActiveBidsForShipment(shipmentId);
      const ranked = rankCarriers(bids);
      const chosen = ranked.find((r) => r.carrierId === parsed.data.carrierId);
      const score = chosen?.score ?? 0;

      if (gate.result === 'soft' && wantsOverride) {
        const overrideEntry: Parameters<typeof audit.record>[0] = {
          action: 'gate.soft_overridden',
          target: shipmentId,
          metadata: {
            carrierId: parsed.data.carrierId,
            findings: gate.findings,
            reason: parsed.data.reason,
          },
        };
        if (req.user?.userId) overrideEntry.actorUserId = req.user.userId;
        void audit.record(overrideEntry);
      }

      const auditEntry: Parameters<typeof audit.record>[0] = {
        action: 'shipment.assigned',
        target: shipmentId,
        metadata: { carrierId: parsed.data.carrierId, score },
      };
      if (req.user?.userId) auditEntry.actorUserId = req.user.userId;
      void audit.record(auditEntry);
      if (bus) {
        try {
          await bus.publish({
            name: 'shipment.carrier_selected',
            version: 1,
            occurredAt: new Date().toISOString(),
            payload: { shipmentId, carrierId: parsed.data.carrierId, score },
          });
        } catch (err) {
          console.error('[assign-carrier] event publish failed', err);
        }
      }
      res.status(200).json({ ok: true, shipmentId, carrierId: parsed.data.carrierId, score });
    },
  );

  router.get('/api/v1/dashboard/overview', requireAuth(jwtSecret), async (_req, res) => {
    const complianceRepo = new (
      await import('../../../compliance/src/repo/complianceRepository')
    ).ComplianceRepository(pool);
    const [shipmentCounts, activeCarriers, summary, auditSince] = await Promise.all([
      repo.countShipmentsByStatus(),
      repo.countActiveCarriers(),
      complianceRepo.getSummary(30),
      audit.countSince(new Date(Date.now() - 24 * 3600_000).toISOString()),
    ]);
    res.status(200).json({
      shipments: {
        byStatus: shipmentCounts,
        quoting: shipmentCounts['quoting'] ?? 0,
        total: Object.values(shipmentCounts).reduce((a, b) => a + b, 0),
      },
      carriers: { active: activeCarriers },
      compliance: {
        riskBuckets: summary.riskBuckets,
        artifactsExpiringWithin30d: summary.artifactsExpiring.total,
        artifactsExpired: summary.artifactsExpiring.expired,
      },
      auditEventsLast24h: auditSince,
    });
  });

  return router;
}
