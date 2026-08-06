/**
 * mapGmailMessage — Gmail API payload → canonical InboundEmail (pure mapper).
 * Happy path (nested multipart, base64url plain text), boundary (html-only
 * body stripped, missing parts, body cap), and header handling. No network.
 */
import { mapGmailMessage } from '../../../services/adapters/src/email/gmailApiEmailEngine';

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('mapGmailMessage', () => {
  it('maps a nested multipart message with base64url plain text (happy path)', () => {
    const email = mapGmailMessage({
      id: 'msg-123',
      internalDate: '1779148800000', // fixed epoch ms
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'Maria Garcia <mgarcia@laredoparts.mx>' },
          { name: 'To', value: 'quotes@shipces.com, ops@shipces.com' },
          { name: 'Subject', value: 'FW: necesitamos mover carga' },
        ],
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              { mimeType: 'text/plain', body: { data: b64url('8500 pounds from Laredo, TX to Nashville, TN') } },
              { mimeType: 'text/html', body: { data: b64url('<p>8500 pounds</p>') } },
            ],
          },
          { mimeType: 'application/pdf', filename: 'bol.pdf', body: { attachmentId: 'att-1' } },
        ],
      },
    });
    expect(email.messageId).toBe('msg-123');
    expect(email.from).toBe('Maria Garcia <mgarcia@laredoparts.mx>');
    expect(email.to).toEqual(['quotes@shipces.com', 'ops@shipces.com']);
    expect(email.subject).toBe('FW: necesitamos mover carga');
    expect(email.body).toBe('8500 pounds from Laredo, TX to Nashville, TN'); // plain preferred over html
    expect(email.receivedAt).toBe(new Date(1779148800000).toISOString());
    expect(email.hasAttachments).toBe(true);
  });

  it('falls back to stripped html, then snippet; missing headers stay empty (boundary)', () => {
    const htmlOnly = mapGmailMessage({
      id: 'msg-html',
      payload: {
        mimeType: 'text/html',
        headers: [{ name: 'Subject', value: 'quote' }],
        body: { data: b64url('<div>Need a <b>sprinter</b><br>El Paso to Detroit</div><style>p{}</style>') },
      },
    });
    expect(htmlOnly.body).toContain('Need a sprinter');
    expect(htmlOnly.body).toContain('El Paso to Detroit');
    expect(htmlOnly.body).not.toContain('<');
    expect(htmlOnly.to).toEqual([]);
    expect(htmlOnly.from).toBe('');

    const bare = mapGmailMessage({ id: 'msg-bare', snippet: 'snippet only' });
    expect(bare.body).toBe('snippet only');
    expect(bare.hasAttachments).toBeUndefined();
  });

  it('caps oversized bodies (boundary)', () => {
    const big = mapGmailMessage(
      { id: 'msg-big', payload: { mimeType: 'text/plain', headers: [], body: { data: b64url('x'.repeat(500)) } } },
      100,
    );
    expect(big.body.length).toBe(100);
  });
});
