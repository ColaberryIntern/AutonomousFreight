import type { Request, Response } from 'express';
import { issueAccessToken } from '../domain/jwt';
import { verifyPassword } from '../domain/password';
import { LoginSchema } from '../domain/validation';
import type { AuditRepository } from '../repo/auditRepository';
import type { UserRepository } from '../repo/userRepository';

interface LoginDeps {
  repo: UserRepository;
  jwtSecret: string;
  jwtTtl: string;
  audit?: AuditRepository;
}

const DUMMY_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8.4R4q/2Hj5pQf7Z8bPeOq8rV0vG3q';

function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit ?? 's'] ?? 1);
}

export function loginController({ repo, jwtSecret, jwtTtl, audit }: LoginDeps) {
  return async function handleLogin(req: Request, res: Response): Promise<void> {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const { email, password } = parsed.data;
    try {
      const user = await repo.findByEmailWithMfa(email);
      const hashToCompare = user?.passwordHash ?? DUMMY_HASH;
      const ok = await verifyPassword(password, hashToCompare);
      if (!user || !ok) {
        if (audit) {
          void audit.record({
            action: 'auth.login.failure',
            metadata: { email, reason: !user ? 'unknown_email' : 'bad_password' },
          });
        }
        res.status(401).json({ error: 'invalid_credentials' });
        return;
      }
      if (user.mfaEnabled) {
        res.status(200).json({ mfaRequired: true });
        return;
      }
      if (audit) {
        void audit.record({
          action: 'auth.login.success',
          actorUserId: user.id,
          metadata: { email },
        });
      }
      const token = issueAccessToken(
        { sub: user.id, email: user.email, roles: user.roles },
        jwtSecret,
        jwtTtl,
      );
      res.status(200).json({
        accessToken: token,
        tokenType: 'Bearer',
        expiresIn: ttlToSeconds(jwtTtl),
      });
    } catch (err) {
      console.error('[login] unexpected error', err);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}
