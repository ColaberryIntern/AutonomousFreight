import type { AuditRepository } from '../../../user/src/repo/auditRepository';
import type { CarrierRepository } from '../repo/carrierRepository';
import {
  classifyShortage,
  DEFAULT_THRESHOLDS as CAPACITY_THRESHOLDS,
  type CapacityShortageClass,
  type CapacityShortageThresholds,
} from '../domain/capacityShortage';

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes per shipment between detections

export interface CapacityShortageDeps {
  carrierRepo: CarrierRepository;
  audit: AuditRepository;
}

export interface CapacityShortageTickResult {
  detected: number;
  cooldown: number;
  normal: number;
}

const lastDetectionAt = new Map<string, number>();

function canDetect(shipmentId: string): boolean {
  const last = lastDetectionAt.get(shipmentId);
  if (!last) return true;
  return Date.now() - last >= COOLDOWN_MS;
}

function markDetected(shipmentId: string): void {
  lastDetectionAt.set(shipmentId, Date.now());
}

/**
 * Detect quoting shipments with capacity-shortage signal and emit a
 * deterministic audit event per shipment. Per-shipment 5-minute
 * cooldown prevents alert storms — same shape as the Health Monitor
 * agent's threshold cooldown.
 *
 * Pure logic: classifyShortage decides what to flag; the agent only
 * scans, dedupes via cooldown, and records to audit_log. No
 * mutating side effects on shipments themselves.
 */
export async function runCapacityShortageTick(
  deps: CapacityShortageDeps,
  thresholds: CapacityShortageThresholds = CAPACITY_THRESHOLDS,
): Promise<CapacityShortageTickResult> {
  const result: CapacityShortageTickResult = { detected: 0, cooldown: 0, normal: 0 };

  const rows = await deps.carrierRepo.listCapacityShortageShipments({
    minAgeMinutes: thresholds.noBidsAfterMin,
    limit: 100,
  });

  for (const row of rows) {
    try {
      const classification: CapacityShortageClass = classifyShortage(
        {
          ageMinutes: row.ageMinutes,
          activeBidCount: row.activeBidCount,
          // Per-bid hard-block detection requires per-carrier compliance
          // lookups already done by the procurement agent and recorded as
          // audit.procurement.blocked. This agent treats blocked rows as
          // normal here so no double-signaling occurs.
          hardBlockedCount: 0,
        },
        thresholds,
      );

      if (classification === 'normal') {
        result.normal++;
        continue;
      }

      if (!canDetect(row.shipmentId)) {
        result.cooldown++;
        continue;
      }

      markDetected(row.shipmentId);
      void deps.audit.record({
        action: 'agent.capacity_shortage.detected',
        target: row.shipmentId,
        metadata: {
          classification,
          ageMinutes: row.ageMinutes,
          activeBidCount: row.activeBidCount,
        },
      });
      result.detected++;
    } catch (err) {
      console.error('[capacity-shortage-agent] error', { shipmentId: row.shipmentId, err });
    }
  }

  return result;
}

/** Reset cooldown state — test only. */
export function resetCooldownForTest(): void {
  lastDetectionAt.clear();
}
