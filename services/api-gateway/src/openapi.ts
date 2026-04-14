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
      '/api/v1/shipments': {
        get: {
          summary: 'List shipments',
          tags: ['carrier'],
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'Shipments list' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/v1/shipments/{id}': {
        get: {
          summary: 'Shipment detail with bids + rankings',
          tags: ['carrier'],
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'Shipment + bids + rankings' },
            '400': { description: 'Bad id' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden role' },
            '404': { description: 'Not found' },
          },
        },
      },
      '/api/v1/shipments/{id}/assign-carrier': {
        post: {
          summary: 'Assign a carrier to a quoting shipment (mutation, audited, event emitted)',
          tags: ['carrier'],
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'Assigned' },
            '400': { description: 'Invalid id or bid does not exist' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden role' },
            '404': { description: 'Shipment not found' },
            '409': { description: 'Shipment not in quoting state' },
          },
        },
      },
      '/api/v1/scoring/weights': {
        get: {
          summary: 'Scoring weights + formula (explainability)',
          tags: ['carrier'],
          security: [{ bearer: [] }],
          responses: { '200': { description: 'Weights' }, '401': { description: 'Unauthorized' } },
        },
      },
      '/api/v1/dashboard/overview': {
        get: {
          summary: 'Aggregate counts for the supervisor cockpit',
          tags: ['dashboard'],
          security: [{ bearer: [] }],
          responses: { '200': { description: 'Overview' }, '401': { description: 'Unauthorized' } },
        },
      },
      '/api/v1/compliance/summary': {
        get: {
          summary: 'Risk-bucket and artifact-type summary (admin/auditor)',
          tags: ['compliance'],
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'Summary' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden role' },
          },
        },
      },
      '/api/v1/admin/users': {
        get: {
          summary: 'List users (admin only)',
          tags: ['admin'],
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'Users list' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden role' },
          },
        },
      },
      '/api/v1/audit/logs': {
        get: {
          summary: 'Paginated audit log (admin only)',
          tags: ['admin'],
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'Audit events' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden role' },
          },
        },
      },
      '/api/v1/carriers': {
        get: {
          summary: 'List carriers (?active=false to include inactive)',
          tags: ['carrier'],
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'Carriers list' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/v1/carriers/{id}/compliance': {
        get: {
          summary: 'Carrier compliance snapshot + risk score (admin/broker/auditor)',
          tags: ['compliance'],
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'Compliance snapshot' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden role' },
            '404': { description: 'No compliance row' },
          },
        },
      },
      '/api/v1/compliance/expiring': {
        get: {
          summary: 'Artifacts expiring within N days (admin/auditor)',
          tags: ['compliance'],
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'Expiring artifacts' },
            '400': { description: 'Invalid within_days' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden role' },
          },
        },
      },
      '/auth/mfa/enroll': {
        post: {
          summary: 'Enroll TOTP MFA (returns secret + otpauth URI)',
          tags: ['auth'],
          security: [{ bearer: [] }],
          responses: { '200': { description: 'Enrolled' }, '401': { description: 'Unauthorized' } },
        },
      },
      '/auth/mfa/verify': {
        post: {
          summary: 'Verify TOTP code + enable MFA',
          tags: ['auth'],
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'Enabled' },
            '400': { description: 'Invalid input' },
            '401': { description: 'Invalid code' },
            '409': { description: 'Not enrolled' },
          },
        },
      },
      '/auth/mfa/login': {
        post: {
          summary: 'MFA-required login (email + password + code)',
          tags: ['auth'],
          responses: {
            '200': { description: 'Token issued' },
            '401': { description: 'Invalid credentials' },
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
