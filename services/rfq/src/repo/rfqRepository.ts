import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import type { EquipmentType } from '../domain/pricing';

export type RfqStatus = 'received' | 'parsed' | 'priced' | 'sent' | 'won' | 'lost' | 'exception';

export interface RfqRecord {
  id: string;
  customer: string;
  origin: string;
  destination: string;
  distanceMiles: number;
  equipmentType: EquipmentType;
  pickupDate: string;
  status: RfqStatus;
  priceOfferedUsd: number | null;
  confidence: number | null;
  reason: string | null;
  shipmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRfqInput {
  customer: string;
  origin: string;
  destination: string;
  distanceMiles: number;
  equipmentType: EquipmentType;
  pickupDate: string;
}

interface RfqRow {
  id: string;
  customer: string;
  origin: string;
  destination: string;
  distance_miles: number;
  equipment_type: EquipmentType;
  pickup_date: Date;
  status: RfqStatus;
  price_offered_usd: string | null;
  confidence: string | null;
  reason: string | null;
  shipment_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function toRecord(row: RfqRow): RfqRecord {
  return {
    id: row.id,
    customer: row.customer,
    origin: row.origin,
    destination: row.destination,
    distanceMiles: row.distance_miles,
    equipmentType: row.equipment_type,
    pickupDate: row.pickup_date.toISOString().slice(0, 10),
    status: row.status,
    priceOfferedUsd: row.price_offered_usd === null ? null : Number(row.price_offered_usd),
    confidence: row.confidence === null ? null : Number(row.confidence),
    reason: row.reason,
    shipmentId: row.shipment_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class RfqRepository {
  constructor(private readonly pool: Pool) {}

  async runMigrations(): Promise<void> {
    const sql = readFileSync(join(__dirname, 'migrations', '006_rfqs.sql'), 'utf8');
    await this.pool.query(sql);
  }

  async create(input: CreateRfqInput): Promise<RfqRecord> {
    const r = await this.pool.query<RfqRow>(
      `INSERT INTO rfqs (customer, origin, destination, distance_miles, equipment_type, pickup_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.customer,
        input.origin,
        input.destination,
        input.distanceMiles,
        input.equipmentType,
        input.pickupDate,
      ],
    );
    const row = r.rows[0];
    if (!row) throw new Error('insert returned no row');
    return toRecord(row);
  }

  async findById(id: string): Promise<RfqRecord | null> {
    const r = await this.pool.query<RfqRow>('SELECT * FROM rfqs WHERE id = $1', [id]);
    const row = r.rows[0];
    return row ? toRecord(row) : null;
  }

  async list(
    opts: { status?: RfqStatus; limit?: number; offset?: number } = {},
  ): Promise<RfqRecord[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where = opts.status ? 'WHERE status = $3' : '';
    const params: unknown[] = opts.status ? [limit, offset, opts.status] : [limit, offset];
    const r = await this.pool.query<RfqRow>(
      `SELECT * FROM rfqs ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      params,
    );
    return r.rows.map(toRecord);
  }

  async listInStates(states: RfqStatus[], limit = 100): Promise<RfqRecord[]> {
    if (states.length === 0) return [];
    const r = await this.pool.query<RfqRow>(
      `SELECT * FROM rfqs WHERE status = ANY($1::text[]) ORDER BY created_at ASC LIMIT $2`,
      [states, limit],
    );
    return r.rows.map(toRecord);
  }

  async setStatus(id: string, status: RfqStatus, reason?: string): Promise<void> {
    await this.pool.query(
      `UPDATE rfqs SET status = $1, reason = COALESCE($2, reason), updated_at = NOW() WHERE id = $3`,
      [status, reason ?? null, id],
    );
  }

  async setPriced(
    id: string,
    priceUsd: number,
    confidence: number,
    nextStatus: 'sent' | 'exception',
  ): Promise<void> {
    await this.pool.query(
      `UPDATE rfqs
       SET price_offered_usd = $1, confidence = $2, status = $3, updated_at = NOW()
       WHERE id = $4 AND status IN ('parsed','priced')`,
      [priceUsd, confidence, nextStatus, id],
    );
  }

  async attachShipment(id: string, shipmentId: string): Promise<void> {
    await this.pool.query(
      `UPDATE rfqs SET shipment_id = $1, status = 'won', updated_at = NOW() WHERE id = $2`,
      [shipmentId, id],
    );
  }

  async countByStatus(): Promise<Record<string, number>> {
    const r = await this.pool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM rfqs GROUP BY status`,
    );
    const out: Record<string, number> = {};
    for (const row of r.rows) out[row.status] = Number(row.count);
    return out;
  }

  async truncateForTest(): Promise<void> {
    if (process.env['NODE_ENV'] !== 'test') throw new Error('test-only');
    await this.pool.query('TRUNCATE rfqs CASCADE');
  }
}
