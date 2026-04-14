import { Pool } from 'pg';
import { buildServer } from './api/server';
import { loadConfig } from './config';
import { UserRepository } from './repo/userRepository';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const pool = new Pool({ connectionString: cfg.databaseUrl });
  const repo = new UserRepository(pool);
  await repo.runMigrations();
  const app = buildServer({ pool, jwtSecret: cfg.jwtAccessSecret, jwtTtl: cfg.jwtAccessTtl });
  app.listen(cfg.port, () => {
    console.warn(`[user-service] listening on :${cfg.port}`);
  });
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('[user-service] fatal', err);
    process.exit(1);
  });
}
