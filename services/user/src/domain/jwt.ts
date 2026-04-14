import jwt from 'jsonwebtoken';

export interface JwtClaims {
  sub: string;
  email: string;
  roles: string[];
}

export interface VerifiedClaims extends JwtClaims {
  iat: number;
  exp: number;
}

export function issueAccessToken(claims: JwtClaims, secret: string, ttl: string): string {
  if (!secret || secret.length < 16) {
    throw new Error('JWT secret missing or too short');
  }
  return jwt.sign(claims, secret, { expiresIn: ttl as unknown as number });
}

export function verifyAccessToken(token: string, secret: string): VerifiedClaims {
  const decoded = jwt.verify(token, secret, { clockTolerance: 60 });
  if (typeof decoded === 'string') {
    throw new Error('Unexpected token payload');
  }
  return decoded as VerifiedClaims;
}
