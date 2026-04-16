import type { Pool } from 'pg';
import type { EventBus } from '../../../events/src/types';
import type { AuditRepository } from '../../../user/src/repo/auditRepository';

export interface InvoiceDeps {
  pool: Pool;
  audit: AuditRepository;
  bus?: EventBus;
}

export interface InvoiceTickResult {
  issued: number;
  skipped: number;
}

export async function runInvoiceTick(deps: InvoiceDeps): Promise<InvoiceTickResult> {
  const result: InvoiceTickResult = { issued: 0, skipped: 0 };

  const ships = await deps.pool.query<{
    id: string;
    assigned_carrier_id: string | null;
  }>(`SELECT id, assigned_carrier_id FROM shipments WHERE status = 'rate_audited' LIMIT 50`);

  for (const ship of ships.rows) {
    try {
      if (!ship.assigned_carrier_id) {
        result.skipped++;
        continue;
      }

      const existing = await deps.pool.query<{ id: string }>(
        `SELECT id FROM invoices WHERE shipment_id = $1`,
        [ship.id],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        result.skipped++;
        continue;
      }

      const bidRow = await deps.pool.query<{ cost_usd: string }>(
        `SELECT cost_usd FROM carrier_bids
         WHERE shipment_id = $1 AND carrier_id = $2 LIMIT 1`,
        [ship.id, ship.assigned_carrier_id],
      );
      const carrierCost = bidRow.rows[0] ? Number(bidRow.rows[0].cost_usd) : 0;

      const rfqRow = await deps.pool.query<{ price_offered_usd: string; customer: string }>(
        `SELECT price_offered_usd, customer FROM rfqs WHERE shipment_id = $1 LIMIT 1`,
        [ship.id],
      );
      let amount: number;
      let customer: string;
      if (rfqRow.rows[0] && rfqRow.rows[0].price_offered_usd) {
        amount = Number(rfqRow.rows[0].price_offered_usd);
        customer = rfqRow.rows[0].customer;
      } else {
        amount = carrierCost;
        customer = 'Direct';
      }

      const margin = amount - carrierCost;
      const marginPct = amount > 0 ? Math.round((margin / amount) * 100 * 100) / 100 : 0;

      const invoiceNumber = await deps.pool.query<{ n: string }>(
        `SELECT 'AF-INV-' || LPAD(nextval('invoice_number_seq')::text, 4, '0') AS n`,
      );
      const invNum = invoiceNumber.rows[0]?.n ?? `AF-INV-${Date.now()}`;

      const inv = await deps.pool.query<{ id: string }>(
        `INSERT INTO invoices (shipment_id, invoice_number, customer, amount_usd, carrier_cost_usd, margin_usd, margin_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [ship.id, invNum, customer, amount, carrierCost, margin, marginPct],
      );

      await deps.pool.query(
        `UPDATE shipments SET status = 'invoiced' WHERE id = $1 AND status = 'rate_audited'`,
        [ship.id],
      );

      const invoiceId = inv.rows[0]?.id ?? '';
      void deps.audit.record({
        action: 'agent.invoice.issued',
        target: ship.id,
        metadata: { invoiceId, invoiceNumber: invNum, amount, carrierCost, margin, marginPct },
      });

      if (deps.bus) {
        try {
          await deps.bus.publish({
            name: 'invoice.issued',
            version: 1,
            occurredAt: new Date().toISOString(),
            payload: { invoiceId, shipmentId: ship.id, invoiceNumber: invNum, amount },
          });
        } catch {
          // fire and forget
        }
      }

      result.issued++;
    } catch (err) {
      console.error('[invoice-agent] error', { shipmentId: ship.id, err });
    }
  }

  return result;
}
