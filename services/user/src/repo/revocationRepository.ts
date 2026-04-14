import type { Pool } from 'pg';

export class RevocationRepository {
  constructor(private readonly pool: Pool) {}

  async revoke(jti: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      `INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [jti, expiresAt],
    );
  }

  async isRevoked(jti: string): Promise<boolean> {
    const r = await this.pool.query<{ jti: string }>(
      `SELECT jti FROM revoked_tokens WHERE jti = $1 AND expires_at > NOW()`,
      [jti],
    );
    return r.rowCount !== null && r.rowCount > 0;
  }

  async purgeExpired(): Promise<number> {
    const r = await this.pool.query(`DELETE FROM revoked_tokens WHERE expires_at <= NOW()`);
    return r.rowCount ?? 0;
  }

  async truncateForTest(): Promise<void> {
    if (process.env['NODE_ENV'] !== 'test') throw new Error('test-only');
    await this.pool.query('TRUNCATE revoked_tokens');
  }
}
