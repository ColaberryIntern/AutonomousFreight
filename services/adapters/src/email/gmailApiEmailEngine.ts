/**
 * Gmail API email engine — the first REAL engine behind the Email adapter
 * contract ("own the brain, rent the senses": the mock and this engine are
 * interchangeable to the core).
 *
 * Read path only: fetchInbound lists the newest INBOX messages and maps them to
 * the canonical InboundEmail shape. Outbound send is deliberately NOT
 * implemented here — the contract requires real engines to gate sends behind
 * human sign-off, so send() returns a typed refusal.
 *
 * Auth reuses the existing Google OAuth pattern (client id + secret + refresh
 * token, same env names as the send-only notifications driver). The googleapis
 * dependency is already in the root workspace; no new packages.
 */
import { google, type gmail_v1 } from 'googleapis';
import type { AdapterResult, HealthStatus, OpMeta } from '../contract';
import { correlationId, err, ok } from '../contract';
import type { EmailEngine, InboundEmail, OutboundEmail, SendResult } from './emailAdapter';
import { stripHtml } from './htmlText';

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GmailFetchOptions {
  /** Max messages per fetch (default 12). */
  maxResults?: number;
  /** Optional Gmail search query (e.g. "label:INBOX newer_than:7d"). */
  query?: string;
  /** Cap on decoded body length (default 20000 chars). */
  maxBodyChars?: number;
}

const BODY_CAP_DEFAULT = 20000;

function decodeB64Url(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

interface BodyScan {
  plain?: string;
  html?: string;
  hasAttachments: boolean;
}

function scanParts(part: gmail_v1.Schema$MessagePart | undefined, acc: BodyScan): void {
  if (!part) return;
  if (part.filename && part.filename.length > 0) acc.hasAttachments = true;
  const data = part.body?.data;
  if (data) {
    if (part.mimeType === 'text/plain' && acc.plain === undefined) acc.plain = decodeB64Url(data);
    else if (part.mimeType === 'text/html' && acc.html === undefined) acc.html = decodeB64Url(data);
  }
  for (const child of part.parts ?? []) scanParts(child, acc);
}

/** Pure mapper: one Gmail API message → canonical InboundEmail. Unit-testable. */
export function mapGmailMessage(msg: gmail_v1.Schema$Message, maxBodyChars = BODY_CAP_DEFAULT): InboundEmail {
  const headers = msg.payload?.headers ?? [];
  const header = (name: string): string =>
    headers.find((h) => (h.name ?? '').toLowerCase() === name.toLowerCase())?.value ?? '';

  const scan: BodyScan = { hasAttachments: false };
  scanParts(msg.payload, scan);
  let body = scan.plain ?? (scan.html !== undefined ? stripHtml(scan.html) : '');
  if (!body && msg.snippet) body = msg.snippet;
  if (body.length > maxBodyChars) body = body.slice(0, maxBodyChars);

  const receivedAt = msg.internalDate
    ? new Date(Number(msg.internalDate)).toISOString()
    : new Date(0).toISOString();

  const to = header('To')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return {
    messageId: msg.id ?? 'gmail-unknown',
    from: header('From'),
    to,
    subject: header('Subject'),
    body,
    receivedAt,
    ...(scan.hasAttachments ? { hasAttachments: true } : {}),
  };
}

/** Classify a googleapis error into the contract's retry-driving categories. */
function classify(e: unknown): { category: 'auth' | 'transient' | 'external_api'; message: string } {
  const anyE = e as { code?: number | string; response?: { status?: number }; message?: string };
  const status = typeof anyE.code === 'number' ? anyE.code : anyE.response?.status;
  const message = String(anyE.message ?? 'unknown gmail error');
  if (status === 401 || status === 403 || /invalid_grant/i.test(message)) return { category: 'auth', message };
  if (status !== undefined && (status === 429 || status >= 500)) return { category: 'external_api', message };
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(message)) return { category: 'transient', message };
  return { category: 'external_api', message };
}

export class GmailApiEmailEngine implements EmailEngine {
  readonly kind = 'email' as const;
  readonly engine = 'gmail-api';
  private readonly gmail: gmail_v1.Gmail;
  private readonly opts: Required<GmailFetchOptions>;

  constructor(creds: GmailCredentials, opts: GmailFetchOptions = {}) {
    const auth = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
    auth.setCredentials({ refresh_token: creds.refreshToken });
    this.gmail = google.gmail({ version: 'v1', auth });
    this.opts = {
      maxResults: opts.maxResults ?? 12,
      query: opts.query ?? '',
      maxBodyChars: opts.maxBodyChars ?? BODY_CAP_DEFAULT,
    };
  }

  private meta(operation: string, seed: string, startedAt: string, durationMs: number): OpMeta {
    return { adapter: 'email', engine: this.engine, operation, correlationId: correlationId('email', operation, seed), startedAt, durationMs };
  }

  async health(): Promise<HealthStatus> {
    try {
      const prof = await this.gmail.users.getProfile({ userId: 'me' });
      const addr = prof.data.emailAddress;
      return { state: 'up', engine: this.engine, ...(addr ? { detail: addr } : {}) };
    } catch (e) {
      return { state: 'down', engine: this.engine, detail: classify(e).message.slice(0, 200) };
    }
  }

  async fetchInbound(correlationSeed: string): Promise<AdapterResult<InboundEmail[]>> {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    try {
      const list = await this.gmail.users.messages.list({
        userId: 'me',
        labelIds: ['INBOX'],
        maxResults: this.opts.maxResults,
        ...(this.opts.query ? { q: this.opts.query } : {}),
      });
      const ids = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id);
      const emails: InboundEmail[] = [];
      for (const id of ids) {
        const full = await this.gmail.users.messages.get({ userId: 'me', id, format: 'full' });
        emails.push(mapGmailMessage(full.data, this.opts.maxBodyChars));
      }
      return ok(emails, this.meta('fetchInbound', correlationSeed, startedAt, Date.now() - t0));
    } catch (e) {
      const c = classify(e);
      return err(
        { category: c.category, message: 'gmail fetchInbound failed', detail: c.message.slice(0, 300) },
        this.meta('fetchInbound', correlationSeed, startedAt, Date.now() - t0),
      );
    }
  }

  async send(_email: OutboundEmail, correlationSeed: string): Promise<AdapterResult<SendResult>> {
    const startedAt = new Date().toISOString();
    return err(
      {
        category: 'validation',
        message: 'outbound send is gated behind human sign-off and is not implemented in the gmail-api engine',
      },
      this.meta('send', correlationSeed, startedAt, 0),
    );
  }
}
