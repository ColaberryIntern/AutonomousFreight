import { Router } from 'express';
import type { Pool } from 'pg';
import { requireAuth, requireRole } from '../../../user/src/api/authMiddleware';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildInvoiceRouter(pool: Pool, jwtSecret: string): Router {
  const router = Router();

  router.get(
    '/api/v1/invoices',
    requireAuth(jwtSecret),
    requireRole('admin', 'auditor'),
    async (req, res) => {
      const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
      const where = status ? 'WHERE status = $1' : '';
      const params = status ? [status] : [];
      const r = await pool.query<{
        id: string;
        shipment_id: string;
        invoice_number: string;
        customer: string;
        amount_usd: string;
        carrier_cost_usd: string;
        margin_usd: string;
        margin_pct: string;
        status: string;
        issued_at: Date;
        paid_at: Date | null;
      }>(`SELECT * FROM invoices ${where} ORDER BY issued_at DESC LIMIT 100`, params);
      res.status(200).json({
        items: r.rows.map((row) => ({
          id: row.id,
          shipmentId: row.shipment_id,
          invoiceNumber: row.invoice_number,
          customer: row.customer,
          amountUsd: Number(row.amount_usd),
          carrierCostUsd: Number(row.carrier_cost_usd),
          marginUsd: Number(row.margin_usd),
          marginPct: Number(row.margin_pct),
          status: row.status,
          issuedAt: row.issued_at.toISOString(),
          paidAt: row.paid_at?.toISOString() ?? null,
        })),
      });
    },
  );

  router.get(
    '/api/v1/invoices/:id',
    requireAuth(jwtSecret),
    requireRole('admin', 'auditor'),
    async (req, res) => {
      const raw = req.params['id'];
      const id = typeof raw === 'string' ? raw : '';
      if (!UUID_RE.test(id)) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }
      const r = await pool.query(`SELECT * FROM invoices WHERE id = $1`, [id]);
      if (r.rowCount === 0) {
        res.status(404).json({ error: 'invoice_not_found' });
        return;
      }
      res.status(200).json(r.rows[0]);
    },
  );

  router.post(
    '/api/v1/invoices/:id/pay',
    requireAuth(jwtSecret),
    requireRole('admin'),
    async (req, res) => {
      const raw = req.params['id'];
      const id = typeof raw === 'string' ? raw : '';
      if (!UUID_RE.test(id)) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }
      const update = await pool.query(
        `UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = $1 AND status = 'issued'`,
        [id],
      );
      if (update.rowCount === 0) {
        res.status(409).json({ error: 'not_payable' });
        return;
      }
      res.status(200).json({ ok: true });
    },
  );

  router.get(
    '/api/v1/financials/summary',
    requireAuth(jwtSecret),
    requireRole('admin', 'auditor'),
    async (_req, res) => {
      const totals = await pool.query<{
        total_revenue: string;
        total_cost: string;
        total_margin: string;
        avg_margin_pct: string;
        invoice_count: string;
      }>(
        `SELECT
           COALESCE(SUM(amount_usd), 0)::text AS total_revenue,
           COALESCE(SUM(carrier_cost_usd), 0)::text AS total_cost,
           COALESCE(SUM(margin_usd), 0)::text AS total_margin,
           COALESCE(AVG(margin_pct), 0)::text AS avg_margin_pct,
           COUNT(*)::text AS invoice_count
         FROM invoices`,
      );
      const byStatus = await pool.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text AS count FROM invoices GROUP BY status`,
      );
      const statusMap: Record<string, number> = {};
      for (const row of byStatus.rows) statusMap[row.status] = Number(row.count);

      const t = totals.rows[0];
      res.status(200).json({
        totalRevenue: Number(t?.total_revenue ?? 0),
        totalCost: Number(t?.total_cost ?? 0),
        totalMargin: Number(t?.total_margin ?? 0),
        avgMarginPct: Math.round(Number(t?.avg_margin_pct ?? 0) * 100) / 100,
        invoiceCount: Number(t?.invoice_count ?? 0),
        byStatus: statusMap,
      });
    },
  );

  return router;
}
