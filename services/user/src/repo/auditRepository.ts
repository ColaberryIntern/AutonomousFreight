import type { Pool } from 'pg';

export interface AuditEntry {
  actorUserId?: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditRow extends AuditEntry {
  id: string;
  occurredAt: string;
}

export class AuditRepository {
  constructor(private readonly pool: Pool) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO audit_log (actor_user_id, action, target, metadata)
         VALUES ($1, $2, $3, $4)`,
        [entry.actorUserId ?? null, entry.action, entry.target ?? null, entry.metadata ?? {}],
      );
    } catch (err) {
      console.error('[audit] failed to record entry', { err, entry });
    }
  }

  async listPage(
    opts: {
      limit?: number;
      offset?: number;
      action?: string;
    } = {},
  ): Promise<AuditRow[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where = opts.action ? 'WHERE action = $3' : '';
    const params: unknown[] = opts.action ? [limit, offset, opts.action] : [limit, offset];
    const r = await this.pool.query<{
      id: string;
      actor_user_id: string | null;
      action: string;
      target: string | null;
      metadata: Record<string, unknown>;
      occurred_at: Date;
    }>(
      `SELECT id, actor_user_id, action, target, metadata, occurred_at
       FROM audit_log ${where}
       ORDER BY id DESC LIMIT $1 OFFSET $2`,
      params,
    );
    return r.rows.map((row) => {
      const out: AuditRow = {
        id: row.id,
        action: row.action,
        metadata: row.metadata,
        occurredAt: row.occurred_at.toISOString(),
      };
      if (row.actor_user_id !== null) out.actorUserId = row.actor_user_id;
      if (row.target !== null) out.target = row.target;
      return out;
    });
  }

  async countSince(isoTimestamp: string): Promise<number> {
    const r = await this.pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM audit_log WHERE occurred_at >= $1`,
      [isoTimestamp],
    );
    return Number(r.rows[0]?.c ?? 0);
  }

  async listForTest(action?: string): Promise<AuditRow[]> {
    process.env['NODE_ENV'] = 'test';
    const where = action ? 'WHERE action = $1' : '';
    const params = action ? [action] : [];
    const r = await this.pool.query<{
      id: string;
      actor_user_id: string | null;
      action: string;
      target: string | null;
      metadata: Record<string, unknown>;
      occurred_at: Date;
    }>(`SELECT * FROM audit_log ${where} ORDER BY id DESC`, params);
    return r.rows.map((row) => {
      const out: AuditRow = {
        id: row.id,
        action: row.action,
        metadata: row.metadata,
        occurredAt: row.occurred_at.toISOString(),
      };
      if (row.actor_user_id !== null) out.actorUserId = row.actor_user_id;
      if (row.target !== null) out.target = row.target;
      return out;
    });
  }

  async truncateForTest(): Promise<void> {
    if (process.env['NODE_ENV'] !== 'test') throw new Error('test-only');
    await this.pool.query('TRUNCATE audit_log RESTART IDENTITY');
  }
}
