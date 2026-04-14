export interface UserServiceConfig {
  databaseUrl: string;
  jwtAccessSecret: string;
  jwtAccessTtl: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): UserServiceConfig {
  const databaseUrl = env['DATABASE_URL'];
  const jwtAccessSecret = env['JWT_ACCESS_SECRET'];
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!jwtAccessSecret || jwtAccessSecret.length < 16) {
    throw new Error('JWT_ACCESS_SECRET is required and must be at least 16 chars');
  }
  return {
    databaseUrl,
    jwtAccessSecret,
    jwtAccessTtl: env['JWT_ACCESS_TTL'] ?? '15m',
    port: Number(env['PORT'] ?? 3001),
  };
}
