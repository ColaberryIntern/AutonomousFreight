import express from 'express';
import request from 'supertest';
import { buildRateLimit } from '../../../services/api-gateway/src/middleware/rateLimit';

function buildTestApp(limit: number): express.Express {
  const app = express();
  app.use(buildRateLimit({ windowMs: 60_000, max: limit }));
  app.get('/ping', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get('/metrics', (_req, res) => {
    res.status(200).send('metrics');
  });
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  return app;
}

describe('rate limit middleware', () => {
  it('returns 429 after the configured limit is exceeded', async () => {
    const app = buildTestApp(2);
    const agent = request.agent(app);
    await agent.get('/ping').expect(200);
    await agent.get('/ping').expect(200);
    const over = await agent.get('/ping');
    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ error: 'rate_limited' });
  });

  it('exempts /metrics and /health from rate limiting', async () => {
    const app = buildTestApp(1);
    const agent = request.agent(app);
    await agent.get('/ping').expect(200);
    await agent.get('/metrics').expect(200);
    await agent.get('/metrics').expect(200);
    await agent.get('/health').expect(200);
    await agent.get('/health').expect(200);
  });
});
