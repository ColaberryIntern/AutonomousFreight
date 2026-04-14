import { authenticator } from 'otplib';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

authenticator.options = { window: 1, step: 30 };

export interface EnrollResult {
  secret: string;
  otpauthUri: string;
}

export function enrollTotp(accountName: string, issuer = 'AutonomousFreight'): EnrollResult {
  const secret = authenticator.generateSecret();
  const otpauthUri = authenticator.keyuri(accountName, issuer, secret);
  return { secret, otpauthUri };
}

export function generateTotp(secret: string): string {
  return authenticator.generate(secret);
}

export function verifyTotp(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret });
}

const ALGO = 'aes-256-gcm';

function deriveKey(kek: string, salt: Buffer): Buffer {
  return scryptSync(kek, salt, 32);
}

export function encryptSecret(plain: string, kek: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(kek, salt);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${salt.toString('base64')}.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptSecret(blob: string, kek: string): string {
  const [saltB64, ivB64, tagB64, encB64] = blob.split('.');
  if (!saltB64 || !ivB64 || !tagB64 || !encB64) throw new Error('malformed cipher blob');
  const salt = Buffer.from(saltB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const enc = Buffer.from(encB64, 'base64');
  const key = deriveKey(kek, salt);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
