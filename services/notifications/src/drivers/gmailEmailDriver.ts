/**
 * Gmail OAuth send-only driver.
 *
 * Uses a long-lived refresh token to send mail as the authenticated Google
 * account (typically a service-owner mailbox). Read scope is intentionally
 * unused even if the granted scopes include it — this driver only sends.
 *
 * Construction throws on missing credentials so the gateway fails fast at
 * boot rather than silently swallowing send attempts.
 */
import { google, type gmail_v1 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { EmailDriver, EmailMessage } from './emailDriver';

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Optional From override; defaults to the authenticated account. */
  from?: string;
}

export class GmailEmailDriver implements EmailDriver {
  private readonly gmail: gmail_v1.Gmail;
  private readonly from: string | undefined;

  constructor(cfg: GmailConfig) {
    if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
      throw new Error('Gmail OAuth credentials missing or incomplete');
    }
    const oauth2: OAuth2Client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret);
    oauth2.setCredentials({ refresh_token: cfg.refreshToken });
    this.gmail = google.gmail({ version: 'v1', auth: oauth2 });
    this.from = cfg.from;
  }

  async send(msg: EmailMessage): Promise<void> {
    const raw = this.encodeMessage(msg);
    await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
  }

  private encodeMessage(msg: EmailMessage): string {
    const headers: string[] = [];
    if (this.from) headers.push(`From: ${this.from}`);
    headers.push(`To: ${msg.to}`);
    headers.push(`Subject: ${this.encodeSubject(msg.subject)}`);
    headers.push('MIME-Version: 1.0');
    if (msg.html) {
      headers.push('Content-Type: text/html; charset=utf-8');
      headers.push('Content-Transfer-Encoding: base64');
    } else {
      headers.push('Content-Type: text/plain; charset=utf-8');
      headers.push('Content-Transfer-Encoding: base64');
    }
    headers.push('');
    const bodyEncoded = Buffer.from(msg.html ?? msg.text, 'utf-8').toString('base64');
    const rfc822 = `${headers.join('\r\n')}\r\n${bodyEncoded}`;
    return Buffer.from(rfc822, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private encodeSubject(subject: string): string {
    // RFC 2047 encoded-word for non-ASCII safety.
    if (/^[\x20-\x7E]*$/.test(subject)) return subject;
    const b64 = Buffer.from(subject, 'utf-8').toString('base64');
    return `=?UTF-8?B?${b64}?=`;
  }
}
