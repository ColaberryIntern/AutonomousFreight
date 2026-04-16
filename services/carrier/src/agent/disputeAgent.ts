import type { Pool } from 'pg';
import type { AuditRepository } from '../../../user/src/repo/auditRepository';

export const AUTO_RESOLVE_THRESHOLD_PCT = 5;

export interface DisputeDeps {
  pool: Pool;
  audit: AuditRepository;
}

export interface DisputeTickResult {
  autoResolved: number;
  needsReview: number;
}

export async function runDisputeTick(deps: DisputeDeps): Promise<DisputeTickResult> {
  const result: DisputeTickResult = { autoResolved: 0, needsReview: 0 };

  const disputes = await deps.pool.query<{
    id: string;
    invoice_id: string;
    discrepancy_usd: string;
  }>(`SELECT id, invoice_id, discrepancy_usd FROM disputes WHERE status = 'open' LIMIT 50`);

  for (const d of disputes.rows) {
    try {
      const inv = await deps.pool.query<{ amount_usd: string }>(
        `SELECT amount_usd FROM invoices WHERE id = $1`,
        [d.invoice_id],
      );
      const invoiceAmount = Number(inv.rows[0]?.amount_usd ?? 0);
      const discrepancy = Number(d.discrepancy_usd);
      const pct = invoiceAmount > 0 ? (discrepancy / invoiceAmount) * 100 : 100;

      if (pct < AUTO_RESOLVE_THRESHOLD_PCT) {
        await deps.pool.query(
          `UPDATE disputes SET status = 'resolved', resolution = $1, resolved_at = NOW()
           WHERE id = $2 AND status = 'open'`,
          [
            `Auto-resolved: discrepancy ${discrepancy.toFixed(2)} (${pct.toFixed(1)}%) < ${AUTO_RESOLVE_THRESHOLD_PCT}% threshold`,
            d.id,
          ],
        );
        await deps.pool.query(
          `UPDATE invoices SET status = 'matched' WHERE id = $1 AND status = 'match_failed'`,
          [d.invoice_id],
        );
        void deps.audit.record({
          action: 'agent.dispute.auto_resolved',
          target: d.id,
          metadata: { invoiceId: d.invoice_id, discrepancy, pct: Math.round(pct * 100) / 100 },
        });
        result.autoResolved++;
      } else {
        void deps.audit.record({
          action: 'agent.dispute.needs_review',
          target: d.id,
          metadata: { invoiceId: d.invoice_id, discrepancy, pct: Math.round(pct * 100) / 100 },
        });
        result.needsReview++;
      }
    } catch (err) {
      console.error('[dispute-agent] error', { disputeId: d.id, err });
    }
  }

  return result;
}
