/**
 * mapGraphMessage — Microsoft Graph message → canonical InboundEmail (pure).
 * Happy path (html body stripped, from/to formatting, internetMessageId as id),
 * boundary (text body kept as-is, missing fields, bodyPreview fallback, cap).
 * No network.
 */
import { mapGraphMessage, type GraphMessage } from '../../../services/adapters/src/email/msGraphEmailEngine';

describe('mapGraphMessage', () => {
  it('maps a QuotesTeam-style html message (happy path)', () => {
    const msg: GraphMessage = {
      id: 'AAMk-local-id',
      internetMessageId: '<CADf9=abc@mail.gmail.com>',
      subject: 'RFQ: Laredo to Nashville',
      receivedDateTime: '2026-07-15T14:03:00Z',
      hasAttachments: true,
      from: { emailAddress: { name: 'Maria Garcia', address: 'mgarcia@laredoparts.mx' } },
      toRecipients: [{ emailAddress: { address: 'QuotesTeam@shipces.com' } }, { emailAddress: { address: 'ops@shipces.com' } }],
      body: { contentType: 'html', content: '<div>8500 lbs engine parts<br>Laredo, TX to Nashville, TN</div><style>x{}</style>' },
    };
    const e = mapGraphMessage(msg);
    expect(e.messageId).toBe('<CADf9=abc@mail.gmail.com>'); // internetMessageId preferred for dedup parity
    expect(e.from).toBe('Maria Garcia <mgarcia@laredoparts.mx>');
    expect(e.to).toEqual(['QuotesTeam@shipces.com', 'ops@shipces.com']);
    expect(e.subject).toBe('RFQ: Laredo to Nashville');
    expect(e.body).toContain('8500 lbs engine parts');
    expect(e.body).toContain('Laredo, TX to Nashville, TN');
    expect(e.body).not.toContain('<');
    expect(e.receivedAt).toBe('2026-07-15T14:03:00Z');
    expect(e.hasAttachments).toBe(true);
  });

  it('keeps text bodies as-is, falls back to bodyPreview, tolerates missing fields (boundary)', () => {
    const textMsg = mapGraphMessage({
      id: 'id-1',
      subject: 'quote',
      body: { contentType: 'text', content: '  El Paso to Detroit, sprinter  ' },
    });
    expect(textMsg.messageId).toBe('id-1'); // no internetMessageId -> falls back to id
    expect(textMsg.body).toBe('El Paso to Detroit, sprinter');
    expect(textMsg.from).toBe('');
    expect(textMsg.to).toEqual([]);
    expect(textMsg.hasAttachments).toBeUndefined();

    const previewMsg = mapGraphMessage({ id: 'id-2', bodyPreview: 'preview text', body: { contentType: 'html', content: '' } });
    expect(previewMsg.body).toBe('preview text');

    const addrOnly = mapGraphMessage({ id: 'id-3', from: { emailAddress: { address: 'john@ces.com' } } });
    expect(addrOnly.from).toBe('john@ces.com'); // no name -> bare address
  });

  it('caps oversized bodies (boundary)', () => {
    const big = mapGraphMessage({ id: 'id-big', body: { contentType: 'text', content: 'y'.repeat(400) } }, 50);
    expect(big.body.length).toBe(50);
  });
});
