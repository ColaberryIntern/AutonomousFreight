import express, { type Express, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import type { EventBus } from '../../../events/src/types';
import { requireAuth, requireRole } from './authMiddleware';
import { loginController } from './loginController';
import { enrollMfaController, mfaLoginController, verifyMfaController } from './mfaController';
import { registerController } from './registerController';
import { getUsage } from '../../../billing/src/domain/usage';
import { buildConsentStatus, CURRENT_CONSENT_VERSION } from '../domain/consent';
import { computeSecurityKpis } from '../domain/securityKpis';
import { computeSecurityTrends } from '../domain/securityTrends';
import { AuditRepository } from '../repo/auditRepository';
import { UserRepository } from '../repo/userRepository';

export interface ServerDeps {
  pool: Pool;
  jwtSecret: string;
  jwtTtl: string;
  bus?: EventBus;
  mfaKek?: string;
}

export function buildServer({ pool, jwtSecret, jwtTtl, bus, mfaKek }: ServerDeps): Express {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  const repo = new UserRepository(pool);
  const audit = new AuditRepository(pool);

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/auth/register', registerController(bus ? { repo, bus } : { repo }));
  app.post('/auth/login', loginController({ repo, jwtSecret, jwtTtl, audit }));

  if (mfaKek) {
    const mfaDeps = { repo, audit, jwtSecret, jwtTtl, kek: mfaKek };
    app.post('/auth/mfa/enroll', requireAuth(jwtSecret), enrollMfaController(mfaDeps));
    app.post('/auth/mfa/verify', requireAuth(jwtSecret), verifyMfaController(mfaDeps));
    app.post('/auth/mfa/login', mfaLoginController(mfaDeps));
  }

  app.get('/me', requireAuth(jwtSecret), (req: Request, res: Response) => {
    res.status(200).json({ user: req.user });
  });

  app.get(
    '/admin/ping',
    requireAuth(jwtSecret),
    requireRole('admin'),
    (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    },
  );

  app.get(
    '/api/v1/admin/users',
    requireAuth(jwtSecret),
    requireRole('admin'),
    async (req: Request, res: Response) => {
      const limit = Number(req.query['limit'] ?? 50);
      const offset = Number(req.query['offset'] ?? 0);
      const items = await repo.listUsers(limit, offset);
      res.status(200).json({ items });
    },
  );

  app.get(
    '/api/v1/audit/logs',
    requireAuth(jwtSecret),
    requireRole('admin'),
    async (req: Request, res: Response) => {
      const limit = Number(req.query['limit'] ?? 50);
      const offset = Number(req.query['offset'] ?? 0);
      const action = typeof req.query['action'] === 'string' ? req.query['action'] : undefined;
      const items = await audit.listPage(action ? { limit, offset, action } : { limit, offset });
      res.status(200).json({ items });
    },
  );

  app.get('/api/v1/consent', requireAuth(jwtSecret), async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const r = await pool.query<{ consent_version: string | null; consent_given_at: Date | null }>(
      'SELECT consent_version, consent_given_at FROM users WHERE id = $1',
      [userId],
    );
    const row = r.rows[0];
    res.status(200).json(
      buildConsentStatus(
        row?.consent_version ?? null,
        row?.consent_given_at?.toISOString() ?? null,
      ),
    );
  });

  app.post('/api/v1/consent', requireAuth(jwtSecret), async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    await pool.query(
      `UPDATE users SET consent_version = $1, consent_given_at = NOW() WHERE id = $2`,
      [CURRENT_CONSENT_VERSION, userId],
    );
    void audit.record({
      actorUserId: userId,
      action: 'user.consent.granted',
      metadata: { version: CURRENT_CONSENT_VERSION },
    });
    res.status(200).json({ ok: true, version: CURRENT_CONSENT_VERSION });
  });

  app.get('/api/v1/billing/usage', requireAuth(jwtSecret), (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.status(200).json({ usage: getUsage(userId) });
  });

  app.get(
    '/api/v1/security/kpis',
    requireAuth(jwtSecret),
    requireRole('admin'),
    async (_req: Request, res: Response) => {
      const kpis = await computeSecurityKpis(pool);
      res.status(200).json(kpis);
    },
  );

  app.get(
    '/api/v1/security/trends',
    requireAuth(jwtSecret),
    requireRole('admin'),
    async (req: Request, res: Response) => {
      const hours = Number(req.query['hours'] ?? 24);
      const clamped = Math.min(Math.max(hours, 1), 168);
      const trends = await computeSecurityTrends(pool, clamped);
      res.status(200).json(trends);
    },
  );

  return app;
}
