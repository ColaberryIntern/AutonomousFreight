import { Pool } from 'pg';
import { CarrierRepository } from '../../carrier/src/repo/carrierRepository';
import { ComplianceRepository } from '../../compliance/src/repo/complianceRepository';
import { InMemoryEventBus } from '../../events/src/inMemoryBus';
import type { EventBus } from '../../events/src/types';
import {
  CaptureEmailDriver,
  GmailEmailDriver,
  type GmailConfig,
  PreferencesRepository,
  SmtpEmailDriver,
  startNotificationService,
  type EmailDriver,
} from '../../notifications/src/index';
import { startQuotingAgentLoop } from '../../rfq/src/agent/quotingAgent';
import { RfqRepository } from '../../rfq/src/repo/rfqRepository';
import { AuditRepository } from '../../user/src/repo/auditRepository';
import { UserRepository } from '../../user/src/repo/userRepository';
import { loadGatewayConfig } from './config';
import { buildGateway } from './gateway';

function buildEmailDriver(env: NodeJS.ProcessEnv): EmailDriver {
  const choice = env['EMAIL_DRIVER'] ?? 'smtp';
  if (choice === 'capture') return new CaptureEmailDriver();
  if (choice === 'gmail') {
    const cfg: GmailConfig = {
      clientId: env['GMAIL_CLIENT_ID'] ?? '',
      clientSecret: env['GMAIL_CLIENT_SECRET'] ?? '',
      refreshToken: env['GMAIL_REFRESH_TOKEN'] ?? '',
    };
    if (env['SMTP_FROM']) cfg.from = env['SMTP_FROM'];
    return new GmailEmailDriver(cfg);
  }
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
  const carrierRepo = new CarrierRepository(pool);
  await new UserRepository(pool).runMigrations();
  await carrierRepo.runMigrations();
  await new ComplianceRepository(pool).runMigrations();
  await new PreferencesRepository(pool).runMigrations();
  await new RfqRepository(pool).runMigrations();
  await carrierRepo.runLifecycleMigrations();

  const bus: EventBus = new InMemoryEventBus();
  const driver = buildEmailDriver(process.env);
  startNotificationService({ pool, bus, driver });

  const complianceRepo = new ComplianceRepository(pool);
  const rfqRepo = new RfqRepository(pool);
  const audit = new AuditRepository(pool);
  startQuotingAgentLoop({ repo: rfqRepo, audit, bus }, 5000);

  // V-3 agents
  const { runProcurementTick } = await import('../../carrier/src/agent/procurementAgent');
  const { runTrackingTick } = await import('../../carrier/src/agent/trackingAgent');
  const { runDocumentTick } = await import('../../carrier/src/agent/documentAgent');

  const agentInterval = 5000;
  const agentLoop = async (): Promise<void> => {
    try {
      await runProcurementTick({ carrierRepo, complianceRepo, audit, bus });
    } catch (err) {
      console.error('[agent-loop] procurement error', err);
    }
    if (process.env['FEATURE_TRACKING_SIM'] === 'true') {
      try {
        await runTrackingTick({ pool, audit });
      } catch (err) {
        console.error('[agent-loop] tracking error', err);
      }
    }
    try {
      await runDocumentTick({ pool, audit });
    } catch (err) {
      console.error('[agent-loop] document error', err);
    }
    setTimeout(() => void agentLoop(), agentInterval);
  };
  setTimeout(() => void agentLoop(), agentInterval);

  const gwCfg: Parameters<typeof buildGateway>[0] = {
    pool,
    jwtSecret: cfg.jwtAccessSecret,
    jwtTtl: cfg.jwtAccessTtl,
    logLevel: cfg.logLevel,
    rateLimitWindowMs: cfg.rateLimitWindowMs,
    rateLimitMax: cfg.rateLimitMax,
    bus,
  };
  if (cfg.mfaKek) gwCfg.mfaKek = cfg.mfaKek;
  const { app } = buildGateway(gwCfg);
  app.listen(cfg.port, () => {
    console.warn(`[gateway] listening on :${cfg.port} (mfa=${cfg.mfaKek ? 'on' : 'off'})`);
  });
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('[gateway] fatal', err);
    process.exit(1);
  });
}
