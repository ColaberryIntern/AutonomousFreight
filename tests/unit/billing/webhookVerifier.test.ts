import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../../../services/billing/src/domain/webhookVerifier';

const SECRET = 'whsec_test_1234567890';

function signed(body: string, secret = SECRET, ts = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  return `t=${ts},v1=${v1}`;
}

describe('verifyWebhookSignature', () => {
  it('accepts a fresh, correctly-signed payload', () => {
    const body = '{"type":"invoice.paid"}';
    expect(verifyWebhookSignature(body, signed(body), SECRET)).toBe(true);
  });

  it('rejects when signature is wrong', () => {
    const body = '{"type":"invoice.paid"}';
    expect(verifyWebhookSignature(body, signed(body, 'other-secret'), SECRET)).toBe(false);
  });

  it('rejects when body has been tampered with', () => {
    const body = '{"type":"invoice.paid"}';
    const hdr = signed(body);
    expect(verifyWebhookSignature('{"type":"invoice.refunded"}', hdr, SECRET)).toBe(false);
  });

  it('rejects when timestamp is too old', () => {
    const body = '{"type":"invoice.paid"}';
    const hdr = signed(body, SECRET, Math.floor(Date.now() / 1000) - 10_000);
    expect(verifyWebhookSignature(body, hdr, SECRET)).toBe(false);
  });

  it('rejects malformed header', () => {
    expect(verifyWebhookSignature('{}', 'garbage', SECRET)).toBe(false);
  });
});
