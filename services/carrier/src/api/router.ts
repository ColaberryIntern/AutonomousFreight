import { Router } from 'express';
import type { Pool } from 'pg';
import { requireAuth, requireRole } from '../../../user/src/api/authMiddleware';
import { CarrierRepository } from '../repo/carrierRepository';
import { selectCarrierController } from './selectCarrierController';

export interface CarrierRouterDeps {
  pool: Pool;
  jwtSecret: string;
}

export function buildCarrierRouter({ pool, jwtSecret }: CarrierRouterDeps): Router {
  const router = Router();
  const repo = new CarrierRepository(pool);

  router.get('/api/v1/shipments', requireAuth(jwtSecret), async (_req, res) => {
    const items = await repo.listShipments();
    res.status(200).json({ items });
  });

  router.get('/api/v1/carriers', requireAuth(jwtSecret), async (req, res) => {
    const activeOnly = req.query['active'] !== 'false';
    const items = await repo.listCarriers(activeOnly);
    res.status(200).json({ items });
  });

  router.post(
    '/api/v1/shipments/:id/select-carrier',
    requireAuth(jwtSecret),
    requireRole('admin', 'broker'),
    selectCarrierController(repo),
  );
  return router;
}
