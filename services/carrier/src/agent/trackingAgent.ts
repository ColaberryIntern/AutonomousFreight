import type { Pool } from 'pg';
import type { AuditRepository } from '../../../user/src/repo/auditRepository';

export interface Milestone {
  name: string;
  delaySeconds: number;
  newStatus?: string;
}

export const MILESTONES: Milestone[] = [
  { name: 'carrier_confirmed', delaySeconds: 30 },
  { name: 'picked_up', delaySeconds: 60, newStatus: 'dispatched' },
  { name: 'in_transit', delaySeconds: 90, newStatus: 'in_transit' },
  { name: 'approaching_destination', delaySeconds: 120 },
  { name: 'delivered', delaySeconds: 150, newStatus: 'delivered' },
];

export interface TrackingDeps {
  pool: Pool;
  audit: AuditRepository;
}

export interface TrackingTickResult {
  milestonesAdded: number;
  statusUpdates: number;
}

export async function runTrackingTick(deps: TrackingDeps): Promise<TrackingTickResult> {
  const result: TrackingTickResult = { milestonesAdded: 0, statusUpdates: 0 };

  const ships = await deps.pool.query<{
    id: string;
    status: string;
    assigned_at: Date | null;
  }>(
    `SELECT id, status, assigned_at FROM shipments
     WHERE status IN ('assigned', 'dispatched', 'in_transit')
       AND assigned_at IS NOT NULL
     ORDER BY assigned_at ASC LIMIT 50`,
  );

  for (const ship of ships.rows) {
    if (!ship.assigned_at) continue;
    const elapsedSec = (Date.now() - ship.assigned_at.getTime()) / 1000;

    const existing = await deps.pool.query<{ milestone: string }>(
      `SELECT milestone FROM shipment_milestones WHERE shipment_id = $1`,
      [ship.id],
    );
    const done = new Set(existing.rows.map((r) => r.milestone));

    for (const m of MILESTONES) {
      if (done.has(m.name)) continue;
      if (elapsedSec < m.delaySeconds) break;

      try {
        await deps.pool.query(
          `INSERT INTO shipment_milestones (shipment_id, milestone)
           VALUES ($1, $2) ON CONFLICT (shipment_id, milestone) DO NOTHING`,
          [ship.id, m.name],
        );
        result.milestonesAdded++;

        if (m.newStatus) {
          await deps.pool.query(`UPDATE shipments SET status = $1 WHERE id = $2 AND status != $1`, [
            m.newStatus,
            ship.id,
          ]);
          result.statusUpdates++;
        }

        void deps.audit.record({
          action: 'agent.tracking.milestone',
          target: ship.id,
          metadata: { milestone: m.name },
        });
      } catch (err) {
        console.error('[tracking-agent] milestone error', {
          shipmentId: ship.id,
          milestone: m.name,
          err,
        });
      }
    }
  }

  return result;
}
