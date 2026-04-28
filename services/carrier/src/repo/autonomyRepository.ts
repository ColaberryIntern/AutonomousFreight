import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import {
  AUTONOMY_OPERATIONS,
  type AutonomyOperation,
  type AutonomyOutcome,
  type SampleRow,
} from '../domain/autonomy';

export interface AutonomyLevelRow {
  operation: AutonomyOperation;
  level: 1 | 2 | 3 | 4;
  notes: string | null;
  updatedByUserId: string | null;
  updatedAt: string;
}

export interface SampleInsert {
  operation: AutonomyOperation;
  targetId?: string;
  confidence: number;
  outcome: AutonomyOutcome;
  metadata?: Record<string, unknown>;
}

export class AutonomyRepository {
  constructor(public readonly pool: Pool) {}

  async runMigrations(): Promise<void> {
    const sql = readFileSync(join(__dirname, 'migrations', '012_autonomy.sql'), 'utf8');
    await this.pool.query(sql);
  }

  async listLevels(): Promise<AutonomyLevelRow[]> {
    const r = await this.pool.query<{
      operation: AutonomyOperation;
      level: number;
      notes: string | null;
      updated_by_user_id: string | null;
      updated_at: Date;
    }>(
      `SELECT operation, level, notes, updated_by_user_id, updated_at
       FROM autonomy_levels
       ORDER BY operation`,
    );
    return r.rows.map((row) => ({
      operation: row.operation,
      level: row.level as 1 | 2 | 3 | 4,
      notes: row.notes,
      updatedByUserId: row.updated_by_user_id,
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async getLevel(operation: AutonomyOperation): Promise<AutonomyLevelRow | null> {
    const r = await this.pool.query<{
      operation: AutonomyOperation;
      level: number;
      notes: string | null;
      updated_by_user_id: string | null;
      updated_at: Date;
    }>(
      `SELECT operation, level, notes, updated_by_user_id, updated_at
       FROM autonomy_levels WHERE operation = $1`,
      [operation],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      operation: row.operation,
      level: row.level as 1 | 2 | 3 | 4,
      notes: row.notes,
      updatedByUserId: row.updated_by_user_id,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /**
   * Atomically UPSERT the level row inside a transaction so a future
   * write-side concern (e.g. recording a level-change audit event in the
   * same DB) can be added without losing atomicity.
   */
  async setLevel(args: {
    operation: AutonomyOperation;
    level: 1 | 2 | 3 | 4;
    notes?: string;
    userId?: string;
  }): Promise<AutonomyLevelRow> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query<{
        operation: AutonomyOperation;
        level: number;
        notes: string | null;
        updated_by_user_id: string | null;
        updated_at: Date;
      }>(
        `INSERT INTO autonomy_levels (operation, level, notes, updated_by_user_id, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (operation) DO UPDATE
           SET level = EXCLUDED.level,
               notes = EXCLUDED.notes,
               updated_by_user_id = EXCLUDED.updated_by_user_id,
               updated_at = NOW()
         RETURNING operation, level, notes, updated_by_user_id, updated_at`,
        [args.operation, args.level, args.notes ?? null, args.userId ?? null],
      );
      await client.query('COMMIT');
      const row = r.rows[0];
      if (!row) throw new Error('autonomy_level_upsert_returned_no_row');
      return {
        operation: row.operation,
        level: row.level as 1 | 2 | 3 | 4,
        notes: row.notes,
        updatedByUserId: row.updated_by_user_id,
        updatedAt: row.updated_at.toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async appendSample(sample: SampleInsert): Promise<{ id: string }> {
    const r = await this.pool.query<{ id: string }>(
      `INSERT INTO autonomy_confidence_samples
         (operation, target_id, confidence, outcome, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id::text`,
      [
        sample.operation,
        sample.targetId ?? null,
        sample.confidence,
        sample.outcome,
        sample.metadata ?? {},
      ],
    );
    const row = r.rows[0];
    if (!row) throw new Error('autonomy_sample_insert_returned_no_row');
    return { id: row.id };
  }

  async getSamplesSince(
    operation: AutonomyOperation,
    sinceIso: string,
    limit = 5000,
  ): Promise<SampleRow[]> {
    const r = await this.pool.query<{ outcome: AutonomyOutcome; confidence: string }>(
      `SELECT outcome, confidence
       FROM autonomy_confidence_samples
       WHERE operation = $1 AND occurred_at >= $2
       ORDER BY occurred_at DESC
       LIMIT $3`,
      [operation, sinceIso, Math.min(Math.max(limit, 1), 10000)],
    );
    return r.rows.map((row) => ({
      outcome: row.outcome,
      confidence: Number(row.confidence),
    }));
  }
}

export { AUTONOMY_OPERATIONS };
