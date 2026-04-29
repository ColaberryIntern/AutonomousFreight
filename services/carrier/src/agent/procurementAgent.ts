import type { EventBus } from '../../../events/src/types';
import type { AuditRepository } from '../../../user/src/repo/auditRepository';
import { evaluateAssignmentGates } from '../../../compliance/src/domain/gates';
import type { ComplianceRepository } from '../../../compliance/src/repo/complianceRepository';
import { rankCarriers } from '../domain/scoring';
import type { CarrierRepository } from '../repo/carrierRepository';

export const PROCUREMENT_AUTO_THRESHOLD = 0.7;
const RECHECK_INTERVAL_SEC = 60;

export interface ProcurementDeps {
  carrierRepo: CarrierRepository;
  complianceRepo: ComplianceRepository;
  audit: AuditRepository;
  bus?: EventBus;
}

export interface ProcurementTickResult {
  autoAssigned: number;
  needsReview: number;
  blocked: number;
  skipped: number;
  cooldown: number;
}

export async function runProcurementTick(deps: ProcurementDeps): Promise<ProcurementTickResult> {
  const result: ProcurementTickResult = {
    autoAssigned: 0,
    needsReview: 0,
    blocked: 0,
    skipped: 0,
    cooldown: 0,
  };

  // Cooldown filter is now SQL-side (migration 013 + listShipmentsForProcurement),
  // so the loop only sees shipments actually due for re-check. Eliminates the
  // 1+N pattern that previously did SELECT last_agent_check_at per shipment.
  const shipments = await deps.carrierRepo.listShipmentsForProcurement(50, RECHECK_INTERVAL_SEC);
  for (const ship of shipments) {
    try {
      const bids = await deps.carrierRepo.listActiveBidsForShipment(ship.id);
      if (bids.length === 0) {
        result.skipped++;
        continue;
      }
      const ranked = rankCarriers(bids);
      const top = ranked[0];
      if (!top) {
        result.skipped++;
        continue;
      }

      const carrier = await deps.carrierRepo.findCarrierById(top.carrierId);
      if (!carrier) {
        result.skipped++;
        continue;
      }
      const snap = await deps.complianceRepo.getCarrierCompliance(top.carrierId);
      const gate = evaluateAssignmentGates({ id: carrier.id, active: carrier.active }, snap);

      await deps.carrierRepo.pool.query(
        `UPDATE shipments SET last_agent_check_at = NOW() WHERE id = $1`,
        [ship.id],
      );

      if (gate.result === 'hard') {
        void deps.audit.record({
          action: 'agent.procurement.blocked',
          target: ship.id,
          metadata: { carrierId: top.carrierId, findings: gate.findings },
        });
        result.blocked++;
        continue;
      }

      if (gate.result === 'soft' || top.score < PROCUREMENT_AUTO_THRESHOLD) {
        void deps.audit.record({
          action: 'agent.procurement.needs_review',
          target: ship.id,
          metadata: { carrierId: top.carrierId, score: top.score, gateResult: gate.result },
        });
        result.needsReview++;
        continue;
      }

      const assignResult = await deps.carrierRepo.assignCarrierWithMeta(ship.id, top.carrierId);
      if (!assignResult.ok) {
        result.skipped++;
        continue;
      }

      void deps.audit.record({
        action: 'agent.procurement.auto_assigned',
        target: ship.id,
        metadata: { carrierId: top.carrierId, score: top.score },
      });

      if (deps.bus) {
        try {
          await deps.bus.publish({
            name: 'shipment.carrier_selected',
            version: 1,
            occurredAt: new Date().toISOString(),
            payload: { shipmentId: ship.id, carrierId: top.carrierId, score: top.score },
          });
        } catch {
          // fire and forget
        }
      }

      result.autoAssigned++;
    } catch (err) {
      console.error('[procurement-agent] error', { shipmentId: ship.id, err });
    }
  }

  return result;
}
