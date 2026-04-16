import type { Pool } from 'pg';
import type { AuditRepository } from '../../../user/src/repo/auditRepository';

export interface PaymentMatchDeps {
  pool: Pool;
  audit: AuditRepository;
}

export interface PaymentMatchTickResult {
  matched: number;
  failed: number;
  skipped: number;
}

export async function runPaymentMatchTick(deps: PaymentMatchDeps): Promise<PaymentMatchTickResult> {
  const result: PaymentMatchTickResult = { matched: 0, failed: 0, skipped: 0 };

  const invoices = await deps.pool.query<{
    id: string;
    shipment_id: string;
    amount_usd: string;
    carrier_cost_usd: string;
  }>(
    `SELECT id, shipment_id, amount_usd, carrier_cost_usd FROM invoices WHERE status = 'paid' LIMIT 50`,
  );

  for (const inv of invoices.rows) {
    try {
      const amount = Number(inv.amount_usd);
      const cost = Number(inv.carrier_cost_usd);

      const docCheck = await deps.pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM shipment_documents
         WHERE shipment_id = $1 AND doc_type = 'bol'`,
        [inv.shipment_id],
      );
      const hasBol = Number(docCheck.rows[0]?.c ?? 0) > 0;

      if (amount > 0 && cost > 0 && hasBol) {
        await deps.pool.query(
          `UPDATE invoices SET status = 'matched' WHERE id = $1 AND status = 'paid'`,
          [inv.id],
        );
        void deps.audit.record({
          action: 'agent.payment.matched',
          target: inv.id,
          metadata: { shipmentId: inv.shipment_id, amount, cost },
        });
        result.matched++;
      } else {
        const reasons: string[] = [];
        if (amount <= 0) reasons.push('zero_amount');
        if (cost <= 0) reasons.push('zero_cost');
        if (!hasBol) reasons.push('missing_bol');

        await deps.pool.query(
          `UPDATE invoices SET status = 'match_failed' WHERE id = $1 AND status = 'paid'`,
          [inv.id],
        );
        await deps.pool.query(
          `INSERT INTO disputes (invoice_id, reason, discrepancy_usd)
           VALUES ($1, $2, $3)
           ON CONFLICT (invoice_id) DO NOTHING`,
          [inv.id, reasons.join(', '), Math.abs(amount - cost)],
        );
        void deps.audit.record({
          action: 'agent.payment.match_failed',
          target: inv.id,
          metadata: { shipmentId: inv.shipment_id, reasons },
        });
        result.failed++;
      }
    } catch (err) {
      console.error('[payment-match-agent] error', { invoiceId: inv.id, err });
    }
  }

  return result;
}
