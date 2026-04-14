export interface GatewayRuntimeConfig {
  port: number;
  databaseUrl: string;
  jwtAccessSecret: string;
  jwtAccessTtl: string;
  logLevel: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
}

export function loadGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayRuntimeConfig {
  const databaseUrl = env['DATABASE_URL'];
  const jwtAccessSecret = env['JWT_ACCESS_SECRET'];
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!jwtAccessSecret || jwtAccessSecret.length < 16) {
    throw new Error('JWT_ACCESS_SECRET is required and must be at least 16 chars');
  }
  return {
    port: Number(env['GATEWAY_PORT'] ?? 3000),
    databaseUrl,
    jwtAccessSecret,
    jwtAccessTtl: env['JWT_ACCESS_TTL'] ?? '15m',
    logLevel: env['LOG_LEVEL'] ?? 'info',
    rateLimitWindowMs: Number(env['RATE_LIMIT_WINDOW_MS'] ?? 60_000),
    rateLimitMax: Number(env['RATE_LIMIT_MAX'] ?? 120),
  };
}
