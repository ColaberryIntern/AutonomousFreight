export interface OpenApiDoc {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, unknown> };
}

export interface OpenApiOperation {
  summary: string;
  tags?: string[];
  security?: { bearer?: never[] }[];
  responses: Record<string, { description: string }>;
}

export function buildOpenApiDoc(): OpenApiDoc {
  return {
    openapi: '3.0.3',
    info: { title: 'Autonomous Freight API', version: '0.1.0' },
    paths: {
      '/health': {
        get: {
          summary: 'Liveness probe',
          tags: ['ops'],
          responses: { '200': { description: 'OK' } },
        },
      },
      '/metrics': {
        get: {
          summary: 'Prometheus metrics',
          tags: ['ops'],
          responses: { '200': { description: 'metrics text' } },
        },
      },
      '/auth/register': {
        post: {
          summary: 'Register a new user',
          tags: ['auth'],
          responses: {
            '201': { description: 'Created' },
            '400': { description: 'Invalid input' },
            '409': { description: 'Email already registered' },
          },
        },
      },
      '/auth/login': {
        post: {
          summary: 'Issue an access token',
          tags: ['auth'],
          responses: {
            '200': { description: 'Token issued' },
            '401': { description: 'Invalid credentials' },
          },
        },
      },
      '/me': {
        get: {
          summary: 'Current user (requires bearer token)',
          tags: ['auth'],
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'User profile' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/v1/shipments/{id}/select-carrier': {
        post: {
          summary: 'Rank carrier bids for a quoting shipment',
          tags: ['carrier'],
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'Rankings' },
            '400': { description: 'Bad input' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden role' },
            '404': { description: 'Shipment missing' },
            '409': { description: 'Shipment not quotable' },
          },
        },
      },
    },
  };
}
