import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../domain/jwt';
import { userHasAnyRole, type Role } from '../domain/rbac';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  roles: string[];
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

export function requireAuth(secret: string) {
  return function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const token = header.slice('Bearer '.length);
    try {
      const claims = verifyAccessToken(token, secret);
      req.user = { userId: claims.sub, email: claims.email, roles: claims.roles };
      next();
    } catch {
      res.status(401).json({ error: 'unauthorized' });
    }
  };
}

export function requireRole(...requiredRoles: Role[]) {
  return function roleMiddleware(req: Request, res: Response, next: NextFunction): void {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (!userHasAnyRole(user.roles, requiredRoles)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };
}
