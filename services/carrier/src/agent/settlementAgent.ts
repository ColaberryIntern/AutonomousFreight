import type { Pool } from 'pg';
import type { AuditRepository } from '../../../user/src/repo/auditRepository';

export interface SettlementDeps {
  pool: Pool;
  audit: AuditRepository;
}

export interface SettlementTickResult {
  created: number;
  skipped: number;
}

export async function runSettlementTick(deps: SettlementDeps): Promise<SettlementTickResult> {
  const result: SettlementTickResult = { created: 0, skipped: 0 };

  const invoices = await deps.pool.query<{
    id: string;
    shipment_id: string;
    carrier_cost_usd: string;
  }>(`SELECT id, shipment_id, carrier_cost_usd FROM invoices WHERE status = 'matched' LIMIT 50`);

  for (const inv of invoices.rows) {
    try {
      const existing = await deps.pool.query<{ id: string }>(
        `SELECT id FROM settlements WHERE invoice_id = $1`,
        [inv.id],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        result.skipped++;
        continue;
      }

      const carrierRow = await deps.pool.query<{ assigned_carrier_id: string | null }>(
        `SELECT assigned_carrier_id FROM shipments WHERE id = $1`,
        [inv.shipment_id],
      );
      const carrierId = carrierRow.rows[0]?.assigned_carrier_id;
      if (!carrierId) {
        result.skipped++;
        continue;
      }

      await deps.pool.query(
        `INSERT INTO settlements (invoice_id, carrier_id, amount_usd)
         VALUES ($1, $2, $3)`,
        [inv.id, carrierId, Number(inv.carrier_cost_usd)],
      );
      await deps.pool.query(
        `UPDATE invoices SET status = 'settled' WHERE id = $1 AND status = 'matched'`,
        [inv.id],
      );
      await deps.pool.query(`UPDATE shipments SET status = 'settled' WHERE id = $1`, [
        inv.shipment_id,
      ]);

      void deps.audit.record({
        action: 'agent.settlement.created',
        target: inv.id,
        metadata: { shipmentId: inv.shipment_id, carrierId, amount: Number(inv.carrier_cost_usd) },
      });
      result.created++;
    } catch (err) {
      console.error('[settlement-agent] error', { invoiceId: inv.id, err });
    }
  }

  return result;
}
