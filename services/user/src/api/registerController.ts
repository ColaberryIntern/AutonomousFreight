import type { Request, Response } from 'express';
import type { EventBus } from '../../../events/src/types';
import { hashPassword } from '../domain/password';
import { DEFAULT_ROLE, type Role } from '../domain/rbac';
import { RegisterSchema } from '../domain/validation';
import { EmailAlreadyRegisteredError, type UserRepository } from '../repo/userRepository';

export interface RegisterDeps {
  repo: UserRepository;
  bus?: EventBus;
}

export function registerController({ repo, bus }: RegisterDeps) {
  return async function handleRegister(req: Request, res: Response): Promise<void> {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const { email, password, role } = parsed.data;
    const chosenRole: Role = (role as Role | undefined) ?? DEFAULT_ROLE;
    try {
      const hash = await hashPassword(password);
      const user = await repo.create(email, hash, chosenRole);
      if (bus) {
        try {
          const base = {
            name: 'user.registered',
            version: 1,
            occurredAt: new Date().toISOString(),
            payload: { userId: user.id, email: user.email, roles: user.roles },
          };
          await bus.publish(req.requestId ? { ...base, traceId: req.requestId } : base);
        } catch (err) {
          console.error('[register] event publish failed', err);
        }
      }
      res.status(201).json({ userId: user.id, email: user.email, roles: user.roles });
    } catch (err) {
      if (err instanceof EmailAlreadyRegisteredError) {
        res.status(409).json({ error: 'email_already_registered' });
        return;
      }
      console.error('[register] unexpected error', err);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}
