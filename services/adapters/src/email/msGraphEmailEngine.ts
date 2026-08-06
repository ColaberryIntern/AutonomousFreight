/**
 * Microsoft 365 Graph email engine — the PRODUCTION intake path.
 *
 * This is the mailbox Karun's system reads in production: QuotesTeam@shipces.com,
 * via Microsoft Graph with an Azure app registration (OAuth2 client-credentials,
 * app-only). Read path only: fetchInbound lists the newest Inbox messages and
 * maps them to the canonical InboundEmail. Outbound send is a typed refusal
 * (real engines gate sends behind human sign-off).
 *
 * Plain https, no new dependencies. Same Email adapter contract as the mock and
 * the Gmail engine, so the core does not change when this becomes the source.
 */
import * as https from 'https';
import type { AdapterResult, HealthStatus, OpMeta } from '../contract';
import { correlationId, err, ok } from '../contract';
import type { EmailEngine, InboundEmail, OutboundEmail, SendResult } from './emailAdapter';
import { stripHtml } from './htmlText';

export interface GraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Target mailbox UPN, e.g. QuotesTeam@shipces.com. */
  mailbox: string;
}

export interface GraphFetchOptions {
  maxResults?: number;
  /** Optional Graph $filter (e.g. "receivedDateTime ge 2026-07-01T00:00:00Z"). */
  filter?: string;
  maxBodyChars?: number;
}

const BODY_CAP_DEFAULT = 20000;

/** Minimal shape of a Graph message we consume (the $select fields). */
export interface GraphMessage {
  id?: string;
  internetMessageId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  body?: { contentType?: string; content?: string };
}

function formatAddress(a?: { name?: string; address?: string }): string {
  if (!a || !a.address) return a?.name ?? '';
  return a.name ? `${a.name} <${a.address}>` : a.address;
}

/** Pure mapper: one Graph message → canonical InboundEmail. Unit-testable. */
export function mapGraphMessage(msg: GraphMessage, maxBodyChars = BODY_CAP_DEFAULT): InboundEmail {
  const isHtml = (msg.body?.contentType ?? '').toLowerCase() === 'html';
  const rawBody = msg.body?.content ?? '';
  let body = rawBody ? (isHtml ? stripHtml(rawBody) : rawBody.trim()) : '';
  if (!body && msg.bodyPreview) body = msg.bodyPreview;
  if (body.length > maxBodyChars) body = body.slice(0, maxBodyChars);

  const to = (msg.toRecipients ?? [])
    .map((r) => r.emailAddress?.address ?? '')
    .filter((s) => s.length > 0);

  return {
    messageId: msg.internetMessageId ?? msg.id ?? 'graph-unknown',
    from: formatAddress(msg.from?.emailAddress),
    to,
    subject: msg.subject ?? '',
    body,
    receivedAt: msg.receivedDateTime ?? new Date(0).toISOString(),
    ...(msg.hasAttachments ? { hasAttachments: true } : {}),
  };
}

function classify(status: number | undefined, message: string): { category: 'auth' | 'transient' | 'external_api'; message: string } {
  if (status === 401 || status === 403 || /invalid_client|invalid_grant|unauthorized/i.test(message)) return { category: 'auth', message };
  if (status !== undefined && (status === 429 || status >= 500)) return { category: 'external_api', message };
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|timeout|network/i.test(message)) return { category: 'transient', message };
  return { category: 'external_api', message };
}

interface HttpResponse {
  status: number;
  body: string;
}

function httpsRequest(options: https.RequestOptions, payload?: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request({ timeout: 30000, ...options }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => req.destroy(new Error('graph request timeout (30s)')));
    if (payload) req.write(payload);
    req.end();
  });
}

export class MsGraphEmailEngine implements EmailEngine {
  readonly kind = 'email' as const;
  readonly engine = 'ms-graph';
  private readonly opts: Required<GraphFetchOptions>;
  private token = '';
  private tokenExpiresAt = 0;

  constructor(private readonly creds: GraphCredentials, opts: GraphFetchOptions = {}) {
    this.opts = {
      maxResults: opts.maxResults ?? 12,
      filter: opts.filter ?? '',
      maxBodyChars: opts.maxBodyChars ?? BODY_CAP_DEFAULT,
    };
  }

  /** OAuth2 client-credentials (app-only). Cached until ~60s before expiry. */
  private async accessToken(nowMs: number): Promise<string> {
    if (this.token && nowMs < this.tokenExpiresAt - 60000) return this.token;
    const form =
      `client_id=${encodeURIComponent(this.creds.clientId)}` +
      `&client_secret=${encodeURIComponent(this.creds.clientSecret)}` +
      `&scope=${encodeURIComponent('https://graph.microsoft.com/.default')}` +
      `&grant_type=client_credentials`;
    const res = await httpsRequest(
      {
        host: 'login.microsoftonline.com',
        path: `/${encodeURIComponent(this.creds.tenantId)}/oauth2/v2.0/token`,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) },
      },
      form,
    );
    if (res.status < 200 || res.status >= 300) {
      let msg = `token HTTP ${res.status}`;
      try {
        const j = JSON.parse(res.body) as { error_description?: string; error?: string };
        if (j.error_description || j.error) msg = j.error_description ?? j.error ?? msg;
      } catch { /* keep bare status */ }
      const e = new Error(msg) as Error & { status?: number };
      e.status = res.status;
      throw e;
    }
    const j = JSON.parse(res.body) as { access_token: string; expires_in?: number };
    this.token = j.access_token;
    this.tokenExpiresAt = nowMs + (j.expires_in ?? 3600) * 1000;
    return this.token;
  }

  private meta(operation: string, seed: string, startedAt: string, durationMs: number): OpMeta {
    return { adapter: 'email', engine: this.engine, operation, correlationId: correlationId('email', operation, seed), startedAt, durationMs };
  }

  async health(): Promise<HealthStatus> {
    try {
      await this.accessToken(Date.now());
      return { state: 'up', engine: this.engine, detail: this.creds.mailbox };
    } catch (e) {
      return { state: 'down', engine: this.engine, detail: (e as Error).message.slice(0, 200) };
    }
  }

  async fetchInbound(correlationSeed: string): Promise<AdapterResult<InboundEmail[]>> {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    try {
      const token = await this.accessToken(t0);
      const select = 'id,internetMessageId,subject,bodyPreview,receivedDateTime,hasAttachments,from,toRecipients,body';
      let path =
        `/v1.0/users/${encodeURIComponent(this.creds.mailbox)}/mailFolders/inbox/messages` +
        `?$top=${this.opts.maxResults}&$orderby=receivedDateTime%20desc&$select=${encodeURIComponent(select)}`;
      if (this.opts.filter) path += `&$filter=${encodeURIComponent(this.opts.filter)}`;
      const res = await httpsRequest({
        host: 'graph.microsoft.com',
        path,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (res.status < 200 || res.status >= 300) {
        let detail = `graph HTTP ${res.status}`;
        try {
          const j = JSON.parse(res.body) as { error?: { message?: string } };
          if (j.error?.message) detail = j.error.message;
        } catch { /* keep bare status */ }
        const c = classify(res.status, detail);
        return err({ category: c.category, message: 'graph fetchInbound failed', detail: detail.slice(0, 300) }, this.meta('fetchInbound', correlationSeed, startedAt, Date.now() - t0));
      }
      const parsed = JSON.parse(res.body) as { value?: GraphMessage[] };
      const emails = (parsed.value ?? []).map((m) => mapGraphMessage(m, this.opts.maxBodyChars));
      return ok(emails, this.meta('fetchInbound', correlationSeed, startedAt, Date.now() - t0));
    } catch (e) {
      const status = (e as { status?: number }).status;
      const c = classify(status, (e as Error).message);
      return err({ category: c.category, message: 'graph fetchInbound failed', detail: c.message.slice(0, 300) }, this.meta('fetchInbound', correlationSeed, startedAt, Date.now() - t0));
    }
  }

  async send(_email: OutboundEmail, correlationSeed: string): Promise<AdapterResult<SendResult>> {
    const startedAt = new Date().toISOString();
    return err(
      { category: 'validation', message: 'outbound send is gated behind human sign-off and is not implemented in the ms-graph engine' },
      this.meta('send', correlationSeed, startedAt, 0),
    );
  }
}
