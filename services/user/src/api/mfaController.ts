import type { Request, Response } from 'express';
import { z } from 'zod';
import { decryptSecret, encryptSecret, enrollTotp, verifyTotp } from '../domain/mfa';
import { issueAccessToken } from '../domain/jwt';
import { verifyPassword } from '../domain/password';
import type { AuditRepository } from '../repo/auditRepository';
import type { UserRepository } from '../repo/userRepository';

export interface MfaDeps {
  repo: UserRepository;
  audit?: AuditRepository;
  jwtSecret: string;
  jwtTtl: string;
  kek: string;
}

const VerifySchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const MfaLoginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});

function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 900;
  const value = Number(m[1]);
  const mults: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (mults[m[2] ?? 's'] ?? 1);
}

export function enrollMfaController(deps: MfaDeps) {
  return async function handle(req: Request, res: Response): Promise<void> {
    const u = req.user;
    if (!u) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const { secret, otpauthUri } = enrollTotp(u.email);
      const enc = encryptSecret(secret, deps.kek);
      await deps.repo.setMfaSecret(u.userId, enc);
      void deps.audit?.record({
        actorUserId: u.userId,
        action: 'mfa.enrolled',
        target: u.userId,
      });
      res.status(200).json({ secret, otpauthUri });
    } catch (err) {
      console.error('[mfa.enroll] error', err);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

export function verifyMfaController(deps: MfaDeps) {
  return async function handle(req: Request, res: Response): Promise<void> {
    const u = req.user;
    if (!u) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const parsed = VerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      const fresh = await deps.repo.findById(u.userId);
      if (!fresh?.mfaSecretEnc) {
        res.status(409).json({ error: 'mfa_not_enrolled' });
        return;
      }
      const secret = decryptSecret(fresh.mfaSecretEnc, deps.kek);
      if (!verifyTotp(parsed.data.code, secret)) {
        res.status(401).json({ error: 'invalid_code' });
        return;
      }
      await deps.repo.enableMfa(u.userId);
      void deps.audit?.record({
        actorUserId: u.userId,
        action: 'mfa.enabled',
        target: u.userId,
      });
      res.status(200).json({ enabled: true });
    } catch (err) {
      console.error('[mfa.verify] error', err);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

export function mfaLoginController(deps: MfaDeps) {
  return async function handle(req: Request, res: Response): Promise<void> {
    const parsed = MfaLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const { email, password, code } = parsed.data;
    try {
      const user = await deps.repo.findByEmailWithMfa(email);
      if (!user || !user.mfaEnabled || !user.mfaSecretEnc) {
        res.status(401).json({ error: 'invalid_credentials' });
        return;
      }
      const passOk = await verifyPassword(password, user.passwordHash);
      if (!passOk) {
        res.status(401).json({ error: 'invalid_credentials' });
        return;
      }
      const secret = decryptSecret(user.mfaSecretEnc, deps.kek);
      if (!verifyTotp(code, secret)) {
        res.status(401).json({ error: 'invalid_credentials' });
        return;
      }
      const token = issueAccessToken(
        { sub: user.id, email: user.email, roles: user.roles },
        deps.jwtSecret,
        deps.jwtTtl,
      );
      void deps.audit?.record({ actorUserId: user.id, action: 'auth.mfa_login' });
      res.status(200).json({
        accessToken: token,
        tokenType: 'Bearer',
        expiresIn: ttlToSeconds(deps.jwtTtl),
      });
    } catch (err) {
      console.error('[mfa.login] error', err);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}
