import { buildMetrics } from '../../../services/api-gateway/src/middleware/metrics';

describe('metrics bundle', () => {
  it('exposes http_requests_total and http_request_duration_seconds', async () => {
    const bundle = buildMetrics();
    const text = await bundle.registry.metrics();
    expect(text).toContain('http_requests_total');
    expect(text).toContain('http_request_duration_seconds');
  });

  it('counter increments produce the expected sample text', async () => {
    const bundle = buildMetrics();
    bundle.requestsTotal.inc({ method: 'GET', route: '/health', status: '200' });
    bundle.requestsTotal.inc({ method: 'GET', route: '/health', status: '200' });
    const text = await bundle.registry.metrics();
    expect(text).toMatch(/http_requests_total\{.*route="\/health".*\} 2/);
  });

  it('default nodejs metrics are collected', async () => {
    const bundle = buildMetrics();
    const text = await bundle.registry.metrics();
    expect(text).toContain('process_cpu_user_seconds_total');
  });
});
