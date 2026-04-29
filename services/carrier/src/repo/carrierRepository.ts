import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import type { CarrierBid } from '../domain/scoring';

export interface ShipmentRecord {
  id: string;
  origin: string;
  destination: string;
  distanceMiles: number;
  status: 'quoting' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';
}

export class CarrierRepository {
  constructor(public readonly pool: Pool) {}

  async runMigrations(): Promise<void> {
    const sqlPath = join(__dirname, 'migrations', '002_carriers_shipments.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    await this.pool.query(sql);
  }

  async findShipmentById(shipmentId: string): Promise<ShipmentRecord | null> {
    const result = await this.pool.query<{
      id: string;
      origin: string;
      destination: string;
      distance_miles: number;
      status: ShipmentRecord['status'];
    }>(
      `SELECT id, origin, destination, distance_miles, status
       FROM shipments WHERE id = $1`,
      [shipmentId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      origin: row.origin,
      destination: row.destination,
      distanceMiles: row.distance_miles,
      status: row.status,
    };
  }

  async listShipments(limit = 50, offset = 0): Promise<ShipmentRecord[]> {
    const clamped = Math.min(Math.max(limit, 1), 200);
    const r = await this.pool.query<{
      id: string;
      origin: string;
      destination: string;
      distance_miles: number;
      status: ShipmentRecord['status'];
    }>(
      `SELECT id, origin, destination, distance_miles, status
       FROM shipments ORDER BY id LIMIT $1 OFFSET $2`,
      [clamped, Math.max(offset, 0)],
    );
    return r.rows.map((row) => ({
      id: row.id,
      origin: row.origin,
      destination: row.destination,
      distanceMiles: row.distance_miles,
      status: row.status,
    }));
  }

  async listCarriers(
    activeOnly = true,
    limit = 100,
    offset = 0,
  ): Promise<Array<{ id: string; name: string; rating: number; active: boolean }>> {
    const clamped = Math.min(Math.max(limit, 1), 200);
    const r = await this.pool.query<{
      id: string;
      name: string;
      rating: string;
      active: boolean;
    }>(
      `SELECT id, name, rating, active FROM carriers
       ${activeOnly ? 'WHERE active = TRUE' : ''}
       ORDER BY name LIMIT $1 OFFSET $2`,
      [clamped, Math.max(offset, 0)],
    );
    return r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      rating: Number(row.rating),
      active: row.active,
    }));
  }

  async listActiveBidsForShipment(shipmentId: string): Promise<CarrierBid[]> {
    const result = await this.pool.query<{
      carrier_id: string;
      carrier_name: string;
      rating: string;
      cost_usd: string;
      pickup_distance_miles: number;
    }>(
      `SELECT b.carrier_id, c.name AS carrier_name, c.rating,
              b.cost_usd, b.pickup_distance_miles
       FROM carrier_bids b
       JOIN carriers c ON c.id = b.carrier_id
       WHERE b.shipment_id = $1 AND c.active = TRUE`,
      [shipmentId],
    );
    return result.rows.map((r) => ({
      carrierId: r.carrier_id,
      carrierName: r.carrier_name,
      rating: Number(r.rating),
      costUsd: Number(r.cost_usd),
      pickupDistanceMiles: r.pickup_distance_miles,
    }));
  }

  async listShipmentsByStatus(status: string, limit = 50): Promise<ShipmentRecord[]> {
    const r = await this.pool.query<{
      id: string;
      origin: string;
      destination: string;
      distance_miles: number;
      status: ShipmentRecord['status'];
    }>(
      `SELECT id, origin, destination, distance_miles, status
       FROM shipments WHERE status = $1 ORDER BY created_at ASC LIMIT $2`,
      [status, limit],
    );
    return r.rows.map((row) => ({
      id: row.id,
      origin: row.origin,
      destination: row.destination,
      distanceMiles: row.distance_miles,
      status: row.status,
    }));
  }

  /**
   * Procurement-tick optimized listing: returns only quoting shipments
   * whose cooldown has elapsed (or has never been checked). Replaces the
   * 1+N pattern of listShipmentsByStatus + per-shipment SELECT
   * last_agent_check_at. Backed by idx_shipments_status_last_check
   * (migration 013).
   */
  async listShipmentsForProcurement(
    limit = 50,
    cooldownSec = 60,
  ): Promise<ShipmentRecord[]> {
    const r = await this.pool.query<{
      id: string;
      origin: string;
      destination: string;
      distance_miles: number;
      status: ShipmentRecord['status'];
    }>(
      `SELECT id, origin, destination, distance_miles, status
       FROM shipments
       WHERE status = 'quoting'
         AND (last_agent_check_at IS NULL
              OR last_agent_check_at < NOW() - ($1::int || ' seconds')::interval)
       ORDER BY created_at ASC
       LIMIT $2`,
      [cooldownSec, limit],
    );
    return r.rows.map((row) => ({
      id: row.id,
      origin: row.origin,
      destination: row.destination,
      distanceMiles: row.distance_miles,
      status: row.status,
    }));
  }

  async listCapacityShortageShipments(opts: {
    minAgeMinutes?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<
    Array<{
      shipmentId: string;
      origin: string;
      destination: string;
      ageMinutes: number;
      activeBidCount: number;
    }>
  > {
    const minAgeMinutes = Math.max(opts.minAgeMinutes ?? 0, 0);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const r = await this.pool.query<{
      id: string;
      origin: string;
      destination: string;
      age_minutes: string;
      active_bid_count: string;
    }>(
      `SELECT s.id, s.origin, s.destination,
              EXTRACT(EPOCH FROM (NOW() - s.created_at)) / 60 AS age_minutes,
              COUNT(b.carrier_id) FILTER (WHERE b.carrier_id IS NOT NULL) AS active_bid_count
       FROM shipments s
       LEFT JOIN carrier_bids b ON b.shipment_id = s.id
       LEFT JOIN carriers c ON c.id = b.carrier_id AND c.active = TRUE
       WHERE s.status = 'quoting'
         AND s.created_at <= NOW() - ($1::int || ' minutes')::interval
       GROUP BY s.id, s.origin, s.destination, s.created_at
       ORDER BY s.created_at ASC
       LIMIT $2 OFFSET $3`,
      [minAgeMinutes, limit, offset],
    );
    return r.rows.map((row) => ({
      shipmentId: row.id,
      origin: row.origin,
      destination: row.destination,
      ageMinutes: Math.floor(Number(row.age_minutes)),
      activeBidCount: Number(row.active_bid_count),
    }));
  }

  async assignCarrierWithMeta(
    shipmentId: string,
    carrierId: string,
  ): Promise<{ ok: true } | { ok: false }> {
    const update = await this.pool.query(
      `UPDATE shipments SET status = 'assigned', assigned_carrier_id = $1, assigned_at = NOW()
       WHERE id = $2 AND status = 'quoting'`,
      [carrierId, shipmentId],
    );
    if (update.rowCount === 0) return { ok: false };
    return { ok: true };
  }

  async runLifecycleMigrations(): Promise<void> {
    const sql = readFileSync(join(__dirname, 'migrations', '007_lifecycle_v3.sql'), 'utf8');
    await this.pool.query(sql);
  }

  async createShipment(
    origin: string,
    destination: string,
    distanceMiles: number,
  ): Promise<string> {
    const r = await this.pool.query<{ id: string }>(
      `INSERT INTO shipments (origin, destination, distance_miles, status)
       VALUES ($1, $2, $3, 'quoting') RETURNING id`,
      [origin, destination, distanceMiles],
    );
    const row = r.rows[0];
    if (!row) throw new Error('insert returned no row');
    return row.id;
  }

  async findCarrierById(
    carrierId: string,
  ): Promise<{ id: string; name: string; rating: number; active: boolean } | null> {
    const r = await this.pool.query<{
      id: string;
      name: string;
      rating: string;
      active: boolean;
    }>('SELECT id, name, rating, active FROM carriers WHERE id = $1', [carrierId]);
    const row = r.rows[0];
    if (!row) return null;
    return { id: row.id, name: row.name, rating: Number(row.rating), active: row.active };
  }

  async assignCarrier(
    shipmentId: string,
    carrierId: string,
  ): Promise<
    | { ok: true }
    | { ok: false; reason: 'shipment_not_quotable' | 'shipment_not_found' | 'no_such_bid' }
  > {
    const ship = await this.findShipmentById(shipmentId);
    if (!ship) return { ok: false, reason: 'shipment_not_found' };

    const bidCheck = await this.pool.query<{ carrier_id: string }>(
      `SELECT b.carrier_id FROM carrier_bids b
       JOIN carriers c ON c.id = b.carrier_id
       WHERE b.shipment_id = $1 AND b.carrier_id = $2 AND c.active = TRUE`,
      [shipmentId, carrierId],
    );
    if (bidCheck.rowCount === 0) return { ok: false, reason: 'no_such_bid' };

    const update = await this.pool.query(
      `UPDATE shipments SET status = 'assigned'
       WHERE id = $1 AND status = 'quoting'`,
      [shipmentId],
    );
    if (update.rowCount === 0) return { ok: false, reason: 'shipment_not_quotable' };
    return { ok: true };
  }

  async countShipmentsByStatus(): Promise<Record<string, number>> {
    const r = await this.pool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM shipments GROUP BY status`,
    );
    const out: Record<string, number> = {};
    for (const row of r.rows) out[row.status] = Number(row.count);
    return out;
  }

  async countActiveCarriers(): Promise<number> {
    const r = await this.pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM carriers WHERE active = TRUE`,
    );
    return Number(r.rows[0]?.c ?? 0);
  }

  async createCarrierForTest(
    name: string,
    rating: number,
    active: boolean = true,
  ): Promise<string> {
    process.env['NODE_ENV'] = 'test';
    const r = await this.pool.query<{ id: string }>(
      'INSERT INTO carriers (name, rating, active) VALUES ($1, $2, $3) RETURNING id',
      [name, rating, active],
    );
    const row = r.rows[0];
    if (!row) throw new Error('insert returned no row');
    return row.id;
  }

  async createShipmentForTest(
    origin: string,
    destination: string,
    distanceMiles: number,
    status: ShipmentRecord['status'] = 'quoting',
  ): Promise<string> {
    process.env['NODE_ENV'] = 'test';
    const r = await this.pool.query<{ id: string }>(
      `INSERT INTO shipments (origin, destination, distance_miles, status)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [origin, destination, distanceMiles, status],
    );
    const row = r.rows[0];
    if (!row) throw new Error('insert returned no row');
    return row.id;
  }

  async createBidForTest(
    shipmentId: string,
    carrierId: string,
    costUsd: number,
    pickupDistanceMiles: number,
  ): Promise<void> {
    process.env['NODE_ENV'] = 'test';
    await this.pool.query(
      `INSERT INTO carrier_bids (shipment_id, carrier_id, cost_usd, pickup_distance_miles)
       VALUES ($1, $2, $3, $4)`,
      [shipmentId, carrierId, costUsd, pickupDistanceMiles],
    );
  }

  async truncateForTest(): Promise<void> {
    if (process.env['NODE_ENV'] !== 'test') {
      throw new Error('truncateForTest is test-only');
    }
    await this.pool.query('TRUNCATE carrier_bids, shipments, carriers CASCADE');
  }
}
