import type { Request, Response, NextFunction } from 'express';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export interface MetricsBundle {
  registry: Registry;
  requestsTotal: Counter<'method' | 'route' | 'status'>;
  requestDurationSeconds: Histogram<'method' | 'route' | 'status'>;
}

export function buildMetrics(): MetricsBundle {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const requestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests handled by the gateway.',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [registry],
  });

  const requestDurationSeconds = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  return { registry, requestsTotal, requestDurationSeconds };
}

function resolveRoute(req: Request): string {
  const routePath = (req.route as { path?: string } | undefined)?.path;
  if (typeof routePath === 'string') return routePath;
  const baseUrl = req.baseUrl ?? '';
  return baseUrl ? `${baseUrl}${routePath ?? ''}` : (req.path ?? 'unknown');
}

export function metricsMiddleware(bundle: MetricsBundle) {
  return function metricsHandler(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/metrics') {
      next();
      return;
    }
    const startNs = process.hrtime.bigint();
    res.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startNs) / 1e9;
      const labels = {
        method: req.method,
        route: resolveRoute(req),
        status: String(res.statusCode),
      };
      bundle.requestsTotal.inc(labels);
      bundle.requestDurationSeconds.observe(labels, durationSeconds);
    });
    next();
  };
}
