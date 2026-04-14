import { Router } from 'express';
import type { Pool } from 'pg';
import { requireAuth, requireRole } from '../../../user/src/api/authMiddleware';
import { computeRiskScore } from '../domain/riskScore';
import { ComplianceRepository } from '../repo/complianceRepository';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ComplianceRouterDeps {
  pool: Pool;
  jwtSecret: string;
}

export function buildComplianceRouter({ pool, jwtSecret }: ComplianceRouterDeps): Router {
  const router = Router();
  const repo = new ComplianceRepository(pool);

  router.get(
    '/api/v1/compliance/summary',
    requireAuth(jwtSecret),
    requireRole('admin', 'auditor'),
    async (_req, res) => {
      const summary = await repo.getSummary(30);
      res.status(200).json(summary);
    },
  );

  router.get(
    '/api/v1/compliance/expiring',
    requireAuth(jwtSecret),
    requireRole('admin', 'auditor'),
    async (req, res) => {
      const within = Number(req.query['within_days'] ?? 30);
      if (!Number.isInteger(within) || within < 1 || within > 365) {
        res.status(400).json({ error: 'invalid_within_days' });
        return;
      }
      const items = await repo.listExpiring(within);
      res.status(200).json({ items });
    },
  );

  router.get(
    '/api/v1/carriers/:id/compliance',
    requireAuth(jwtSecret),
    requireRole('admin', 'broker', 'auditor'),
    async (req, res) => {
      const raw = req.params['id'];
      const carrierId = typeof raw === 'string' ? raw : '';
      if (!UUID_RE.test(carrierId)) {
        res.status(400).json({ error: 'invalid_carrier_id' });
        return;
      }
      const snap = await repo.getCarrierCompliance(carrierId);
      if (!snap) {
        res.status(404).json({ error: 'compliance_not_found' });
        return;
      }
      const score = computeRiskScore({
        operatingStatus: snap.operatingStatus,
        safetyRating: snap.safetyRating,
        insuranceOnFile: snap.insuranceOnFile,
        snapshotAgeDays: snap.snapshotAgeDays,
      });
      res.status(200).json({ ...snap, riskScore: score });
    },
  );

  return router;
}
