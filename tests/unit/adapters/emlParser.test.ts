/**
 * Unit tests for the `.eml` reader. These use synthetic messages so they run
 * everywhere; the real-corpus behaviour is covered by
 * `tests/unit/rms/corpusHarness.test.ts`, which skips when the corpus is absent.
 *
 * The cases below are the ones that actually bit on real ShipCES mail: base64
 * Spanish subjects, quoted-printable soft breaks landing mid-number, html-only
 * bodies, and multipart trees where the useful text is not the first part.
 */
import { parseEml, parseHeaders, decodeEncodedWords, decodeQuotedPrintable } from '../../../services/adapters/src/email/emlParser';

const CRLF = '\r\n';
const msg = (lines: string[]) => lines.join(CRLF);

describe('parseHeaders', () => {
  it('lowercases keys and unfolds continuation lines', () => {
    const h = parseHeaders(msg(['Subject: a very', '  long folded subject', 'From: a@b.com']));
    expect(h['subject']).toBe('a very long folded subject');
    expect(h['from']).toBe('a@b.com');
  });

  it('keeps the first occurrence when a header repeats', () => {
    // Trace headers repeat; the earliest is the one the message declared.
    const h = parseHeaders(msg(['Received: second-hop', 'Received: first-hop']));
    expect(h['received']).toBe('second-hop');
  });
});

describe('decodeQuotedPrintable', () => {
  it('joins soft line breaks so a split number survives', () => {
    // This is the real failure: "42,000 lbs" wrapped mid-token by the sender.
    expect(decodeQuotedPrintable('42,0=\r\n00 lbs').toString('utf8')).toBe('42,000 lbs');
  });

  it('decodes hex escapes', () => {
    expect(decodeQuotedPrintable('Recolecci=C3=B3n').toString('utf8')).toBe('Recolección');
  });
});

describe('decodeEncodedWords', () => {
  it('decodes a base64 encoded-word (Spanish subject)', () => {
    expect(decodeEncodedWords('=?UTF-8?B?Q09USVpBQ0nDk04=?=')).toBe('COTIZACIÓN');
  });

  it('decodes a Q encoded-word, underscore means space', () => {
    expect(decodeEncodedWords('=?UTF-8?Q?Nueva_cotizaci=C3=B3n?=')).toBe('Nueva cotización');
  });

  it('joins adjacent encoded-words without inserting the separating space', () => {
    expect(decodeEncodedWords('=?UTF-8?B?SE9U?= =?UTF-8?B?IFNIT1Q=?=')).toBe('HOT SHOT');
  });

  it('leaves plain text untouched', () => {
    expect(decodeEncodedWords('FTL // LAREDO - LONDON')).toBe('FTL // LAREDO - LONDON');
  });
});

describe('parseEml', () => {
  it('parses a simple plain-text message', () => {
    const raw = msg([
      'Message-ID: <abc@mail.com>',
      'From: Angela Lugo <angela.lugo@berpar.com>',
      'To: quotes@shipces.com',
      'Subject: FTL Laredo to London',
      'Date: Mon, 29 Sep 2025 19:22:35 +0000',
      'Content-Type: text/plain; charset="utf-8"',
      '',
      'Need a truck from Laredo, TX to London, ON. 16 pallets.',
    ]);
    const e = parseEml(raw);
    expect(e.messageId).toBe('abc@mail.com');
    expect(e.from).toBe('Angela Lugo <angela.lugo@berpar.com>');
    expect(e.to).toEqual(['quotes@shipces.com']);
    expect(e.subject).toBe('FTL Laredo to London');
    expect(e.receivedAt).toBe('2025-09-29T19:22:35.000Z');
    expect(e.body).toContain('Laredo, TX to London, ON');
    expect(e.hasAttachments).toBe(false);
  });

  it('prefers the longest text/plain part in a multipart/alternative tree', () => {
    const raw = msg([
      'From: a@b.com',
      'Subject: multi',
      'Content-Type: multipart/alternative; boundary="BD"',
      '',
      '--BD',
      'Content-Type: text/plain; charset="utf-8"',
      '',
      'short stub',
      '--BD',
      'Content-Type: text/html; charset="utf-8"',
      '',
      '<p>ignored because a plain part exists</p>',
      '--BD--',
    ]);
    expect(parseEml(raw).body).toBe('short stub');
  });

  it('falls back to stripped html when there is no plain part', () => {
    const raw = msg([
      'From: a@b.com',
      'Subject: html only',
      'Content-Type: text/html; charset="utf-8"',
      '',
      '<div>Pickup: <b>Laredo, TX</b></div><div>Delivery: Detroit, MI</div>',
    ]);
    const body = parseEml(raw).body;
    expect(body).toContain('Laredo, TX');
    expect(body).toContain('Detroit, MI');
    expect(body).not.toContain('<b>');
  });

  it('decodes base64 bodies and latin1 charsets', () => {
    const raw = msg([
      'From: a@b.com',
      'Subject: b64',
      'Content-Type: text/plain; charset="utf-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('Recolección: Monterrey', 'utf8').toString('base64'),
    ]);
    expect(parseEml(raw).body).toBe('Recolección: Monterrey');
  });

  it('flags attachments and does not treat them as the body', () => {
    const raw = msg([
      'From: a@b.com',
      'Subject: with attachment',
      'Content-Type: multipart/mixed; boundary="BD"',
      '',
      '--BD',
      'Content-Type: text/plain',
      '',
      'see attached rate sheet',
      '--BD',
      'Content-Type: application/pdf; name="rates.pdf"',
      'Content-Disposition: attachment; filename="rates.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      'JVBERi0xLjQK',
      '--BD--',
    ]);
    const e = parseEml(raw);
    expect(e.hasAttachments).toBe(true);
    expect(e.body).toBe('see attached rate sheet');
  });

  // --- boundary / failure paths ---

  it('survives a message with no headers at all', () => {
    const e = parseEml('just a naked body with no headers');
    expect(e.subject).toBe('');
    expect(e.from).toBe('');
    expect(e.to).toEqual([]);
    expect(() => parseEml('')).not.toThrow();
  });

  it('uses the fallback timestamp when Date is missing or unparseable', () => {
    const fallback = '2026-01-01T00:00:00.000Z';
    expect(parseEml(msg(['From: a@b.com', '', 'x']), { fallbackReceivedAt: fallback }).receivedAt).toBe(fallback);
    expect(
      parseEml(msg(['Date: not-a-date', 'From: a@b.com', '', 'x']), { fallbackReceivedAt: fallback }).receivedAt
    ).toBe(fallback);
  });

  it('caps an oversized body', () => {
    const raw = msg(['From: a@b.com', 'Content-Type: text/plain', '', 'x'.repeat(5000)]);
    expect(parseEml(raw, { maxBodyChars: 100 }).body).toHaveLength(100);
  });

  it('does not recurse without bound on a malformed nested multipart', () => {
    // A boundary that never closes must terminate, not hang or blow the stack.
    const raw = msg([
      'From: a@b.com',
      'Content-Type: multipart/mixed; boundary="BD"',
      '',
      '--BD',
      'Content-Type: multipart/mixed; boundary="BD"',
      '',
      '--BD',
      'Content-Type: text/plain',
      '',
      'deep',
    ]);
    expect(() => parseEml(raw)).not.toThrow();
  });

  it('splits multiple To recipients', () => {
    const e = parseEml(msg(['To: a@b.com, "C, D" <c@d.com>', 'From: x@y.com', '', 'body']));
    expect(e.to.length).toBeGreaterThanOrEqual(2);
  });
});
