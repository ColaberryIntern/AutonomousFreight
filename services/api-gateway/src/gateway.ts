import express, { type Express, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { buildCarrierRouter } from '../../carrier/src/api/router';
import { buildComplianceRouter } from '../../compliance/src/api/router';
import type { EventBus } from '../../events/src/types';
import { buildServer as buildUserService } from '../../user/src/api/server';
import { buildHttpLogger, buildLogger } from './middleware/logger';
import { buildMetrics } from './middleware/metrics';
import { metricsMiddleware } from './middleware/metrics';
import { buildRateLimit } from './middleware/rateLimit';
import { traceIdMiddleware } from './middleware/traceId';
import { buildOpenApiDoc } from './openapi';

const openApiDoc = buildOpenApiDoc();

export interface GatewayConfig {
  pool: Pool;
  jwtSecret: string;
  jwtTtl: string;
  logLevel: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  bus?: EventBus;
  mfaKek?: string;
}

export interface BuiltGateway {
  app: Express;
  metricsRegistry: ReturnType<typeof buildMetrics>['registry'];
}

export function buildGateway(cfg: GatewayConfig): BuiltGateway {
  const app = express();
  const logger = buildLogger({ level: cfg.logLevel });
  const metrics = buildMetrics();

  app.disable('x-powered-by');

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.status(200).json(openApiDoc);
  });

  app.get('/metrics', (_req: Request, res: Response) => {
    metrics.registry
      .metrics()
      .then((body) => {
        res.setHeader('Content-Type', metrics.registry.contentType);
        res.status(200).send(body);
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'metrics collection failed');
        res.status(500).json({ error: 'metrics_error' });
      });
  });

  app.use(traceIdMiddleware);
  app.use(buildHttpLogger(logger));
  app.use(metricsMiddleware(metrics));
  app.use(buildRateLimit({ windowMs: cfg.rateLimitWindowMs, max: cfg.rateLimitMax }));

  const userServiceDeps: {
    pool: Pool;
    jwtSecret: string;
    jwtTtl: string;
    bus?: EventBus;
    mfaKek?: string;
  } = { pool: cfg.pool, jwtSecret: cfg.jwtSecret, jwtTtl: cfg.jwtTtl };
  if (cfg.bus) userServiceDeps.bus = cfg.bus;
  if (cfg.mfaKek) userServiceDeps.mfaKek = cfg.mfaKek;
  const userService = buildUserService(userServiceDeps);
  app.use(userService);

  app.use(buildCarrierRouter({ pool: cfg.pool, jwtSecret: cfg.jwtSecret }));
  app.use(buildComplianceRouter({ pool: cfg.pool, jwtSecret: cfg.jwtSecret }));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });

  return { app, metricsRegistry: metrics.registry };
}
