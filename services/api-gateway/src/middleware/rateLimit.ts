import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

const EXEMPT_PATHS = new Set(['/metrics', '/health']);

export function buildRateLimit(cfg: RateLimitConfig): RequestHandler {
  const options: Partial<Options> = {
    windowMs: cfg.windowMs,
    limit: cfg.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req: Request): boolean => EXEMPT_PATHS.has(req.path),
    handler: (_req, res) => {
      res.status(429).json({ error: 'rate_limited' });
    },
  };
  return rateLimit(options);
}
