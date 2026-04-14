import type { Request, Response } from 'express';
import { z } from 'zod';
import { rankCarriers, topN } from '../domain/scoring';
import type { CarrierRepository } from '../repo/carrierRepository';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QuerySchema = z.object({
  top: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? 5 : Number(v)))
    .refine((n) => Number.isInteger(n) && n >= 1 && n <= 50, {
      message: 'top must be an integer between 1 and 50',
    }),
});

export function selectCarrierController(repo: CarrierRepository) {
  return async function handleSelectCarrier(req: Request, res: Response): Promise<void> {
    const rawId = req.params['id'];
    const shipmentId = typeof rawId === 'string' ? rawId : '';
    if (!shipmentId || !UUID_RE.test(shipmentId)) {
      res.status(400).json({ error: 'invalid_shipment_id' });
      return;
    }
    const q = QuerySchema.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: 'invalid_query' });
      return;
    }

    try {
      const shipment = await repo.findShipmentById(shipmentId);
      if (!shipment) {
        res.status(404).json({ error: 'shipment_not_found' });
        return;
      }
      if (shipment.status !== 'quoting') {
        res.status(409).json({ error: 'shipment_not_quotable' });
        return;
      }
      const bids = await repo.listActiveBidsForShipment(shipmentId);
      const ranked = rankCarriers(bids);
      const limited = topN(ranked, q.data.top);
      res.status(200).json({ shipmentId, rankings: limited });
    } catch (err) {
      console.error('[select-carrier] unexpected error', err);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}
