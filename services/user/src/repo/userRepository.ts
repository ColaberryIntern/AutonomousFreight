import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import type { Role } from '../domain/rbac';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  roles: Role[];
  mfaEnabled?: boolean;
  mfaSecretEnc?: string;
}

export class EmailAlreadyRegisteredError extends Error {
  constructor(email: string) {
    super(`email already registered: ${email}`);
    this.name = 'EmailAlreadyRegisteredError';
  }
}

const POSTGRES_UNIQUE_VIOLATION = '23505';

export class UserRepository {
  constructor(private readonly pool: Pool) {}

  async runMigrations(): Promise<void> {
    const init = readFileSync(join(__dirname, 'migrations', '001_init.sql'), 'utf8');
    await this.pool.query(init);
    const mfa = readFileSync(join(__dirname, 'migrations', '004_mfa_and_audit.sql'), 'utf8');
    await this.pool.query(mfa);
    const consent = readFileSync(join(__dirname, 'migrations', '010_consent.sql'), 'utf8');
    await this.pool.query(consent);
  }

  async findById(userId: string): Promise<UserRecord | null> {
    const result = await this.pool.query<{
      id: string;
      email: string;
      password_hash: string;
      roles: string[];
      mfa_enabled: boolean;
      mfa_secret_enc: string | null;
    }>(
      `
      SELECT u.id, u.email, u.password_hash, u.mfa_enabled, u.mfa_secret_enc,
             COALESCE(ARRAY_AGG(ur.role_name) FILTER (WHERE ur.role_name IS NOT NULL), '{}') AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id
      `,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const out: UserRecord = {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      roles: row.roles as Role[],
      mfaEnabled: row.mfa_enabled,
    };
    if (row.mfa_secret_enc !== null) out.mfaSecretEnc = row.mfa_secret_enc;
    return out;
  }

  async setMfaSecret(userId: string, encrypted: string): Promise<void> {
    await this.pool.query(
      'UPDATE users SET mfa_secret_enc = $1, mfa_enabled = FALSE, updated_at = NOW() WHERE id = $2',
      [encrypted, userId],
    );
  }

  async enableMfa(userId: string): Promise<void> {
    await this.pool.query('UPDATE users SET mfa_enabled = TRUE, updated_at = NOW() WHERE id = $1', [
      userId,
    ]);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.pool.query<{
      id: string;
      email: string;
      password_hash: string;
      roles: string[];
    }>(
      `
      SELECT u.id, u.email, u.password_hash,
             COALESCE(ARRAY_AGG(ur.role_name) FILTER (WHERE ur.role_name IS NOT NULL), '{}') AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.email = $1
      GROUP BY u.id
      `,
      [email],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      roles: row.roles as Role[],
    };
  }

  async listUsers(
    limit = 50,
    offset = 0,
  ): Promise<
    Array<{
      id: string;
      email: string;
      roles: string[];
      mfaEnabled: boolean;
      createdAt: string;
    }>
  > {
    const clamped = Math.min(Math.max(limit, 1), 200);
    const r = await this.pool.query<{
      id: string;
      email: string;
      roles: string[];
      mfa_enabled: boolean;
      created_at: Date;
    }>(
      `SELECT u.id, u.email, u.mfa_enabled, u.created_at,
              COALESCE(ARRAY_AGG(ur.role_name) FILTER (WHERE ur.role_name IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [clamped, Math.max(offset, 0)],
    );
    return r.rows.map((row) => ({
      id: row.id,
      email: row.email,
      roles: row.roles,
      mfaEnabled: row.mfa_enabled,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async searchUsers(opts: {
    search?: string;
    role?: Role;
    limit?: number;
    offset?: number;
  }): Promise<
    Array<{
      id: string;
      email: string;
      roles: string[];
      mfaEnabled: boolean;
      createdAt: string;
    }>
  > {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.search) {
      params.push(`%${opts.search}%`);
      where.push(`u.email ILIKE $${params.length}`);
    }
    if (opts.role) {
      params.push(opts.role);
      where.push(
        `EXISTS (SELECT 1 FROM user_roles ur2 WHERE ur2.user_id = u.id AND ur2.role_name = $${params.length})`,
      );
    }
    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const whereClause = where.length === 0 ? '' : `WHERE ${where.join(' AND ')}`;
    const r = await this.pool.query<{
      id: string;
      email: string;
      roles: string[];
      mfa_enabled: boolean;
      created_at: Date;
    }>(
      `SELECT u.id, u.email, u.mfa_enabled, u.created_at,
              COALESCE(ARRAY_AGG(ur.role_name) FILTER (WHERE ur.role_name IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       ${whereClause}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    );
    return r.rows.map((row) => ({
      id: row.id,
      email: row.email,
      roles: row.roles,
      mfaEnabled: row.mfa_enabled,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async findUserDetail(userId: string): Promise<{
    id: string;
    email: string;
    roles: string[];
    mfaEnabled: boolean;
    createdAt: string;
    updatedAt: string;
    lastLoginAt: string | null;
    lastActionAt: string | null;
    recentAuditCount: number;
  } | null> {
    const userRow = await this.pool.query<{
      id: string;
      email: string;
      roles: string[];
      mfa_enabled: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT u.id, u.email, u.mfa_enabled, u.created_at, u.updated_at,
              COALESCE(ARRAY_AGG(ur.role_name) FILTER (WHERE ur.role_name IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [userId],
    );
    const row = userRow.rows[0];
    if (!row) return null;

    const [loginRow, actionRow, countRow] = await Promise.all([
      this.pool.query<{ occurred_at: Date }>(
        `SELECT occurred_at FROM audit_log
         WHERE actor_user_id = $1 AND action = 'auth.login.success'
         ORDER BY occurred_at DESC LIMIT 1`,
        [userId],
      ),
      this.pool.query<{ occurred_at: Date }>(
        `SELECT occurred_at FROM audit_log
         WHERE actor_user_id = $1
         ORDER BY occurred_at DESC LIMIT 1`,
        [userId],
      ),
      this.pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM audit_log
         WHERE actor_user_id = $1 AND occurred_at >= $2`,
        [userId, new Date(Date.now() - 7 * 24 * 3600_000).toISOString()],
      ),
    ]);

    return {
      id: row.id,
      email: row.email,
      roles: row.roles,
      mfaEnabled: row.mfa_enabled,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      lastLoginAt: loginRow.rows[0]?.occurred_at.toISOString() ?? null,
      lastActionAt: actionRow.rows[0]?.occurred_at.toISOString() ?? null,
      recentAuditCount: Number(countRow.rows[0]?.c ?? 0),
    };
  }

  async findByEmailWithMfa(email: string): Promise<UserRecord | null> {
    const r = await this.pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    const row = r.rows[0];
    if (!row) return null;
    return this.findById(row.id);
  }

  async create(email: string, passwordHash: string, role: Role): Promise<UserRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let userId: string;
      try {
        const insertUser = await client.query<{ id: string }>(
          'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
          [email, passwordHash],
        );
        const inserted = insertUser.rows[0];
        if (!inserted) throw new Error('insert returned no row');
        userId = inserted.id;
      } catch (err) {
        await client.query('ROLLBACK');
        if (err instanceof Error && (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
          throw new EmailAlreadyRegisteredError(email);
        }
        throw err;
      }
      await client.query(
        'INSERT INTO user_roles (user_id, role_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, role],
      );
      await client.query('COMMIT');
      return { id: userId, email, passwordHash, roles: [role] };
    } finally {
      client.release();
    }
  }

  async deleteAllForTest(): Promise<void> {
    if (process.env['NODE_ENV'] !== 'test') {
      throw new Error('deleteAllForTest is test-only');
    }
    await this.pool.query('TRUNCATE users CASCADE');
  }
}
