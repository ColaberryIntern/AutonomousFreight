import express, { type Express, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { EventBus } from '../../../events/src/types';
import { withRetry } from '../../../platform/src/reliability/withRetry';
import { requireAuth, requireRole } from './authMiddleware';
import { loginController } from './loginController';
import { enrollMfaController, mfaLoginController, verifyMfaController } from './mfaController';
import { registerController } from './registerController';
import { getUsage } from '../../../billing/src/domain/usage';
import { computeAdminSummary } from '../domain/adminSummary';
import { buildConsentStatus, CURRENT_CONSENT_VERSION } from '../domain/consent';
import { ALL_ROLES, isKnownRole, type Role } from '../domain/rbac';
import { computeSecurityKpis } from '../domain/securityKpis';
import { computeSecurityTrends } from '../domain/securityTrends';
import { parseAuditLogsQuery } from '../domain/auditLogsQuery';
import { AuditRepository } from '../repo/auditRepository';
import { UserRepository } from '../repo/userRepository';

const ADMIN_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const AdminUsersQuery = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    search: z.string().min(1).max(254).optional(),
    role: z.enum(ALL_ROLES as readonly [Role, ...Role[]]).optional(),
  });

  app.get(
    '/api/v1/admin/users',
    requireAuth(jwtSecret),
    requireRole('admin'),
    async (req: Request, res: Response) => {
      const requestId = req.requestId ?? '-';
      const startedAt = Date.now();
      const parsed = AdminUsersQuery.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
        return;
      }
      const { limit, offset, search, role } = parsed.data;
      const usingFilters = search !== undefined || role !== undefined;
      try {
        // Preserve the original no-filter call signature for the existing
        // integration test path; only branch into searchUsers when filters
        // or pagination need it.
        const items =
          usingFilters || limit !== undefined || offset !== undefined
            ? await repo.searchUsers({
                ...(search !== undefined ? { search } : {}),
                ...(role !== undefined ? { role } : {}),
                ...(limit !== undefined ? { limit } : {}),
                ...(offset !== undefined ? { offset } : {}),
              })
            : await repo.listUsers();
        console.warn('[admin.users] ok', {
          requestId,
          durationMs: Date.now() - startedAt,
          count: items.length,
          filtered: usingFilters,
        });
        res.status(200).json({ items });
      } catch (err) {
        console.error('[admin.users] failed', { requestId, err: String(err) });
        res.status(503).json({
          error: 'admin_users_unavailable',
          message: 'User list temporarily unavailable. Please try again.',
          requestId,
        });
      }
    },
  );

  app.get(
    '/api/v1/admin/users/:id',
    requireAuth(jwtSecret),
    requireRole('admin'),
    async (req: Request, res: Response) => {
      const requestId = req.requestId ?? '-';
      const raw = req.params['id'];
      const userId = typeof raw === 'string' ? raw : '';
      if (!ADMIN_UUID_RE.test(userId)) {
        res.status(400).json({ error: 'invalid_user_id' });
        return;
      }
      try {
        const detail = await repo.findUserDetail(userId);
        if (!detail) {
          res.status(404).json({ error: 'user_not_found' });
          return;
        }
        // Defensive: ensure roles are known values before returning.
        const roles = detail.roles.filter((r) => isKnownRole(r));
        console.warn('[admin.user_detail] ok', { requestId, userId });
        res.status(200).json({ ...detail, roles });
      } catch (err) {
        console.error('[admin.user_detail] failed', { requestId, userId, err: String(err) });
        res.status(503).json({
          error: 'admin_user_detail_unavailable',
          message: 'User detail temporarily unavailable. Please try again.',
          requestId,
        });
      }
    },
  );

  app.get(
    '/api/v1/admin/summary',
    requireAuth(jwtSecret),
    requireRole('admin'),
    async (req: Request, res: Response) => {
      const requestId = req.requestId ?? '-';
      const startedAt = Date.now();
      try {
        const summary = await withRetry(() => computeAdminSummary({ pool }), {
          attempts: 2,
          baseDelayMs: 100,
          onAttemptFailed: (n, err) => {
            console.warn('[admin.summary] retry', { requestId, attempt: n, err: String(err) });
          },
        });
        console.warn('[admin.summary] ok', {
          requestId,
          durationMs: Date.now() - startedAt,
          totalUsers: summary.users.total,
        });
        res.status(200).json(summary);
      } catch (err) {
        console.error('[admin.summary] failed', { requestId, err: String(err) });
        res.status(503).json({
          error: 'admin_summary_unavailable',
          message: 'Admin summary temporarily unavailable. Please try again.',
          requestId,
        });
      }
    },
  );

  app.get(
    '/api/v1/audit/logs',
    requireAuth(jwtSecret),
    requireRole('admin'),
    async (req: Request, res: Response) => {
      const requestId = req.requestId ?? '-';
      const opts = parseAuditLogsQuery(req.query as Record<string, unknown>);
      try {
        const items = await audit.listPage(opts);
        res.status(200).json({ items });
      } catch (err) {
        console.error('[audit.logs] failed', { requestId, err: String(err) });
        res.status(503).json({
          error: 'audit_logs_unavailable',
          message: 'Audit log temporarily unavailable. Please try again.',
          requestId,
        });
      }
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
