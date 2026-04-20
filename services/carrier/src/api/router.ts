import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { evaluateAssignmentGates } from '../../../compliance/src/domain/gates';
import { computeRiskScore, type ComplianceSnapshot } from '../../../compliance/src/domain/riskScore';
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

  router.get('/api/v1/shipments/:id/milestones', requireAuth(jwtSecret), async (req, res) => {
    const raw = req.params['id'];
    const id = typeof raw === 'string' ? raw : '';
    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: 'invalid_shipment_id' });
      return;
    }
    const r = await repo.pool.query<{
      id: string;
      milestone: string;
      occurred_at: Date;
      metadata: Record<string, unknown>;
    }>(
      `SELECT id::text, milestone, occurred_at, metadata
         FROM shipment_milestones WHERE shipment_id = $1
         ORDER BY occurred_at ASC`,
      [id],
    );
    res.status(200).json({
      items: r.rows.map((row) => ({
        id: row.id,
        milestone: row.milestone,
        occurredAt: row.occurred_at.toISOString(),
        metadata: row.metadata,
      })),
    });
  });

  const DocUploadBody = z.object({
    docType: z.enum(['bol', 'pod', 'invoice']),
    rawText: z.string().min(1).max(10000),
  });

  router.post(
    '/api/v1/shipments/:id/documents',
    requireAuth(jwtSecret),
    requireRole('admin', 'broker'),
    async (req, res) => {
      const raw = req.params['id'];
      const shipmentId = typeof raw === 'string' ? raw : '';
      if (!UUID_RE.test(shipmentId)) {
        res.status(400).json({ error: 'invalid_shipment_id' });
        return;
      }
      const parsed = DocUploadBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input' });
        return;
      }
      await repo.pool.query(
        `INSERT INTO shipment_documents (shipment_id, doc_type, raw_text)
         VALUES ($1, $2, $3)`,
        [shipmentId, parsed.data.docType, parsed.data.rawText],
      );
      const auditEntry: Parameters<typeof audit.record>[0] = {
        action: 'document.uploaded',
        target: shipmentId,
        metadata: { docType: parsed.data.docType },
      };
      if (req.user?.userId) auditEntry.actorUserId = req.user.userId;
      void audit.record(auditEntry);
      res.status(201).json({ ok: true });
    },
  );

  const AGENT_REGISTRY = [
    {
      name: 'quoting_agent',
      label: 'Quoting Agent',
      department: 'quoting',
      type: 'pricing',
      schedule: 'Every 5s — prices RFQs',
      directive: '200',
      auditPrefix: 'rfq.',
    },
    {
      name: 'procurement_agent',
      label: 'Procurement Agent',
      department: 'procurement',
      type: 'assignment',
      schedule: 'Every 5s — auto-assigns carriers',
      directive: '210',
      auditPrefix: 'agent.procurement.',
    },
    {
      name: 'tracking_agent',
      label: 'Tracking Agent',
      department: 'execution',
      type: 'simulation',
      schedule: 'Every 5s — milestone progression',
      directive: '211',
      auditPrefix: 'agent.tracking.',
    },
    {
      name: 'document_agent',
      label: 'Document Agent',
      department: 'documents',
      type: 'validation',
      schedule: 'Every 5s — BOL extraction',
      directive: '212',
      auditPrefix: 'agent.document.',
    },
    {
      name: 'rate_audit_agent',
      label: 'Rate Audit Agent',
      department: 'financials',
      type: 'audit',
      schedule: 'Every 5s — margin check',
      directive: '220',
      auditPrefix: 'agent.rate_audit.',
    },
    {
      name: 'invoice_agent',
      label: 'Invoice Agent',
      department: 'financials',
      type: 'generation',
      schedule: 'Every 5s — auto-invoice',
      directive: '220',
      auditPrefix: 'agent.invoice.',
    },
    {
      name: 'payment_match_agent',
      label: 'Payment Match Agent',
      department: 'financials',
      type: 'matching',
      schedule: 'Every 5s — three-way match',
      directive: '230',
      auditPrefix: 'agent.payment.',
    },
    {
      name: 'settlement_agent',
      label: 'Settlement Agent',
      department: 'financials',
      type: 'settlement',
      schedule: 'Every 5s — carrier payment queue',
      directive: '230',
      auditPrefix: 'agent.settlement.',
    },
    {
      name: 'dispute_agent',
      label: 'Dispute Agent',
      department: 'financials',
      type: 'resolution',
      schedule: 'Every 5s — auto-resolve < 5%',
      directive: '230',
      auditPrefix: 'agent.dispute.',
    },
  ] as const;

  router.get('/api/v1/agents', requireAuth(jwtSecret), async (_req, res) => {
    const agents = await Promise.all(
      AGENT_REGISTRY.map(async (agent) => {
        const lastRun = await pool.query<{ occurred_at: Date; action: string }>(
          `SELECT occurred_at, action FROM audit_log
           WHERE action LIKE $1 ORDER BY id DESC LIMIT 1`,
          [`${agent.auditPrefix}%`],
        );
        const runCount = await pool.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM audit_log WHERE action LIKE $1`,
          [`${agent.auditPrefix}%`],
        );
        return {
          ...agent,
          status: 'active' as const,
          lastRunAt: lastRun.rows[0]?.occurred_at?.toISOString() ?? null,
          lastAction: lastRun.rows[0]?.action ?? null,
          totalRuns: Number(runCount.rows[0]?.c ?? 0),
        };
      }),
    );
    res.status(200).json({ agents });
  });

  router.get('/api/v1/agents/:name/history', requireAuth(jwtSecret), async (req, res) => {
    const raw = req.params['name'];
    const name = typeof raw === 'string' ? raw : '';
    const agent = AGENT_REGISTRY.find((a) => a.name === name);
    if (!agent) {
      res.status(404).json({ error: 'agent_not_found' });
      return;
    }
    const limit = Number(req.query['limit'] ?? 30);
    const r = await pool.query<{
      id: string;
      action: string;
      target: string | null;
      metadata: Record<string, unknown>;
      occurred_at: Date;
    }>(
      `SELECT id::text, action, target, metadata, occurred_at
       FROM audit_log WHERE action LIKE $1
       ORDER BY id DESC LIMIT $2`,
      [`${agent.auditPrefix}%`, Math.min(limit, 100)],
    );
    res.status(200).json({
      agent,
      runs: r.rows.map((row) => ({
        id: row.id,
        action: row.action,
        target: row.target,
        metadata: row.metadata,
        occurredAt: row.occurred_at.toISOString(),
        status:
          row.action.includes('exception') ||
          row.action.includes('failed') ||
          row.action.includes('blocked')
            ? 'failed'
            : 'success',
      })),
    });
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

  const SimulateGateBody = z.object({
    carrierId: z.string().regex(UUID_RE),
    snapshot: z.object({
      operatingStatus: z.enum(['active', 'out_of_service', 'unknown']),
      safetyRating: z.enum(['satisfactory', 'conditional', 'unsatisfactory', 'unrated']),
      insuranceOnFile: z.boolean(),
      snapshotAgeDays: z.number().min(0),
    }),
  });

  router.post(
    '/api/v1/security/simulate-gate',
    requireAuth(jwtSecret),
    requireRole('admin', 'broker'),
    async (req, res) => {
      const parsed = SimulateGateBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
        return;
      }
      const carrier = await repo.findCarrierById(parsed.data.carrierId);
      if (!carrier) {
        res.status(404).json({ error: 'carrier_not_found' });
        return;
      }
      const hypothetical: ComplianceSnapshot = parsed.data.snapshot;
      const gateResult = evaluateAssignmentGates(
        { id: carrier.id, active: carrier.active },
        hypothetical,
      );
      const riskScore = computeRiskScore(hypothetical);
      res.status(200).json({ gate: gateResult, riskScore, simulated: true });
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
