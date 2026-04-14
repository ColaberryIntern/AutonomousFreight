import { Pool } from 'pg';
import { CarrierRepository } from '../../carrier/src/repo/carrierRepository';
import { InMemoryEventBus } from '../../events/src/inMemoryBus';
import {
  CaptureEmailDriver,
  PreferencesRepository,
  SmtpEmailDriver,
  startNotificationService,
  type EmailDriver,
} from '../../notifications/src/index';
import { UserRepository } from '../../user/src/repo/userRepository';
import { loadGatewayConfig } from './config';
import { buildGateway } from './gateway';

function buildEmailDriver(env: NodeJS.ProcessEnv): EmailDriver {
  const choice = env['EMAIL_DRIVER'] ?? 'smtp';
  if (choice === 'capture') return new CaptureEmailDriver();
  const user = env['SMTP_USER'];
  const password = env['SMTP_PASSWORD'];
  const base = {
    host: env['SMTP_HOST'] ?? 'localhost',
    port: Number(env['SMTP_PORT'] ?? 1025),
    from: env['SMTP_FROM'] ?? 'no-reply@autonomous-freight.local',
  };
  return new SmtpEmailDriver(user && password ? { ...base, user, password } : base);
}

async function main(): Promise<void> {
  const cfg = loadGatewayConfig();
  const pool = new Pool({ connectionString: cfg.databaseUrl });
  await new UserRepository(pool).runMigrations();
  await new CarrierRepository(pool).runMigrations();
  await new PreferencesRepository(pool).runMigrations();

  const bus = new InMemoryEventBus();
  const driver = buildEmailDriver(process.env);
  startNotificationService({ pool, bus, driver });

  const { app } = buildGateway({
    pool,
    jwtSecret: cfg.jwtAccessSecret,
    jwtTtl: cfg.jwtAccessTtl,
    logLevel: cfg.logLevel,
    rateLimitWindowMs: cfg.rateLimitWindowMs,
    rateLimitMax: cfg.rateLimitMax,
    bus,
  });
  app.listen(cfg.port, () => {
    console.warn(`[gateway] listening on :${cfg.port}`);
  });
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('[gateway] fatal', err);
    process.exit(1);
  });
}
