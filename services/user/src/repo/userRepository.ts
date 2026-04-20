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
