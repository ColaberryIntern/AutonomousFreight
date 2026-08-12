/**
 * RFC 822 / MIME `.eml` reader, mapping a raw message file onto the canonical
 * `InboundEmail` contract.
 *
 * This is the third mapper into that same contract, alongside `mapGmailMessage`
 * (Gmail API) and `mapGraphMessage` (Microsoft Graph). Keeping all three behind
 * one output shape is what lets the RMS parser stay ignorant of where an email
 * came from: a live mailbox, a Graph poll, or a `.eml` file on disk.
 *
 * Its immediate job is the regression corpus. Real broker RFQs are messy in ways
 * synthetic fixtures never are (base64 Spanish subjects, quoted-printable soft
 * line breaks mid-number, html-only bodies, forwarded chains), so the corpus is
 * only honest if we read the raw bytes the way a mail client would.
 *
 * Deliberately dependency-free: same reasoning as `stripHtml`, no DOM and no
 * mailparser, so it runs identically in tests, scripts and the container.
 */
import { stripHtml } from './htmlText';

/** A parsed MIME part: its headers plus its decoded text (if it is text). */
interface MimePart {
  contentType: string;
  charset: string;
  encoding: string;
  disposition: string;
  filename?: string;
  raw: string;
}

/** Decode a quoted-printable body, honouring soft line breaks (`=` at EOL). */
export function decodeQuotedPrintable(input: string): Buffer {
  const joined = input.replace(/=(?:\r\n|\n|\r)/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === '=' && i + 2 < joined.length && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(joined.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/** Node knows utf8/latin1/ascii; map the common mail charset spellings onto them. */
function bufferEncodingFor(charset: string): BufferEncoding {
  const c = charset.toLowerCase().replace(/["']/g, '').trim();
  if (c === 'utf-8' || c === 'utf8') return 'utf8';
  if (c === 'us-ascii' || c === 'ascii') return 'ascii';
  // iso-8859-1 / windows-1252 / anything else single-byte: latin1 keeps bytes
  // recoverable rather than replacing them with U+FFFD.
  return 'latin1';
}

function decodeBody(raw: string, encoding: string, charset: string): string {
  const enc = encoding.toLowerCase().trim();
  const target = bufferEncodingFor(charset);
  if (enc === 'base64') {
    return Buffer.from(raw.replace(/\s+/g, ''), 'base64').toString(target);
  }
  if (enc === 'quoted-printable') {
    return decodeQuotedPrintable(raw).toString(target);
  }
  return Buffer.from(raw, 'binary').toString(target);
}

/**
 * Decode RFC 2047 encoded-words in a header value, e.g.
 * `=?UTF-8?B?Q09USVpBQ0nDk04=?=` -> `COTIZACIÓN`. Spanish RFQ subjects in the
 * corpus are almost always encoded this way; without this the lane and customer
 * never match.
 */
export function decodeEncodedWords(value: string): string {
  // Adjacent encoded-words separated only by whitespace are a single logical
  // run and the whitespace between them is not content (RFC 2047 section 6.2).
  const collapsed = value.replace(/\?=\s+=\?/g, '?==?');
  return collapsed.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset: string, kind: string, text: string) => {
    const target = bufferEncodingFor(charset);
    try {
      if (kind.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString(target);
      }
      // Q encoding: like quoted-printable but `_` means space.
      return decodeQuotedPrintable(text.replace(/_/g, ' ')).toString(target);
    } catch {
      return text;
    }
  });
}

/** Split a raw message into its header block and body, tolerating CRLF or LF. */
function splitHeadersBody(raw: string): { headerBlock: string; body: string } {
  const m = raw.match(/\r?\n\r?\n/);
  if (!m || m.index === undefined) return { headerBlock: raw, body: '' };
  return { headerBlock: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) };
}

/** Parse a header block into a lowercase-keyed map, unfolding continuation lines. */
export function parseHeaders(headerBlock: string): Record<string, string> {
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, ' ');
  const out: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    // First occurrence wins; trace headers repeat and the earliest is the one
    // the message itself declared.
    if (!(key in out)) out[key] = val;
  }
  return out;
}

function paramFrom(headerValue: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|([^;\\s]+))`, 'i');
  const m = headerValue.match(re);
  return m ? (m[2] ?? m[3]) : undefined;
}

/** Recursively flatten a MIME tree into a list of leaf parts. */
function flattenParts(headers: Record<string, string>, body: string, depth = 0): MimePart[] {
  const ctHeader = headers['content-type'] || 'text/plain';
  const contentType = (ctHeader.split(';')[0] || 'text/plain').trim().toLowerCase();
  const filename = paramFrom(headers['content-disposition'] ?? '', 'filename') ?? paramFrom(ctHeader, 'name');
  const part: MimePart = {
    contentType,
    charset: paramFrom(ctHeader, 'charset') ?? 'utf-8',
    encoding: (headers['content-transfer-encoding'] ?? '7bit').toLowerCase(),
    disposition: ((headers['content-disposition'] ?? '').split(';')[0] ?? '').trim().toLowerCase(),
    raw: body,
    ...(filename === undefined ? {} : { filename }),
  };

  const boundary = paramFrom(ctHeader, 'boundary');
  // Depth cap: a malformed or hostile message must not recurse without bound.
  if (!contentType.startsWith('multipart/') || !boundary || depth > 8) return [part];

  const marker = `--${boundary}`;
  const chunks = body.split(new RegExp(`^${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(--)?\\s*$`, 'm'));
  const out: MimePart[] = [];
  // chunks[0] is the preamble before the first boundary; skip it.
  for (const chunk of chunks.slice(1)) {
    if (!chunk || !chunk.trim()) continue;
    const sub = splitHeadersBody(chunk.replace(/^\r?\n/, ''));
    out.push(...flattenParts(parseHeaders(sub.headerBlock), sub.body, depth + 1));
  }
  return out.length > 0 ? out : [part];
}

export interface EmlParseOptions {
  /** Hard cap on body length. Real forwarded chains can run to megabytes. */
  maxBodyChars?: number;
  /** Fallback when the file carries no Date header. */
  fallbackReceivedAt?: string;
}

export interface ParsedEml {
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  receivedAt: string;
  hasAttachments: boolean;
}

const DEFAULT_MAX_BODY = 100_000;

/**
 * Parse a raw `.eml` into the `InboundEmail` shape.
 *
 * Body selection mirrors the Gmail and Graph engines: prefer the richest
 * `text/plain` part, fall back to `stripHtml` over `text/html`, so the RFQ
 * extractors see the same kind of text regardless of source.
 */
export function parseEml(raw: string, opts: EmlParseOptions = {}): ParsedEml {
  const maxBody = opts.maxBodyChars ?? DEFAULT_MAX_BODY;
  const { headerBlock, body } = splitHeadersBody(raw);
  const headers = parseHeaders(headerBlock);
  const parts = flattenParts(headers, body);

  const isAttachment = (p: MimePart) => p.disposition === 'attachment' || (!!p.filename && p.disposition !== 'inline');
  const inline = parts.filter((p) => !isAttachment(p));

  const decode = (p: MimePart) => decodeBody(p.raw, p.encoding, p.charset).trim();

  // Prefer the longest text/plain: forwarded chains often carry a short stub
  // part plus the real content further down the tree.
  const plains = inline.filter((p) => p.contentType === 'text/plain').map(decode).filter((s) => s.length > 0);
  let text = plains.sort((a, b) => b.length - a.length)[0] || '';

  if (!text) {
    const htmls = inline.filter((p) => p.contentType === 'text/html').map(decode).filter((s) => s.length > 0);
    const html = htmls.sort((a, b) => b.length - a.length)[0];
    if (html) text = stripHtml(html);
  }
  const only = parts.length === 1 ? parts[0] : undefined;
  if (!text && only) text = decode(only);

  const rawDate = headers['date'];
  let receivedAt = opts.fallbackReceivedAt ?? '';
  if (rawDate) {
    const d = new Date(rawDate);
    if (!Number.isNaN(d.getTime())) receivedAt = d.toISOString();
  }
  if (!receivedAt) receivedAt = opts.fallbackReceivedAt ?? new Date(0).toISOString();

  const toList = decodeEncodedWords(headers['to'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return {
    messageId: (headers['message-id'] || '').replace(/^<|>$/g, '').trim(),
    from: decodeEncodedWords(headers['from'] || '').trim(),
    to: toList,
    subject: decodeEncodedWords(headers['subject'] || '').trim(),
    body: text.length > maxBody ? text.slice(0, maxBody) : text,
    receivedAt,
    hasAttachments: parts.some(isAttachment),
  };
}
