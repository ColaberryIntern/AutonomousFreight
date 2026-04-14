import { Pool } from 'pg';
import { UserRepository } from '../../../services/user/src/repo/userRepository';

const DEFAULT_TEST_DB_URL = 'postgres://freight:freight@localhost:5434/freight_dev';

export function getTestPool(): Pool {
  return new Pool({
    connectionString: process.env['DATABASE_URL'] ?? DEFAULT_TEST_DB_URL,
    max: 4,
  });
}

export async function prepareSchema(pool: Pool): Promise<void> {
  const repo = new UserRepository(pool);
  await repo.runMigrations();
}

export async function truncateUsers(pool: Pool): Promise<void> {
  process.env['NODE_ENV'] = 'test';
  await new UserRepository(pool).deleteAllForTest();
}
