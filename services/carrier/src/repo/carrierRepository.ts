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
  constructor(private readonly pool: Pool) {}

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
