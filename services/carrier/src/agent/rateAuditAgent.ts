import type { Pool } from 'pg';
import type { AuditRepository } from '../../../user/src/repo/auditRepository';

export const MIN_MARGIN_PCT = 5;

export interface RateAuditDeps {
  pool: Pool;
  audit: AuditRepository;
}

export interface RateAuditTickResult {
  passed: number;
  exceptions: number;
  skipped: number;
}

export async function runRateAuditTick(deps: RateAuditDeps): Promise<RateAuditTickResult> {
  const result: RateAuditTickResult = { passed: 0, exceptions: 0, skipped: 0 };

  const ships = await deps.pool.query<{
    id: string;
    assigned_carrier_id: string | null;
  }>(`SELECT id, assigned_carrier_id FROM shipments WHERE status = 'doc_verified' LIMIT 50`);

  for (const ship of ships.rows) {
    try {
      if (!ship.assigned_carrier_id) {
        result.skipped++;
        continue;
      }

      const bidRow = await deps.pool.query<{ cost_usd: string }>(
        `SELECT cost_usd FROM carrier_bids
         WHERE shipment_id = $1 AND carrier_id = $2 LIMIT 1`,
        [ship.id, ship.assigned_carrier_id],
      );
      const carrierCost = bidRow.rows[0] ? Number(bidRow.rows[0].cost_usd) : null;
      if (carrierCost === null) {
        result.skipped++;
        continue;
      }

      const rfqRow = await deps.pool.query<{ price_offered_usd: string }>(
        `SELECT price_offered_usd FROM rfqs WHERE shipment_id = $1 LIMIT 1`,
        [ship.id],
      );
      let quotePrice: number;
      if (rfqRow.rows[0] && rfqRow.rows[0].price_offered_usd) {
        quotePrice = Number(rfqRow.rows[0].price_offered_usd);
      } else {
        quotePrice = carrierCost;
      }

      const margin = quotePrice - carrierCost;
      const marginPct = quotePrice > 0 ? (margin / quotePrice) * 100 : 0;

      if (marginPct >= MIN_MARGIN_PCT) {
        await deps.pool.query(
          `UPDATE shipments SET status = 'rate_audited' WHERE id = $1 AND status = 'doc_verified'`,
          [ship.id],
        );
        void deps.audit.record({
          action: 'agent.rate_audit.passed',
          target: ship.id,
          metadata: {
            quotePrice,
            carrierCost,
            margin,
            marginPct: Math.round(marginPct * 100) / 100,
          },
        });
        result.passed++;
      } else {
        await deps.pool.query(
          `UPDATE shipments SET status = 'rate_audit_exception' WHERE id = $1 AND status = 'doc_verified'`,
          [ship.id],
        );
        void deps.audit.record({
          action: 'agent.rate_audit.exception',
          target: ship.id,
          metadata: {
            quotePrice,
            carrierCost,
            margin,
            marginPct: Math.round(marginPct * 100) / 100,
            reason: margin < 0 ? 'negative_margin' : 'below_threshold',
          },
        });
        result.exceptions++;
      }
    } catch (err) {
      console.error('[rate-audit-agent] error', { shipmentId: ship.id, err });
    }
  }

  return result;
}
